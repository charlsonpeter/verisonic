"""HTTP client for the external Findlio lyrics/subtitle service."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int, str], None]


class FindlioClientError(Exception):
    pass


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


def _base_url() -> str:
    return settings.FINDLIO_SERVICE_URL.rstrip("/")


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.FINDLIO_SERVICE_API_KEY}"}


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
    progress_callback: Optional[ProgressCallback] = None,
    poll_interval_sec: float = 2.5,
    timeout_sec: float = 900,
) -> FindlioResult:
    """Create a Findlio job (file upload or audio_url) and poll until complete."""
    if not findlio_service_configured():
        raise FindlioClientError("FINDLIO_SERVICE_URL and FINDLIO_SERVICE_API_KEY are required")
    if not audio_file_path and not audio_url:
        raise FindlioClientError("audio_file_path or audio_url is required")

    data: dict[str, Any] = {
        "media_type": "music",
        "mode": mode,
        "script_mode": script_mode,
        "title": title,
        "artist": artist,
        "formats": "lyrics,lrc,json",
    }
    if album:
        data["album"] = album
    if duration is not None:
        data["duration"] = str(duration)
    if lyrics_text:
        data["lyrics_text"] = lyrics_text
    if audio_url:
        data["audio_url"] = audio_url

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
        raise FindlioClientError(_error_message(resp))

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
            raise FindlioClientError(_error_message(status_resp))

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
            raise FindlioClientError(err.get("message") or f"Findlio job {status}")

        time.sleep(poll_interval_sec)
    else:
        raise FindlioClientError("Timed out waiting for Findlio job")

    if progress_callback:
        progress_callback("result", 90, "Fetching Findlio result...")

    try:
        result_resp = requests.get(
            f"{_base_url()}/v1/jobs/{job_id}/result",
            headers=_headers(),
            timeout=60,
        )
    except requests.RequestException as exc:
        raise FindlioClientError(f"Failed to fetch Findlio result: {exc}") from exc

    if result_resp.status_code >= 400:
        raise FindlioClientError(_error_message(result_resp))

    payload = result_resp.json()
    formats = payload.get("formats") or {}
    plain = formats.get("lyrics") or ""
    lrc = formats.get("lrc") or ""
    timed = formats.get("json") or []
    if not plain and not lrc and not timed:
        raise FindlioClientError("Findlio returned empty lyrics")

    return FindlioResult(
        lrc_text=lrc,
        plain_lyrics=plain or lrc,
        timed=timed if isinstance(timed, list) else [],
        language=payload.get("language"),
        source=payload.get("source") or "findlio",
    )


def _error_message(resp: requests.Response) -> str:
    try:
        data = resp.json()
        detail = data.get("detail")
        if isinstance(detail, dict):
            return detail.get("message") or detail.get("code") or resp.text
        if isinstance(detail, str):
            return detail
        return resp.text
    except Exception:
        return resp.text or f"HTTP {resp.status_code}"
