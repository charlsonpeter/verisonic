"""User-centric daily revenue settlement.

For each UTC day and each active premium subscriber:
  daily_value = subscription_amount / billing_cycle_days
  creator_pool = daily_value * owner_share_bps / 10000
  distribute creator_pool among creators that listener heard that day,
  weighted by valid listening seconds.
"""
from __future__ import annotations

import datetime
from collections import defaultdict
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import (
    BillableTrackPlay,
    DailySettlementCredit,
    DailySettlementRun,
    RadioListenSession,
    User,
    WalletLedgerEntry,
)
from app.services.billing_period import resolve_billing_period_for_date
from app.services.revenue_settings_service import get_revenue_settings
from app.services.wallet_service import credit_wallet, utcnow


def allocate_by_duration(pool_paise: int, seconds_by_owner: dict[int, float]) -> dict[int, int]:
    """Floor shares by duration weight; give remainder paise to the largest second count."""
    if pool_paise <= 0 or not seconds_by_owner:
        return {}
    total = sum(seconds_by_owner.values())
    if total <= 0:
        return {}

    owners = list(seconds_by_owner.keys())
    raw = {
        owner_id: (pool_paise * seconds_by_owner[owner_id]) / total
        for owner_id in owners
    }
    floors = {owner_id: int(raw[owner_id]) for owner_id in owners}
    allocated = sum(floors.values())
    remainder = pool_paise - allocated
    if remainder > 0:
        # Deterministic: highest seconds, then lowest owner id
        ranked = sorted(
            owners,
            key=lambda oid: (-seconds_by_owner[oid], oid),
        )
        for i in range(remainder):
            floors[ranked[i % len(ranked)]] += 1
    return {oid: amt for oid, amt in floors.items() if amt > 0}


def settlement_reference_id(settlement_date: str, owner_user_id: int) -> str:
    return f"settlement:{settlement_date}:owner:{owner_user_id}"


def _listener_owner_seconds(
    db: Session,
    *,
    listener_id: int,
    settlement_date: str,
) -> dict[int, float]:
    """Aggregate valid listen seconds for one listener on a UTC date (studio + radio)."""
    seconds: dict[int, float] = defaultdict(float)

    track_rows = (
        db.query(BillableTrackPlay.owner_user_id, func.sum(BillableTrackPlay.listened_seconds))
        .filter(
            BillableTrackPlay.listener_user_id == listener_id,
            BillableTrackPlay.play_date == settlement_date,
        )
        .group_by(BillableTrackPlay.owner_user_id)
        .all()
    )
    for owner_id, total in track_rows:
        if owner_id is not None and total:
            seconds[int(owner_id)] += float(total)

    day_start = datetime.datetime.strptime(settlement_date, "%Y-%m-%d")
    day_end = day_start + datetime.timedelta(days=1)
    radio_rows = (
        db.query(RadioListenSession.owner_user_id, func.sum(RadioListenSession.total_seconds))
        .filter(
            RadioListenSession.listener_user_id == listener_id,
            RadioListenSession.total_seconds > 0,
            RadioListenSession.started_at >= day_start,
            RadioListenSession.started_at < day_end,
        )
        .group_by(RadioListenSession.owner_user_id)
        .all()
    )
    for owner_id, total in radio_rows:
        if owner_id is not None and total:
            seconds[int(owner_id)] += float(total)

    return dict(seconds)


def _active_premium_listeners_on_date(db: Session, settlement_date: datetime.date) -> list[User]:
    """Premium listeners whose subscription covers the settlement day (UTC)."""
    day_start = datetime.datetime.combine(settlement_date, datetime.time.min)
    day_end = day_start + datetime.timedelta(days=1)
    rows = (
        db.query(User)
        .filter(
            User.subscription == "premium",
            User.is_active.is_(True),
            or_(
                User.subscription_expires_at.is_(None),
                User.subscription_expires_at > day_start,
            ),
            or_(
                User.subscription_activated_at.is_(None),
                User.subscription_activated_at < day_end,
            ),
        )
        .all()
    )
    return [u for u in rows if _was_billable_on_day(u, day_start)]


def _was_billable_on_day(user: User, day_start: datetime.datetime) -> bool:
    """Allow settlement for listeners who were premium that day even if expired since."""
    real_role = getattr(user, "_real_role", None) or user.role
    if real_role == "admin":
        return False
    if real_role in ("studio_admin", "radio_admin") and user.role != "listener":
        return False
    if user.subscription != "premium":
        return False
    if user.subscription_expires_at is not None and user.subscription_expires_at <= day_start:
        return False
    return True


def settle_day(
    db: Session,
    settlement_date: datetime.date | str,
    *,
    force: bool = False,
) -> DailySettlementRun:
    if isinstance(settlement_date, str):
        date_str = settlement_date
        date_obj = datetime.datetime.strptime(settlement_date, "%Y-%m-%d").date()
    else:
        date_obj = settlement_date
        date_str = settlement_date.isoformat()

    existing = (
        db.query(DailySettlementRun)
        .filter(DailySettlementRun.settlement_date == date_str)
        .first()
    )
    if existing is not None and existing.status == "completed" and not force:
        return existing

    settings = get_revenue_settings(db)
    now = utcnow()

    if existing is None:
        run = DailySettlementRun(
            settlement_date=date_str,
            status="running",
            started_at=now,
        )
        db.add(run)
        db.flush()
    else:
        run = existing
        if force and run.status == "completed":
            # Idempotent re-run: keep completed credits; only credit missing owners
            pass
        run.status = "running"
        run.started_at = now
        run.error_message = None
        db.flush()

    if not settings.daily_settlement_enabled:
        run.status = "skipped"
        run.finished_at = utcnow()
        run.error_message = "Daily settlement disabled in revenue settings"
        db.commit()
        db.refresh(run)
        return run

    try:
        owner_totals: dict[int, int] = defaultdict(int)
        listeners = _active_premium_listeners_on_date(db, date_obj)
        listeners_processed = 0
        min_seconds = max(1, int(settings.min_valid_daily_listen_seconds or 1))

        for listener in listeners:
            period = resolve_billing_period_for_date(
                db, user=listener, settlement_date=date_obj, settings=settings
            )
            if period is None or period.cycle_days <= 0:
                continue

            daily_value = period.daily_subscription_value_paise
            if daily_value <= 0:
                continue

            creator_pool = daily_value * int(settings.owner_share_bps) // 10000
            if creator_pool <= 0:
                continue

            seconds_by_owner = _listener_owner_seconds(
                db, listener_id=listener.id, settlement_date=date_str
            )
            total_seconds = sum(seconds_by_owner.values())
            if total_seconds < min_seconds:
                # Unallocated → platform retain
                continue

            shares = allocate_by_duration(creator_pool, seconds_by_owner)
            for owner_id, paise in shares.items():
                owner_totals[owner_id] += paise
            listeners_processed += 1

        owners_credited = 0
        total_credited = 0
        for owner_id, amount in sorted(owner_totals.items()):
            if amount <= 0:
                continue
            ref = settlement_reference_id(date_str, owner_id)
            already = (
                db.query(WalletLedgerEntry.id)
                .filter(WalletLedgerEntry.reference_id == ref)
                .first()
            )
            credit_row = (
                db.query(DailySettlementCredit)
                .filter(
                    DailySettlementCredit.settlement_date == date_str,
                    DailySettlementCredit.owner_user_id == owner_id,
                )
                .first()
            )
            if already is not None and credit_row is not None:
                owners_credited += 1
                total_credited += amount
                continue

            credited = credit_wallet(
                db,
                owner_user_id=owner_id,
                amount_paise=amount,
                entry_type="daily_settlement",
                description=f"Daily settlement {date_str}",
                reference_id=ref,
                listener_user_id=None,
            )
            if credit_row is None:
                db.add(
                    DailySettlementCredit(
                        run_id=run.id,
                        settlement_date=date_str,
                        owner_user_id=owner_id,
                        amount_paise=amount,
                    )
                )
            else:
                credit_row.amount_paise = amount
                credit_row.run_id = run.id

            if credited or already is not None:
                owners_credited += 1
                total_credited += amount

        run.listeners_processed = listeners_processed
        run.owners_credited = owners_credited
        run.total_credited_paise = total_credited
        run.status = "completed"
        run.finished_at = utcnow()
        db.commit()
        db.refresh(run)
        return run
    except Exception as exc:
        db.rollback()
        failed = (
            db.query(DailySettlementRun)
            .filter(DailySettlementRun.settlement_date == date_str)
            .first()
        )
        if failed is None:
            failed = DailySettlementRun(settlement_date=date_str)
            db.add(failed)
        failed.status = "failed"
        failed.error_message = str(exc)[:500]
        failed.finished_at = utcnow()
        db.commit()
        db.refresh(failed)
        raise


def settle_previous_utc_day(db: Session) -> DailySettlementRun:
    yesterday = (utcnow() - datetime.timedelta(days=1)).date()
    return settle_day(db, yesterday)
