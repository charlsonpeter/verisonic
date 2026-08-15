"""HTTP client for the external Findlio lyrics/subtitle service."""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int, str], None]


class FindlioClientError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: Optional[str] = None,
        status_code: Optional[int] = None,
    ):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


@dataclass
class FindlioResult:
    lrc_text: str
    plain_lyrics: str
    timed: list[dict[str, Any]]
    language: Optional[str] = None
    source: str = "findlio"


def findlio_service_configured() -> bool:
    return bool(
        (settings.FINDLIO_SERVICE_URL or "").strip()
        and (settings.FINDLIO_SERVICE_API_KEY or "").strip()
    )


def lyrics_extraction_available() -> bool:
    return bool(settings.LYRICS_EXTRACTION_ENABLED) or findlio_service_configured()


def _base_url() -> str:
    return settings.FINDLIO_SERVICE_URL.rstrip("/")


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.FINDLIO_SERVICE_API_KEY}"}


def idempotency_key(
    *,
    track_id: int,
    mode: str,
    script_mode: str,
    lyrics_text: Optional[str] = None,
) -> str:
    digest = hashlib.sha256((lyrics_text or "").encode("utf-8")).hexdigest()[:16]
    return f"verisonic:{track_id}:{mode}:{script_mode}:{digest}"


def webhook_url_for_track(track_id: int) -> Optional[str]:
    template = (settings.FINDLIO_WEBHOOK_URL or "").strip()
    secret = (settings.FINDLIO_WEBHOOK_SECRET or "").strip()
    if not template or not secret:
        return None
    return template.replace("{track_id}", str(track_id))


def verify_webhook_signature(body: bytes, signature_header: str) -> bool:
    secret = (settings.FINDLIO_WEBHOOK_SECRET or "").strip()
    header = (signature_header or "").strip()
    if not secret or not header:
        return False
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    wanted = header if header.startswith("sha256=") else f"sha256={header}"
    return hmac.compare_digest(f"sha256={digest}", wanted)


def result_from_payload(payload: dict[str, Any], *, source: Optional[str] = None) -> FindlioResult:
    formats = payload.get("formats") or {}
    plain = formats.get("lyrics") or payload.get("lyrics") or ""
    lrc = formats.get("lrc") or ""
    timed = formats.get("json") or payload.get("timed") or []
    if not isinstance(timed, list):
        timed = []
    if not plain and not lrc and not timed:
        raise FindlioClientError("Findlio returned empty lyrics")
    return FindlioResult(
        lrc_text=lrc,
        plain_lyrics=plain or lrc,
        timed=timed,
        language=payload.get("language"),
        source=source or payload.get("source") or "findlio",
    )


def apply_result_to_track(track: Any, result: FindlioResult) -> None:
    if result.timed:
        track.lyrics = result.lrc_text or result.plain_lyrics
        track.lyrics_timed = result.timed
    else:
        track.lyrics = result.plain_lyrics or result.lrc_text
        track.lyrics_timed = result.timed or None
    if result.language:
        track.lyrics_language = result.language


def lookup_catalog_lyrics(
    *,
    title: str,
    artist: str,
    album: Optional[str] = None,
) -> Optional[FindlioResult]:
    """Reuse an existing Findlio catalog entry. No new job and no charge."""
    if not findlio_service_configured() or not (title or "").strip():
        return None
    try:
        match_resp = requests.get(
            f"{_base_url()}/v1/developer/catalog/match",
            headers=_headers(),
            params={
                "media_type": "music",
                "title": title,
                "artist": artist,
                "album": album or "",
            },
            timeout=15,
        )
    except requests.RequestException as exc:
        logger.warning("Findlio catalog match failed: %s", exc)
        return None
    if match_resp.status_code >= 400:
        return None
    try:
        match = match_resp.json()
    except ValueError:
        return None
    entry_id = match.get("id") if match.get("found") else None
    if not entry_id:
        return None
    try:
        pickup_resp = requests.get(
            f"{_base_url()}/v1/developer/lyrics/{entry_id}",
            headers=_headers(),
            timeout=20,
        )
    except requests.RequestException as exc:
        logger.warning("Findlio catalog pickup failed: %s", exc)
        return None
    if pickup_resp.status_code >= 400:
        return None
    try:
        payload = pickup_resp.json()
    except ValueError:
        return None
    try:
        return result_from_payload(payload, source="findlio_catalog")
    except FindlioClientError:
        return None


def fetch_job_result(job_id: str) -> FindlioResult:
    if not findlio_service_configured():
        raise FindlioClientError("FINDLIO_SERVICE_URL and FINDLIO_SERVICE_API_KEY are required")
    try:
        result_resp = requests.get(
            f"{_base_url()}/v1/jobs/{job_id}/result",
            headers=_headers(),
            timeout=60,
        )
    except requests.RequestException as exc:
        raise FindlioClientError(f"Failed to fetch Findlio result: {exc}") from exc
    if result_resp.status_code >= 400:
        _raise_http(result_resp)
    return result_from_payload(result_resp.json())


def create_and_wait_job(
    *,
    title: str,
    artist: str,
    mode: str,
    script_mode: str = "native",
    album: Optional[str] = None,
    duration: Optional[float] = None,
    lyrics_text: Optional[str] = None,
    audio_file_path: Optional[str] = None,
    audio_url: Optional[str] = None,
    track_id: Optional[int] = None,
    progress_callback: Optional[ProgressCallback] = None,
    poll_interval_sec: float = 2.5,
    timeout_sec: float = 900,
) -> FindlioResult:
    """Create a Findlio job (file upload or audio_url) and poll until complete."""
    if not findlio_service_configured():
        raise FindlioClientError("FINDLIO_SERVICE_URL and FINDLIO_SERVICE_API_KEY are required")
    if not audio_file_path and not audio_url:
        raise FindlioClientError("audio_file_path or audio_url is required")

    reuse_catalog = mode == "extract" and not (lyrics_text or "").strip()
    if reuse_catalog and (script_mode or "native") == "native":
        if progress_callback:
            progress_callback("catalog", 8, "Checking Findlio catalog...")
        cached = lookup_catalog_lyrics(title=title, artist=artist, album=album)
        if cached:
            if progress_callback:
                progress_callback("catalog", 90, "Reused lyrics from Findlio catalog")
            return cached

    data: dict[str, Any] = {
        "media_type": "music",
        "mode": mode,
        "script_mode": script_mode,
        "title": title,
        "artist": artist,
        "formats": "lyrics,lrc,json",
        "auto_publish": "true" if settings.FINDLIO_AUTO_PUBLISH else "false",
    }
    if album:
        data["album"] = album
    if duration is not None:
        data["duration"] = str(duration)
    if lyrics_text:
        data["lyrics_text"] = lyrics_text
    if audio_url:
        data["audio_url"] = audio_url
    if track_id is not None:
        data["idempotency_key"] = idempotency_key(
            track_id=track_id,
            mode=mode,
            script_mode=script_mode,
            lyrics_text=lyrics_text,
        )
        hook = webhook_url_for_track(track_id)
        if hook:
            data["webhook_url"] = hook

    if progress_callback:
        progress_callback("queue", 10, "Submitting job to Findlio...")

    files = None
    file_handle = None
    try:
        if audio_file_path and not audio_url:
            file_handle = open(audio_file_path, "rb")
            files = {"audio": (audio_file_path.split("/")[-1], file_handle)}

        resp = requests.post(
            f"{_base_url()}/v1/jobs",
            headers=_headers(),
            data=data,
            files=files,
            timeout=300,
        )
    except requests.RequestException as exc:
        raise FindlioClientError(f"Failed to reach Findlio: {exc}") from exc
    finally:
        if file_handle is not None:
            file_handle.close()

    if resp.status_code >= 400:
        _raise_http(resp)

    created = resp.json()
    job_id = created.get("id")
    if not job_id:
        raise FindlioClientError("Findlio did not return a job id")

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            status_resp = requests.get(
                f"{_base_url()}/v1/jobs/{job_id}",
                headers=_headers(),
                timeout=30,
            )
        except requests.RequestException as exc:
            raise FindlioClientError(f"Failed to poll Findlio: {exc}") from exc

        if status_resp.status_code >= 400:
            _raise_http(status_resp)

        body = status_resp.json()
        status = body.get("status")
        progress = body.get("progress") or {}
        if progress_callback:
            progress_callback(
                progress.get("stage") or status or "running",
                int(progress.get("percent") or 20),
                progress.get("message") or f"Findlio status: {status}",
            )

        if status == "succeeded":
            break
        if status in ("failed", "cancelled"):
            err = body.get("error") or {}
            raise FindlioClientError(
                err.get("message") or f"Findlio job {status}",
                code=err.get("code"),
            )

        time.sleep(poll_interval_sec)
    else:
        raise FindlioClientError("Timed out waiting for Findlio job")

    if progress_callback:
        progress_callback("result", 90, "Fetching Findlio result...")

    return fetch_job_result(job_id)


def _raise_http(resp: requests.Response) -> None:
    code = None
    message = resp.text or f"HTTP {resp.status_code}"
    try:
        data = resp.json()
        detail = data.get("detail")
        if isinstance(detail, dict):
            code = detail.get("code")
            message = detail.get("message") or code or message
        elif isinstance(detail, str):
            message = detail
    except Exception:
        pass
    if resp.status_code == 402 or code == "insufficient_wallet":
        message = (
            message
            or "Findlio wallet balance is too low. Top up the developer wallet."
        )
    elif resp.status_code == 429 or code == "quota_exceeded":
        message = message or "Findlio monthly quota exceeded."
    elif resp.status_code == 403 or code in ("subscription_required", "developer_required"):
        message = message or "Findlio generation requires an active plan or wallet."
    raise FindlioClientError(message, code=code, status_code=resp.status_code)
