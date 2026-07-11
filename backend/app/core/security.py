import bcrypt
import secrets
from datetime import datetime, timedelta
from typing import Any, Union
from jose import jwt
from app.core.config import settings
from app.core.redis_client import get_redis

ALGORITHM = "HS256"
REFRESH_TOKEN_TTL_DAYS = 30


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


def _refresh_key(user_id: int) -> str:
    return f"auth:refresh:{user_id}"


def _store_refresh_jti(user_id: int, jti: str) -> None:
    client = get_redis()
    if client is None:
        if settings.REQUIRE_REDIS:
            raise RuntimeError("Redis is required for refresh token storage.")
        return
    client.setex(_refresh_key(user_id), REFRESH_TOKEN_TTL_DAYS * 86400, jti)


def validate_refresh_token(refresh_token: str) -> int:
    payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    user_id = payload.get("sub")
    token_type = payload.get("type")
    jti = payload.get("jti")
    if user_id is None or token_type != "refresh" or not jti:
        raise ValueError("Invalid refresh token")
    client = get_redis()
    if client is None:
        if settings.REQUIRE_REDIS:
            raise ValueError("Refresh token validation unavailable")
        return int(user_id)
    stored = client.get(_refresh_key(int(user_id)))
    if stored is None or stored.decode() != jti:
        raise ValueError("Refresh token revoked or expired")
    return int(user_id)


def revoke_refresh_token(user_id: int) -> None:
    client = get_redis()
    if client is None:
        return
    client.delete(_refresh_key(user_id))

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
