from typing import Optional

import redis

from app.core.config import settings

_redis_client: Optional[redis.Redis] = None


def get_redis() -> Optional[redis.Redis]:
    global _redis_client
    if _redis_client is not None:
        try:
            _redis_client.ping()
            return _redis_client
        except Exception:
            _redis_client = None
    try:
        client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=0,
            decode_responses=False,
            socket_connect_timeout=2,
        )
        client.ping()
        _redis_client = client
        return client
    except Exception:
        return None
