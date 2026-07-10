from fastapi import HTTPException, Request, status

from app.core.redis_client import get_redis

LOGIN_LIMIT = 10
LOGIN_WINDOW_SEC = 60


def enforce_rate_limit(request: Request, bucket: str, limit: int = LOGIN_LIMIT, window_sec: int = LOGIN_WINDOW_SEC) -> None:
    client = get_redis()
    if client is None:
        return

    ip = request.client.host if request.client else "unknown"
    key = f"ratelimit:{bucket}:{ip}"
    count = client.incr(key)
    if count == 1:
        client.expire(key, window_sec)
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later.",
        )
