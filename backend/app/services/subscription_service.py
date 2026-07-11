"""Subscription lifecycle: active period, queued plan changes, cancellation."""
import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.core.subscription_plans import SubscriptionPlan, get_plan, plan_id_for_cycle
from app.models import User


def utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def premium_is_active(user: User, *, at: Optional[datetime.datetime] = None) -> bool:
    if user.subscription != "premium":
        return False
    if user.subscription_expires_at is None:
        return False
    return user.subscription_expires_at > (at or utcnow())


def current_plan_id(user: User) -> Optional[str]:
    if not premium_is_active(user):
        return None
    return plan_id_for_cycle(user.subscription_cycle or "")


def apply_plan_immediately(user: User, plan: SubscriptionPlan) -> None:
    now = utcnow()
    if premium_is_active(user):
        base = user.subscription_expires_at
    else:
        base = now
    user.subscription = plan.subscription
    user.subscription_cycle = plan.cycle
    user.subscription_expires_at = base + datetime.timedelta(days=plan.duration_days)
    user.pending_plan_id = None
    user.pending_plan_paid = False
    user.subscription_cancel_at_period_end = False


def queue_plan_change(user: User, plan: SubscriptionPlan, *, prepaid: bool) -> None:
    user.pending_plan_id = plan.id
    user.pending_plan_paid = prepaid
    user.subscription_cancel_at_period_end = False


def schedule_cancellation(user: User) -> None:
    user.subscription_cancel_at_period_end = True
    user.pending_plan_id = None
    user.pending_plan_paid = False


def clear_cancellation(user: User) -> None:
    user.subscription_cancel_at_period_end = False


def apply_pending_subscription_if_due(user: User, db: Session) -> bool:
    """Apply queued plan or cancellation when the current period has ended."""
    if user.subscription != "premium" or user.subscription_expires_at is None:
        return False
    if user.subscription_expires_at > utcnow():
        return False

    period_end = user.subscription_expires_at

    if user.subscription_cancel_at_period_end:
        user.subscription = "free"
        user.subscription_cycle = None
        user.subscription_expires_at = None
        user.pending_plan_id = None
        user.pending_plan_paid = False
        user.subscription_cancel_at_period_end = False
        db.commit()
        return True

    pending = get_plan(user.pending_plan_id) if user.pending_plan_id else None
    if pending and user.pending_plan_paid:
        user.subscription = pending.subscription
        user.subscription_cycle = pending.cycle
        user.subscription_expires_at = period_end + datetime.timedelta(days=pending.duration_days)
        user.pending_plan_id = None
        user.pending_plan_paid = False
        user.subscription_cancel_at_period_end = False
        db.commit()
        return True

    user.subscription = "free"
    user.subscription_cycle = None
    user.subscription_expires_at = None
    user.pending_plan_id = None
    user.pending_plan_paid = False
    user.subscription_cancel_at_period_end = False
    db.commit()
    return True


def validate_checkout_plan(user: User, plan: SubscriptionPlan) -> None:
    """Raise ValueError when checkout is not allowed for this user/plan."""
    from fastapi import HTTPException, status

    active = premium_is_active(user)
    if not active:
        return

    current_id = current_plan_id(user)
    if plan.id == current_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already subscribed to this plan.",
        )

    if user.pending_plan_id == plan.id and user.pending_plan_paid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This plan change is already scheduled and paid.",
        )

    if user.subscription_cycle == "monthly" and plan.cycle == "yearly":
        return

    if user.subscription_cycle == "yearly" and plan.cycle == "monthly":
        return

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="This plan change is not available for your current subscription.",
    )


def validate_schedule_change(user: User, plan: SubscriptionPlan) -> None:
    from fastapi import HTTPException, status

    if not premium_is_active(user):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active subscription to change.",
        )
    if user.subscription_cycle == "yearly" and plan.cycle == "monthly":
        return
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only yearly subscribers can schedule a switch to monthly.",
    )
