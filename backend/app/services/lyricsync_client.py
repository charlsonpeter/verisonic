"""HTTP client for the external LyricSync lyrics/subtitle service."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[str, int, str], None]


class LyricSyncClientError(Exception):
    pass


@dataclass
class LyricSyncResult:
    lrc_text: str
    timed: list[dict[str, Any]]
    language: Optional[str] = None
    source: str = "lyricsync"


def lyrics_service_configured() -> bool:
    return bool(
        (settings.LYRICS_SERVICE_URL or "").strip()
        and (settings.LYRICS_SERVICE_API_KEY or "").strip()
    )


def _base_url() -> str:
    return settings.LYRICS_SERVICE_URL.rstrip("/")


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.LYRICS_SERVICE_API_KEY}"}


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
) -> LyricSyncResult:
    """Create a LyricSync job (file upload or audio_url) and poll until complete."""
    if not lyrics_service_configured():
        raise LyricSyncClientError("LYRICS_SERVICE_URL and LYRICS_SERVICE_API_KEY are required")
    if not audio_file_path and not audio_url:
        raise LyricSyncClientError("audio_file_path or audio_url is required")

    data: dict[str, Any] = {
        "mode": mode,
        "script_mode": script_mode,
        "title": title,
        "artist": artist,
        "formats": "lrc,json",
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
        progress_callback("queue", 10, "Submitting job to LyricSync...")

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
        raise LyricSyncClientError(f"Failed to reach LyricSync: {exc}") from exc
    finally:
        if file_handle is not None:
            file_handle.close()

    if resp.status_code >= 400:
        raise LyricSyncClientError(_error_message(resp))

    created = resp.json()
    job_id = created.get("id")
    if not job_id:
        raise LyricSyncClientError("LyricSync did not return a job id")

    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            status_resp = requests.get(
                f"{_base_url()}/v1/jobs/{job_id}",
                headers=_headers(),
                timeout=30,
            )
        except requests.RequestException as exc:
            raise LyricSyncClientError(f"Failed to poll LyricSync: {exc}") from exc

        if status_resp.status_code >= 400:
            raise LyricSyncClientError(_error_message(status_resp))

        body = status_resp.json()
        status = body.get("status")
        progress = body.get("progress") or {}
        if progress_callback:
            progress_callback(
                progress.get("stage") or status or "running",
                int(progress.get("percent") or 20),
                progress.get("message") or f"LyricSync status: {status}",
            )

        if status == "succeeded":
            break
        if status in ("failed", "cancelled"):
            err = body.get("error") or {}
            raise LyricSyncClientError(err.get("message") or f"LyricSync job {status}")

        time.sleep(poll_interval_sec)
    else:
        raise LyricSyncClientError("Timed out waiting for LyricSync job")

    if progress_callback:
        progress_callback("result", 90, "Fetching LyricSync result...")

    try:
        result_resp = requests.get(
            f"{_base_url()}/v1/jobs/{job_id}/result",
            headers=_headers(),
            timeout=60,
        )
    except requests.RequestException as exc:
        raise LyricSyncClientError(f"Failed to fetch LyricSync result: {exc}") from exc

    if result_resp.status_code >= 400:
        raise LyricSyncClientError(_error_message(result_resp))

    payload = result_resp.json()
    formats = payload.get("formats") or {}
    lrc = formats.get("lrc") or ""
    timed = formats.get("json") or []
    if not lrc and not timed:
        raise LyricSyncClientError("LyricSync returned empty lyrics")

    return LyricSyncResult(
        lrc_text=lrc,
        timed=timed if isinstance(timed, list) else [],
        language=payload.get("language"),
        source=payload.get("source") or "lyricsync",
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
