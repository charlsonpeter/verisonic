from urllib.parse import urlparse

from fastapi import HTTPException


def validate_radio_stream_url(stream_url: str) -> str:
    value = (stream_url or "").strip()
    if not value:
        return value
    if value.startswith("/api/radio/") and value.endswith("/live"):
        return value
    raise HTTPException(
        status_code=400,
        detail="Only internal live broadcast URLs (/api/radio/{id}/live) are allowed.",
    )


def is_safe_listener_stream_url(stream_url: str) -> bool:
    value = (stream_url or "").strip()
    if not value:
        return False
    if value.startswith("/api/radio/"):
        return True
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)
