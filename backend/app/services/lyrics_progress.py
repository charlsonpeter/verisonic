"""Publish lyrics-transcription progress for WebSocket clients."""

from __future__ import annotations

import json
from typing import Any, Optional

from app.core.redis_client import get_redis

CHANNEL_PREFIX = "lyrics:transcribe:"
LATEST_KEY_TTL_SEC = 3600


def progress_channel(task_id: str) -> str:
    return f"{CHANNEL_PREFIX}{task_id}"


def latest_key(task_id: str) -> str:
    return f"{CHANNEL_PREFIX}{task_id}:latest"


def publish_lyrics_progress(task_id: str, payload: dict[str, Any]) -> None:
    """Store latest snapshot and pub/sub fan-out for live WebSocket clients."""
    client = get_redis()
    if not client:
        return
    try:
        body = json.dumps(payload, default=str)
        raw = body.encode("utf-8")
        client.setex(latest_key(task_id), LATEST_KEY_TTL_SEC, raw)
        client.publish(progress_channel(task_id), raw)
    except Exception:
        pass


def get_latest_lyrics_progress(task_id: str) -> Optional[dict[str, Any]]:
    client = get_redis()
    if not client:
        return None
    try:
        raw = client.get(latest_key(task_id))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)
    except Exception:
        return None
