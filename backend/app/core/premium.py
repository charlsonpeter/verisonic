import datetime
from typing import Optional

from app.models import User


def is_trial_active(user: User) -> bool:
    if not user.created_at:
        return False
    delta = datetime.datetime.utcnow() - user.created_at
    return 0 <= delta.days <= 7


def paid_subscription_is_active(user: User) -> bool:
    if user.subscription == "unlimited":
        return True
    if user.subscription != "premium":
        return False
    if user.subscription_expires_at is None:
        return True
    return user.subscription_expires_at > datetime.datetime.utcnow()


def user_has_premium(user: Optional[User]) -> bool:
    if user is None:
        return False
    real_role = getattr(user, "_real_role", None) or user.role
    if real_role == "admin":
        return True
    if real_role in ("studio_admin", "radio_admin") and user.role != "listener":
        return True
    if user.subscription in ("premium", "unlimited") and paid_subscription_is_active(user):
        return True
    if user.subscription == "free" and is_trial_active(user):
        return True
    return False
