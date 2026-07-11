"""Live stream broker with optional Redis fan-out for multi-instance deployments."""

import asyncio
import threading
from collections import deque
from typing import Dict, Optional, Set

from app.core.redis_client import get_redis

HISTORY_MAXLEN = 100
REDIS_HISTORY_MAXLEN = 100
LIVE_BROADCAST_TTL = 86400
MAX_LISTENERS_PER_STATION = 500


class LiveStreamManager:
    def __init__(self):
        self.listeners: Dict[int, Set[asyncio.Queue]] = {}
        self.broadcasters: Dict[int, bool] = {}
        self.history: Dict[int, deque] = {}
        self._redis = get_redis()
        self._redis_subscriber_started = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._ensure_redis_subscriber()

    def _ensure_redis_subscriber(self) -> None:
        if not self._redis or self._redis_subscriber_started:
            return
        self._redis_subscriber_started = True

        def _listen():
            pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
            pubsub.psubscribe("live:chunk:*")
            for message in pubsub.listen():
                if message.get("type") != "pmessage":
                    continue
                channel = message.get("channel", b"")
                if isinstance(channel, bytes):
                    channel = channel.decode()
                try:
                    station_id = int(channel.rsplit(":", 1)[-1])
                except (ValueError, IndexError):
                    continue
                chunk = message.get("data")
                if not chunk or not self._loop:
                    continue
                asyncio.run_coroutine_threadsafe(
                    self._ingest_remote_chunk(station_id, chunk),
                    self._loop,
                )

        threading.Thread(target=_listen, daemon=True, name="live-stream-redis").start()

    async def _ingest_remote_chunk(self, station_id: int, chunk: bytes) -> None:
        if self.broadcasters.get(station_id):
            return
        if station_id not in self.history:
            self.history[station_id] = deque(maxlen=HISTORY_MAXLEN)
        self.history[station_id].append(chunk)
        for q in list(self.listeners.get(station_id, set())):
            try:
                q.put_nowait(chunk)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(chunk)
                except Exception:
                    pass

    def is_live(self, station_id: int) -> bool:
        if self.broadcasters.get(station_id, False):
            return True
        if self._redis:
            return bool(self._redis.exists(f"live:broadcast:{station_id}"))
        return False

    def listener_count(self, station_id: int) -> int:
        return len(self.listeners.get(station_id, set()))

    def register_listener(self, station_id: int, skip_history: bool = False) -> asyncio.Queue:
        if isinstance(skip_history, str):
            skip_history = skip_history.lower() == "true"

        q: asyncio.Queue = asyncio.Queue(maxsize=10)
        listeners = self.listeners.setdefault(station_id, set())
        if len(listeners) >= MAX_LISTENERS_PER_STATION:
            raise RuntimeError("Listener capacity reached for this station")
        listeners.add(q)

        if not skip_history:
            history_data = b""
            if station_id in self.history and self.history[station_id]:
                history_data = b"".join(self.history[station_id])
            elif self._redis:
                chunks = self._redis.lrange(f"live:history:{station_id}", 0, -1)
                if chunks:
                    history_data = b"".join(chunks)
            if history_data:
                try:
                    q.put_nowait(history_data)
                except asyncio.QueueFull:
                    pass
        return q

    def unregister_listener(self, station_id: int, q: asyncio.Queue) -> None:
        if station_id in self.listeners:
            self.listeners[station_id].discard(q)
            if not self.listeners[station_id]:
                del self.listeners[station_id]

    async def broadcast_chunk(self, station_id: int, chunk: bytes) -> None:
        if station_id not in self.history:
            self.history[station_id] = deque(maxlen=HISTORY_MAXLEN)
        self.history[station_id].append(chunk)

        if self._redis:
            pipe = self._redis.pipeline()
            pipe.setex(f"live:broadcast:{station_id}", LIVE_BROADCAST_TTL, b"1")
            pipe.rpush(f"live:history:{station_id}", chunk)
            pipe.ltrim(f"live:history:{station_id}", -REDIS_HISTORY_MAXLEN, -1)
            pipe.expire(f"live:history:{station_id}", LIVE_BROADCAST_TTL)
            pipe.publish(f"live:chunk:{station_id}", chunk)
            pipe.execute()

        for q in list(self.listeners.get(station_id, set())):
            try:
                q.put_nowait(chunk)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(chunk)
                except Exception:
                    pass

        _wm = globals().get("webrtc_manager")
        if _wm is not None:
            await _wm.push_chunk(station_id, chunk)

    async def stop_broadcasting(self, station_id: int) -> None:
        self.broadcasters[station_id] = False
        if station_id in self.history:
            del self.history[station_id]
        if self._redis:
            self._redis.delete(f"live:broadcast:{station_id}", f"live:history:{station_id}")
        if station_id in self.listeners:
            for q in list(self.listeners[station_id]):
                try:
                    q.put_nowait(None)
                except Exception:
                    pass


live_stream_manager = LiveStreamManager()
