"""Billing period helpers for user-centric daily revenue settlement."""
from __future__ import annotations

import calendar
import datetime
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.models import PlatformRevenueSettings, SubscriptionPayment, User
from app.services.subscription_service import add_calendar_month, add_calendar_year


def subtract_calendar_month(dt: datetime.datetime) -> datetime.datetime:
    """Move back one calendar month, clamping day (e.g. Mar 31 -> Feb 28/29)."""
    month = dt.month - 1
    year = dt.year
    if month < 1:
        month = 12
        year -= 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def subtract_calendar_year(dt: datetime.datetime) -> datetime.datetime:
    year = dt.year - 1
    day = min(dt.day, calendar.monthrange(year, dt.month)[1])
    return dt.replace(year=year, day=day)


def billing_cycle_days(period_start: datetime.date, period_end: datetime.date) -> int:
    """Exclusive end: 15 Jul → 15 Aug => 31 days."""
    days = (period_end - period_start).days
    return max(days, 1)


@dataclass(frozen=True)
class BillingPeriod:
    start: datetime.datetime
    end: datetime.datetime
    amount_paise: int
    cycle_days: int

    @property
    def daily_subscription_value_paise(self) -> int:
        return self.amount_paise // self.cycle_days


def _period_from_bounds(
    start: datetime.datetime,
    end: datetime.datetime,
    amount_paise: int,
) -> BillingPeriod:
    days = billing_cycle_days(start.date(), end.date())
    return BillingPeriod(start=start, end=end, amount_paise=amount_paise, cycle_days=days)


def _find_period_covering(
    *,
    expires_at: datetime.datetime,
    cycle: Optional[str],
    at: datetime.datetime,
    max_steps: int = 120,
) -> Optional[tuple[datetime.datetime, datetime.datetime]]:
    """Walk periods [start, end) ending at expires_at backward until `at` is covered."""
    cursor_end = expires_at
    for _ in range(max_steps):
        if cycle == "yearly":
            cursor_start = subtract_calendar_year(cursor_end)
        else:
            cursor_start = subtract_calendar_month(cursor_end)
        if cursor_start <= at < cursor_end:
            return cursor_start, cursor_end
        if at >= cursor_end:
            return None
        cursor_end = cursor_start
    return None


def resolve_subscription_amount_paise(
    db: Session,
    *,
    user: User,
    period_start: datetime.datetime,
    period_end: datetime.datetime,
    settings: PlatformRevenueSettings,
) -> int:
    payment = (
        db.query(SubscriptionPayment)
        .filter(
            SubscriptionPayment.user_id == user.id,
            SubscriptionPayment.status == "paid",
            SubscriptionPayment.billing_period_start.isnot(None),
            SubscriptionPayment.billing_period_end.isnot(None),
            SubscriptionPayment.billing_period_start <= period_start,
            SubscriptionPayment.billing_period_end >= period_end,
        )
        .order_by(SubscriptionPayment.paid_at.desc().nullslast(), SubscriptionPayment.id.desc())
        .first()
    )
    if payment is None:
        payment = (
            db.query(SubscriptionPayment)
            .filter(
                SubscriptionPayment.user_id == user.id,
                SubscriptionPayment.status == "paid",
                SubscriptionPayment.paid_at.isnot(None),
                SubscriptionPayment.paid_at >= period_start - datetime.timedelta(days=1),
                SubscriptionPayment.paid_at < period_end,
            )
            .order_by(SubscriptionPayment.paid_at.desc(), SubscriptionPayment.id.desc())
            .first()
        )
    if payment is not None and payment.amount_paise > 0:
        return int(payment.amount_paise)
    if user.subscription_cycle == "yearly":
        return int(settings.premium_yearly_paise)
    return int(settings.premium_monthly_paise)


def resolve_billing_period_for_date(
    db: Session,
    *,
    user: User,
    settlement_date: datetime.date,
    settings: PlatformRevenueSettings,
) -> Optional[BillingPeriod]:
    """Resolve the subscriber's billing period covering settlement_date (UTC)."""
    at = datetime.datetime.combine(settlement_date, datetime.time.min)

    payment = (
        db.query(SubscriptionPayment)
        .filter(
            SubscriptionPayment.user_id == user.id,
            SubscriptionPayment.status == "paid",
            SubscriptionPayment.billing_period_start.isnot(None),
            SubscriptionPayment.billing_period_end.isnot(None),
            SubscriptionPayment.billing_period_start <= at,
            SubscriptionPayment.billing_period_end > at,
        )
        .order_by(SubscriptionPayment.paid_at.desc().nullslast(), SubscriptionPayment.id.desc())
        .first()
    )
    if payment is not None and payment.billing_period_start and payment.billing_period_end:
        return _period_from_bounds(
            payment.billing_period_start,
            payment.billing_period_end,
            int(payment.amount_paise),
        )

    if user.subscription_expires_at is None:
        # Open-ended premium: use calendar month/year containing the day.
        cycle = user.subscription_cycle or "monthly"
        if cycle == "yearly":
            start = datetime.datetime(settlement_date.year, 1, 1)
            end = datetime.datetime(settlement_date.year + 1, 1, 1)
        else:
            start = datetime.datetime(settlement_date.year, settlement_date.month, 1)
            end = add_calendar_month(start)
        amount = resolve_subscription_amount_paise(
            db, user=user, period_start=start, period_end=end, settings=settings
        )
        return _period_from_bounds(start, end, amount)

    bounds = _find_period_covering(
        expires_at=user.subscription_expires_at,
        cycle=user.subscription_cycle or "monthly",
        at=at,
    )
    if bounds is None:
        return None
    start, end = bounds
    amount = resolve_subscription_amount_paise(
        db, user=user, period_start=start, period_end=end, settings=settings
    )
    return _period_from_bounds(start, end, amount)


def stamp_payment_billing_period(payment: SubscriptionPayment, user: User) -> None:
    """Attach the active period bounds to a payment after plan activation."""
    if user.subscription_expires_at is None:
        return
    end = user.subscription_expires_at
    cycle = user.subscription_cycle or "monthly"
    start = subtract_calendar_year(end) if cycle == "yearly" else subtract_calendar_month(end)
    payment.billing_period_start = start
    payment.billing_period_end = end
