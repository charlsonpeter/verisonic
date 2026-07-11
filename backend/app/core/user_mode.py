from typing import Optional

from app.core.redis_client import get_redis
from app.models import User
from sqlalchemy.orm.attributes import set_committed_value


def _mode_key(user_id: int) -> str:
    return f"user_mode:{user_id}"


def set_user_mode(user_id: int, mode: str) -> None:
    client = get_redis()
    if client is None:
        return
    if mode not in ("admin", "listener"):
        return
    client.setex(_mode_key(user_id), 86400 * 30, mode)


def get_user_mode(user_id: int) -> Optional[str]:
    client = get_redis()
    if client is None:
        return None
    value = client.get(_mode_key(user_id))
    if value is None:
        return None
    decoded = value.decode() if isinstance(value, bytes) else str(value)
    return decoded if decoded in ("admin", "listener") else None


def apply_user_mode(user: User) -> None:
    user._real_role = user.role
    stored_mode = get_user_mode(user.id)
    if stored_mode == "listener" and user.role in ("radio_admin", "studio_admin"):
        set_committed_value(user, "role", "listener")
