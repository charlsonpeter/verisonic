from functools import lru_cache
from typing import Optional

import redis

from app.core.config import settings


@lru_cache(maxsize=1)
def get_redis() -> Optional[redis.Redis]:
    try:
        client = redis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            db=0,
            decode_responses=False,
            socket_connect_timeout=2,
        )
        client.ping()
        return client
    except Exception:
        return None
