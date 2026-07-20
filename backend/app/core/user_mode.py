from typing import Optional

from app.core.redis_client import get_redis
from app.models import User
from sqlalchemy.orm import object_session
from sqlalchemy.orm.attributes import set_committed_value

_local_mode_cache: dict[int, str] = {}

STAFF_ROLES = frozenset({"radio_admin", "studio_admin", "admin"})


def _mode_key(user_id: int) -> str:
    return f"user_mode:{user_id}"


def set_user_mode(user_id: int, mode: str) -> None:
    if mode not in ("admin", "listener"):
        return
    client = get_redis()
    if client is not None:
        client.setex(_mode_key(user_id), 86400 * 30, mode)
    else:
        _local_mode_cache[user_id] = mode


def get_user_mode(user_id: int) -> Optional[str]:
    client = get_redis()
    if client is not None:
        value = client.get(_mode_key(user_id))
        if value is not None:
            decoded = value.decode() if isinstance(value, bytes) else str(value)
            if decoded in ("admin", "listener"):
                return decoded
    return _local_mode_cache.get(user_id)


def _resolve_db_role(user: User) -> str:
    """Return the persisted account role, not the listen-mode mask."""
    cached = getattr(user, "_real_role", None)
    if cached in STAFF_ROLES:
        return cached

    sess = object_session(user)
    if sess is not None:
        sess.expire(user, ["role"])
        sess.refresh(user, ["role"])
    return user.role


def apply_user_mode(user: User) -> None:
    db_role = _resolve_db_role(user)
    user._real_role = db_role
    stored_mode = get_user_mode(user.id)
    if stored_mode == "listener" and db_role in ("radio_admin", "studio_admin"):
        set_committed_value(user, "role", "listener")
    else:
        set_committed_value(user, "role", db_role)
