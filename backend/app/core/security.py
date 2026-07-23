import bcrypt
import secrets
from datetime import datetime, timedelta
from typing import Any, Union
from jose import jwt
from app.core.config import settings
from app.core.redis_client import get_redis

ALGORITHM = "HS256"
REFRESH_TOKEN_TTL_DAYS = 30
STREAM_TICKET_EXPIRE_MINUTES = 5
REFRESH_COOKIE_NAME = "verisonic_refresh"


def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def create_refresh_token(subject: Union[str, Any]) -> str:
    expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_TTL_DAYS)
    jti = secrets.token_urlsafe(16)
    to_encode = {"exp": expire, "sub": str(subject), "type": "refresh", "jti": jti}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    _store_refresh_jti(int(subject), jti)
    return encoded_jwt


def create_stream_ticket(user_id: int, track_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=STREAM_TICKET_EXPIRE_MINUTES)
    to_encode = {
        "exp": expire,
        "sub": str(user_id),
        "type": "stream",
        "track_id": track_id,
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def validate_stream_ticket(ticket: str, track_id: int) -> int:
    payload = jwt.decode(ticket, settings.SECRET_KEY, algorithms=[ALGORITHM])
    if payload.get("type") != "stream":
        raise ValueError("Invalid stream ticket")
    if int(payload.get("track_id", -1)) != track_id:
        raise ValueError("Stream ticket track mismatch")
    user_id = payload.get("sub")
    if user_id is None:
        raise ValueError("Invalid stream ticket subject")
    return int(user_id)


def _refresh_ttl_seconds() -> int:
    return REFRESH_TOKEN_TTL_DAYS * 86400


def _refresh_legacy_key(user_id: int) -> str:
    """Pre-multi-session key: single JTI string per user."""
    return f"auth:refresh:{user_id}"


def _refresh_session_key(user_id: int, jti: str) -> str:
    return f"auth:refresh:{user_id}:{jti}"


def _refresh_sessions_index_key(user_id: int) -> str:
    return f"auth:refresh:sessions:{user_id}"


def _decode_refresh_claims(refresh_token: str) -> tuple[int, str]:
    payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    token_type = payload.get("type")
    jti = payload.get("jti")
    if user_id is None or token_type != "refresh" or not jti:
        raise ValueError("Invalid refresh token")
    return int(user_id), str(jti)


def _store_refresh_jti(user_id: int, jti: str) -> None:
    """Register a refresh session. Multiple JTIs per user are allowed."""
    client = get_redis()
    if client is None:
        if settings.REQUIRE_REDIS:
            raise RuntimeError("Redis is required for refresh token storage.")
        return
    ttl = _refresh_ttl_seconds()
    pipe = client.pipeline()
    pipe.setex(_refresh_session_key(user_id, jti), ttl, "1")
    pipe.sadd(_refresh_sessions_index_key(user_id), jti)
    pipe.expire(_refresh_sessions_index_key(user_id), ttl)
    pipe.execute()


def validate_refresh_token(refresh_token: str) -> tuple[int, str]:
    """
    Validate a refresh JWT against Redis session storage.
    Returns (user_id, jti). Supports legacy single-JTI keys during migration.
    """
    uid, jti = _decode_refresh_claims(refresh_token)
    client = get_redis()
    if client is None:
        if settings.REQUIRE_REDIS:
            raise ValueError("Refresh token validation unavailable")
        return uid, jti

    if client.exists(_refresh_session_key(uid, jti)):
        return uid, jti

    # Legacy single-key format: migrate matching JTI into multi-session storage.
    legacy = client.get(_refresh_legacy_key(uid))
    if legacy is not None and legacy.decode() == jti:
        _store_refresh_jti(uid, jti)
        client.delete(_refresh_legacy_key(uid))
        return uid, jti

    if legacy is None and not client.exists(_refresh_sessions_index_key(uid)):
        # Dev/local: Redis may have been empty at login or wiped without persistence.
        # Accept a cryptographically valid refresh JWT and re-bind the JTI.
        # Production (REQUIRE_REDIS) still rejects missing JTIs.
        if settings.REQUIRE_REDIS:
            raise ValueError("Refresh token revoked or expired")
        _store_refresh_jti(uid, jti)
        return uid, jti

    raise ValueError("Refresh token revoked or expired")


def revoke_refresh_jti(user_id: int, jti: str) -> None:
    """Revoke a single refresh session (logout / refresh rotation)."""
    client = get_redis()
    if client is None:
        return
    pipe = client.pipeline()
    pipe.delete(_refresh_session_key(user_id, jti))
    pipe.srem(_refresh_sessions_index_key(user_id), jti)
    pipe.execute()
    legacy = client.get(_refresh_legacy_key(user_id))
    if legacy is not None and legacy.decode() == jti:
        client.delete(_refresh_legacy_key(user_id))


def revoke_refresh_token(user_id: int) -> None:
    """Revoke all refresh sessions for a user (password change / security reset)."""
    client = get_redis()
    if client is None:
        return
    index_key = _refresh_sessions_index_key(user_id)
    jtis = client.smembers(index_key) or set()
    pipe = client.pipeline()
    for raw in jtis:
        jti = raw.decode() if isinstance(raw, bytes) else str(raw)
        pipe.delete(_refresh_session_key(user_id, jti))
    pipe.delete(index_key)
    pipe.delete(_refresh_legacy_key(user_id))
    pipe.execute()


def revoke_refresh_session_token(refresh_token: str) -> None:
    """Best-effort revoke of the session encoded in a refresh JWT (logout)."""
    try:
        uid, jti = _decode_refresh_claims(refresh_token)
    except Exception:
        return
    revoke_refresh_jti(uid, jti)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8")
    )

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode("utf-8"),
        bcrypt.gensalt()
    ).decode("utf-8")
