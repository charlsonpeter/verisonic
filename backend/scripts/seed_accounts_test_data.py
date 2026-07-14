#!/usr/bin/env python3
"""Seed demo data for the Accounts admin page (owners, subscriptions, withdrawals).

Listens are recorded without realtime credits. Daily settlement distributes each
subscriber's creator pool by listen duration, then wallets are credited.

Usage (Docker):
  docker exec -w /app verisonic_backend env PYTHONPATH=/app python scripts/seed_accounts_test_data.py
  docker exec -w /app verisonic_backend env PYTHONPATH=/app python scripts/seed_accounts_test_data.py --reset

Local:
  cd backend && PYTHONPATH=. python scripts/seed_accounts_test_data.py

All demo accounts use password: demo12345
"""
from __future__ import annotations

import argparse
import datetime
import uuid

from sqlalchemy import func

from app.core.security import get_password_hash
from app.core.subscription_plans import get_plan
from app.db.session import SessionLocal
from app.models import (
    Artist,
    BillableTrackPlay,
    DailySettlementCredit,
    DailySettlementRun,
    OwnerBankAccount,
    OwnerWallet,
    RadioListenSession,
    RadioStation,
    SubscriptionPayment,
    Track,
    User,
    WalletLedgerEntry,
    WithdrawalRequest,
)
from app.services.billing_period import stamp_payment_billing_period
from app.services.daily_settlement_service import settle_day
from app.services.revenue_settings_service import get_revenue_settings
from app.services.subscription_service import apply_admin_subscription
from app.services.wallet_service import (
    BankDetails,
    encrypt_withdrawal_bank_snapshot,
    get_or_create_wallet,
    upsert_bank_account,
)

DEMO_DOMAIN = "accounts-demo.verisonic.local"
DEMO_PASSWORD = "demo12345"
# Multiple days of listens so daily settlement produces visible owner balances.
TRACK_PLAY_DAY_COUNT = 45
# Premium must start before the earliest seeded play date (exclusive of expiry).
PREMIUM_ACTIVE_DAYS = TRACK_PLAY_DAY_COUNT + 5
PREMIUM_REMAINING_DAYS = 10


def demo_email(local: str) -> str:
    return f"{local}@{DEMO_DOMAIN}"


def is_demo_email(email: str) -> bool:
    return email.endswith(f"@{DEMO_DOMAIN}")


def utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def days_ago(n: int) -> datetime.datetime:
    return utcnow() - datetime.timedelta(days=n)


def play_dates(count: int, *, end_days_ago: int = 1) -> list[str]:
    """Ascending ISO dates ending `end_days_ago` days before today."""
    end = (utcnow() - datetime.timedelta(days=end_days_ago)).date()
    start = end - datetime.timedelta(days=count - 1)
    return [(start + datetime.timedelta(days=i)).isoformat() for i in range(count)]


def dates_while_premium(listener: User, dates: list[str]) -> list[str]:
    """Keep only UTC dates the listener was premium (same gate as settlement)."""
    activated = listener.subscription_activated_at
    expires = listener.subscription_expires_at
    out: list[str] = []
    for play_date in dates:
        day = datetime.date.fromisoformat(play_date)
        day_start = datetime.datetime.combine(day, datetime.time.min)
        if activated is not None and activated.date() > day:
            continue
        if expires is not None and expires <= day_start:
            continue
        out.append(play_date)
    return out


def reset_demo_data(db) -> int:
    demo_users = db.query(User).filter(User.email.like(f"%@{DEMO_DOMAIN}")).all()
    if not demo_users:
        return 0
    demo_ids = [u.id for u in demo_users]

    db.query(WithdrawalRequest).filter(WithdrawalRequest.user_id.in_(demo_ids)).delete(
        synchronize_session=False
    )
    db.query(DailySettlementCredit).filter(
        DailySettlementCredit.owner_user_id.in_(demo_ids)
    ).delete(synchronize_session=False)
    orphaned_runs = (
        db.query(DailySettlementRun.id)
        .outerjoin(
            DailySettlementCredit,
            DailySettlementCredit.run_id == DailySettlementRun.id,
        )
        .group_by(DailySettlementRun.id)
        .having(func.count(DailySettlementCredit.id) == 0)
        .all()
    )
    if orphaned_runs:
        db.query(DailySettlementRun).filter(
            DailySettlementRun.id.in_([r[0] for r in orphaned_runs])
        ).delete(synchronize_session=False)

    db.query(BillableTrackPlay).filter(
        (BillableTrackPlay.owner_user_id.in_(demo_ids))
        | (BillableTrackPlay.listener_user_id.in_(demo_ids))
    ).delete(synchronize_session=False)
    db.query(RadioListenSession).filter(
        (RadioListenSession.owner_user_id.in_(demo_ids))
        | (RadioListenSession.listener_user_id.in_(demo_ids))
    ).delete(synchronize_session=False)

    artist_ids = [
        row[0]
        for row in db.query(Artist.id).filter(Artist.user_id.in_(demo_ids)).all()
    ]
    if artist_ids:
        db.query(Track).filter(Track.artist_id.in_(artist_ids)).delete(synchronize_session=False)

    db.query(RadioStation).filter(RadioStation.owner_id.in_(demo_ids)).delete(synchronize_session=False)
    db.query(OwnerBankAccount).filter(OwnerBankAccount.user_id.in_(demo_ids)).delete(synchronize_session=False)

    wallet_ids = [
        row[0]
        for row in db.query(OwnerWallet.id).filter(OwnerWallet.user_id.in_(demo_ids)).all()
    ]
    if wallet_ids:
        db.query(WalletLedgerEntry).filter(WalletLedgerEntry.wallet_id.in_(wallet_ids)).delete(
            synchronize_session=False
        )
    db.query(OwnerWallet).filter(OwnerWallet.user_id.in_(demo_ids)).delete(synchronize_session=False)
    db.query(SubscriptionPayment).filter(SubscriptionPayment.user_id.in_(demo_ids)).delete(
        synchronize_session=False
    )

    for user in demo_users:
        db.delete(user)
    db.flush()
    return len(demo_users)


def ensure_user(
    db,
    *,
    local: str,
    full_name: str,
    role: str,
    subscription: str = "free",
    subscription_cycle: str | None = None,
    cancel_at_period_end: bool = False,
) -> User:
    email = demo_email(local)
    user = db.query(User).filter(User.email == email).first()
    if user is None:
        user = User(
            email=email,
            hashed_password=get_password_hash(DEMO_PASSWORD),
            full_name=full_name,
            role=role,
            must_reset_password=False,
        )
        db.add(user)
        db.flush()
    else:
        user.full_name = full_name
        user.role = role
        user.hashed_password = get_password_hash(DEMO_PASSWORD)

    apply_admin_subscription(user, subscription, subscription_cycle, db)
    if subscription == "premium":
        # Cover every seeded play/radio day: free listeners cannot produce billable plays.
        user.subscription_activated_at = days_ago(PREMIUM_ACTIVE_DAYS)
        user.subscription_expires_at = days_ago(-PREMIUM_REMAINING_DAYS)
    user.subscription_cancel_at_period_end = cancel_at_period_end
    db.flush()
    return user


def ensure_studio(db, local: str, stage_name: str, full_name: str) -> tuple[User, Artist]:
    user = ensure_user(db, local=local, full_name=full_name, role="studio_admin")
    artist = db.query(Artist).filter(Artist.user_id == user.id).first()
    if artist is None:
        artist = Artist(
            user_id=user.id,
            stage_name=stage_name,
            bio=f"Demo studio profile for {stage_name}.",
            profile_complete=True,
            is_active=True,
        )
        db.add(artist)
        db.flush()
    else:
        artist.stage_name = stage_name
    return user, artist


def ensure_radio_owner(db, local: str, station_name: str, full_name: str) -> tuple[User, RadioStation]:
    user = ensure_user(db, local=local, full_name=full_name, role="radio_admin")
    station = (
        db.query(RadioStation)
        .filter(RadioStation.owner_id == user.id, RadioStation.name == station_name)
        .first()
    )
    if station is None:
        station = RadioStation(
            name=station_name,
            description=f"Demo radio station — {station_name}",
            owner_id=user.id,
            is_active=True,
            stream_key=f"demo_{local}_{uuid.uuid4().hex[:8]}",
        )
        db.add(station)
        db.flush()
    return user, station


def ensure_track(db, artist: Artist, title: str) -> Track:
    track = (
        db.query(Track)
        .filter(Track.artist_id == artist.id, Track.title == title)
        .first()
    )
    if track is None:
        track = Track(
            title=title,
            artist_id=artist.id,
            duration=210.0,
            file_format="FLAC",
            bitrate=1411,
            sample_rate=44100,
            bit_depth=16,
            channels=2,
            quality_score=88,
            quality_level="Studio Quality",
            approved=True,
        )
        db.add(track)
        db.flush()
    return track


def add_track_plays(
    db,
    *,
    owner: User,
    track: Track,
    listener: User,
    dates: list[str],
    settings,
    listened_seconds: float | None = None,
) -> int:
    """Insert qualifying listens only for dates the listener was premium."""
    billable_dates = dates_while_premium(listener, dates)
    seconds = listened_seconds
    if seconds is None:
        seconds = max(float(settings.min_track_seconds), float(track.duration or 0) * 0.5)
    count = 0
    for play_date in billable_dates:
        exists = (
            db.query(BillableTrackPlay.id)
            .filter(
                BillableTrackPlay.listener_user_id == listener.id,
                BillableTrackPlay.track_id == track.id,
                BillableTrackPlay.play_date == play_date,
            )
            .first()
        )
        if exists:
            continue
        day = datetime.date.fromisoformat(play_date)
        created_at = datetime.datetime(day.year, day.month, day.day, 12, 0, 0)
        db.add(
            BillableTrackPlay(
                listener_user_id=listener.id,
                track_id=track.id,
                owner_user_id=owner.id,
                listened_seconds=seconds,
                credit_paise=0,
                play_date=play_date,
                created_at=created_at,
            )
        )
        count += 1
    db.flush()
    return count


def add_radio_session(
    db,
    *,
    owner: User,
    station: RadioStation,
    listener: User,
    total_seconds: int,
    token_suffix: str,
    started_days_ago: int,
) -> int:
    """Insert a closed radio session (seconds only; settlement credits later)."""
    token = f"demo_session_{token_suffix}"
    exists = (
        db.query(RadioListenSession.id)
        .filter(RadioListenSession.session_token == token)
        .first()
    )
    if exists:
        return 0

    started = days_ago(started_days_ago)
    ended = started + datetime.timedelta(seconds=total_seconds)
    db.add(
        RadioListenSession(
            session_token=token,
            listener_user_id=listener.id,
            station_id=station.id,
            owner_user_id=owner.id,
            total_seconds=total_seconds,
            total_credit_paise=0,
            is_active=False,
            started_at=started,
            ended_at=ended,
            last_heartbeat_at=ended,
        )
    )
    db.flush()
    return total_seconds


def add_withdrawal(
    db,
    *,
    user: User,
    amount_paise: int,
    bank: BankDetails,
    created_days_ago: int,
    settings,
) -> bool:
    """Debit wallet + ledger and insert a paid withdrawal (same shape as request_withdrawal)."""
    if amount_paise < settings.min_withdrawal_paise:
        return False
    wallet = get_or_create_wallet(db, user.id, for_update=True)
    if amount_paise > wallet.balance_paise:
        return False

    created_at = days_ago(created_days_ago)
    wallet.balance_paise -= amount_paise
    wallet.updated_at = created_at
    snapshot = encrypt_withdrawal_bank_snapshot(bank)
    req = WithdrawalRequest(
        user_id=user.id,
        amount_paise=amount_paise,
        status="paid",
        created_at=created_at,
        processed_at=created_at,
        account_holder_name=snapshot["account_holder_name"],
        bank_name=snapshot["bank_name"],
        account_number_masked=snapshot["account_number_masked"],
        ifsc_code=snapshot["ifsc_code"],
    )
    db.add(req)
    db.flush()
    db.add(
        WalletLedgerEntry(
            wallet_id=wallet.id,
            amount_paise=-amount_paise,
            entry_type="withdrawal",
            description="Bank withdrawal",
            reference_id=f"withdrawal:{req.id}",
            listener_user_id=None,
            created_at=created_at,
        )
    )
    db.flush()
    return True


def maybe_withdraw_half(
    db,
    *,
    user: User,
    bank: BankDetails,
    settings,
    created_days_ago: int,
) -> int:
    """Withdraw one min-sized chunk if balance allows, leaving remainder as available."""
    wallet = get_or_create_wallet(db, user.id)
    min_w = settings.min_withdrawal_paise
    # Leave some balance visible on the Accounts page when possible.
    amount = min_w
    if wallet.balance_paise >= min_w * 2:
        amount = (wallet.balance_paise // (2 * min_w)) * min_w
        amount = max(min_w, min(amount, wallet.balance_paise - min_w))
    elif wallet.balance_paise < min_w:
        return 0
    else:
        amount = min_w

    ok = add_withdrawal(
        db,
        user=user,
        amount_paise=amount,
        bank=bank,
        created_days_ago=created_days_ago,
        settings=settings,
    )
    return amount if ok else 0


def add_subscription_payment(
    db,
    *,
    user: User,
    plan_id: str,
    status: str,
    created_days_ago: int,
    suffix: str,
) -> None:
    order_id = f"demo_order_{user.id}_{suffix}"
    exists = (
        db.query(SubscriptionPayment.id)
        .filter(SubscriptionPayment.razorpay_order_id == order_id)
        .first()
    )
    if exists:
        return
    plan = get_plan(plan_id, db) or get_plan("premium_monthly", db)
    if plan is None:
        raise RuntimeError("Subscription plans are not configured")
    paid_at = days_ago(created_days_ago - 1) if status == "paid" else None
    payment = SubscriptionPayment(
        user_id=user.id,
        plan_id=plan.id,
        amount_paise=plan.amount_paise,
        currency=plan.currency,
        razorpay_order_id=order_id,
        razorpay_payment_id=f"demo_pay_{suffix}" if status == "paid" else None,
        status=status,
        created_at=days_ago(created_days_ago),
        paid_at=paid_at,
    )
    if status == "paid":
        stamp_payment_billing_period(payment, user)
    db.add(payment)


def _fmt_inr(paise: int) -> str:
    return f"₹{paise / 100:.2f}"


def seed(db) -> None:
    settings = get_revenue_settings(db)

    # --- Premium listeners (subscriptions tab) ---
    listener_active_m = ensure_user(
        db,
        local="listener.monthly",
        full_name="Demo Listener Monthly",
        role="listener",
        subscription="premium",
        subscription_cycle="monthly",
    )
    listener_active_y = ensure_user(
        db,
        local="listener.yearly",
        full_name="Demo Listener Yearly",
        role="listener",
        subscription="premium",
        subscription_cycle="yearly",
    )
    listener_pending = ensure_user(
        db,
        local="listener.pending",
        full_name="Demo Listener Pending Pay",
        role="listener",
        subscription="premium",
        subscription_cycle="monthly",
    )
    listener_failed = ensure_user(
        db,
        local="listener.failed",
        full_name="Demo Listener Failed Pay",
        role="listener",
        subscription="premium",
        subscription_cycle="monthly",
    )
    listener_cancelled = ensure_user(
        db,
        local="listener.cancelled",
        full_name="Demo Listener Cancelled",
        role="listener",
        subscription="premium",
        subscription_cycle="monthly",
        cancel_at_period_end=True,
    )

    add_subscription_payment(
        db, user=listener_active_m, plan_id="premium_monthly", status="paid",
        created_days_ago=PREMIUM_ACTIVE_DAYS, suffix="m1",
    )
    add_subscription_payment(
        db, user=listener_active_y, plan_id="premium_yearly", status="paid",
        created_days_ago=PREMIUM_ACTIVE_DAYS, suffix="y1",
    )
    add_subscription_payment(
        db, user=listener_pending, plan_id="premium_monthly", status="paid",
        created_days_ago=PREMIUM_ACTIVE_DAYS, suffix="p0",
    )
    add_subscription_payment(
        db, user=listener_pending, plan_id="premium_monthly", status="created",
        created_days_ago=3, suffix="p1",
    )
    add_subscription_payment(
        db, user=listener_failed, plan_id="premium_monthly", status="paid",
        created_days_ago=PREMIUM_ACTIVE_DAYS, suffix="f0",
    )
    add_subscription_payment(
        db, user=listener_failed, plan_id="premium_monthly", status="failed",
        created_days_ago=2, suffix="f1",
    )
    add_subscription_payment(
        db, user=listener_cancelled, plan_id="premium_monthly", status="paid",
        created_days_ago=PREMIUM_ACTIVE_DAYS, suffix="c1",
    )

    play_listeners = [listener_active_m, listener_active_y, listener_cancelled]
    dates = play_dates(TRACK_PLAY_DAY_COUNT)

    # --- Studio owners ---
    studio1_user, studio1_artist = ensure_studio(
        db, "studio.aurora", "Aurora Sound Studio", "Priya Mehta",
    )
    studio2_user, studio2_artist = ensure_studio(
        db, "studio.midnight", "Midnight Records", "Arjun Nair",
    )

    t1 = ensure_track(db, studio1_artist, "Golden Hour")
    t2 = ensure_track(db, studio1_artist, "Neon Skies")
    t3 = ensure_track(db, studio2_artist, "Late Night Drive")

    # Duration-weighted listens (studio1 gets more seconds than studio2)
    for listener in play_listeners:
        add_track_plays(
            db, owner=studio1_user, track=t1, listener=listener, dates=dates,
            settings=settings, listened_seconds=3600,
        )
        add_track_plays(
            db, owner=studio1_user, track=t2, listener=listener, dates=dates,
            settings=settings, listened_seconds=1800,
        )
    for listener in (listener_active_m, listener_active_y):
        add_track_plays(
            db, owner=studio2_user, track=t3, listener=listener,
            dates=dates[: max(20, TRACK_PLAY_DAY_COUNT // 2)],
            settings=settings, listened_seconds=600,
        )

    bank_studio1 = BankDetails(
        account_holder_name="Priya Mehta",
        bank_name="HDFC Bank",
        account_number="501001234567",
        ifsc_code="HDFC0001234",
    )
    bank_studio2 = BankDetails(
        account_holder_name="Arjun Nair",
        bank_name="ICICI Bank",
        account_number="601009876543",
        ifsc_code="ICIC0005678",
    )
    upsert_bank_account(
        db,
        user_id=studio1_user.id,
        account_holder_name=bank_studio1.account_holder_name,
        bank_name=bank_studio1.bank_name,
        account_number=bank_studio1.account_number,
        ifsc_code=bank_studio1.ifsc_code,
    )
    upsert_bank_account(
        db,
        user_id=studio2_user.id,
        account_holder_name=bank_studio2.account_holder_name,
        bank_name=bank_studio2.bank_name,
        account_number=bank_studio2.account_number,
        ifsc_code=bank_studio2.ifsc_code,
    )

    # --- Radio owner ---
    radio_user, radio_station = ensure_radio_owner(
        db, "radio.wavefm", "Wave FM", "Sneha Reddy",
    )
    bank_radio = BankDetails(
        account_holder_name="Sneha Reddy",
        bank_name="SBI",
        account_number="300123456789",
        ifsc_code="SBIN0000456",
    )
    upsert_bank_account(
        db,
        user_id=radio_user.id,
        account_holder_name=bank_radio.account_holder_name,
        bank_name=bank_radio.bank_name,
        account_number=bank_radio.account_number,
        ifsc_code=bank_radio.ifsc_code,
    )

    for i, (listener, sec, ago) in enumerate(
        (
            (listener_active_m, 6 * 3600, 8),
            (listener_active_y, 10 * 3600, 5),
            (listener_cancelled, 4 * 3600, 3),
            (listener_active_m, 5 * 3600, 2),
        ),
        start=1,
    ):
        add_radio_session(
            db,
            owner=radio_user,
            station=radio_station,
            listener=listener,
            total_seconds=sec,
            token_suffix=f"w{i}",
            started_days_ago=ago,
        )

    db.flush()

    # Settle every seeded play date (+ radio days) via daily settlement
    settle_dates = set(dates)
    for ago in (8, 5, 3, 2):
        settle_dates.add((utcnow() - datetime.timedelta(days=ago)).date().isoformat())
    for date_str in sorted(settle_dates):
        settle_day(db, date_str, force=True)

    def _earned(user_id: int) -> int:
        return int(
            db.query(func.coalesce(func.sum(WalletLedgerEntry.amount_paise), 0))
            .join(OwnerWallet, OwnerWallet.id == WalletLedgerEntry.wallet_id)
            .filter(
                OwnerWallet.user_id == user_id,
                WalletLedgerEntry.entry_type == "daily_settlement",
            )
            .scalar()
            or 0
        )

    studio1_earned = _earned(studio1_user.id)
    studio2_earned = _earned(studio2_user.id)
    radio_earned = _earned(radio_user.id)

    studio1_withdrawn = maybe_withdraw_half(
        db,
        user=studio1_user,
        bank=bank_studio1,
        settings=settings,
        created_days_ago=12,
    )
    w1 = get_or_create_wallet(db, studio1_user.id)
    if w1.balance_paise >= settings.min_withdrawal_paise * 2:
        extra = settings.min_withdrawal_paise
        if add_withdrawal(
            db,
            user=studio1_user,
            amount_paise=extra,
            bank=bank_studio1,
            created_days_ago=4,
            settings=settings,
        ):
            studio1_withdrawn += extra

    studio2_withdrawn = 0

    radio_withdrawn = maybe_withdraw_half(
        db,
        user=radio_user,
        bank=bank_radio,
        settings=settings,
        created_days_ago=6,
    )

    db.commit()

    s1_bal = get_or_create_wallet(db, studio1_user.id).balance_paise
    s2_bal = get_or_create_wallet(db, studio2_user.id).balance_paise
    r_bal = get_or_create_wallet(db, radio_user.id).balance_paise

    print("Accounts demo data seeded successfully.\n")
    print(f"  Password for all demo users: {DEMO_PASSWORD}\n")
    print("  Credits applied via daily user-centric settlement (duration-weighted).\n")
    print("  Subscriptions (Accounts → Subscriptions):")
    for local, note in [
        ("listener.monthly", "Active · paid"),
        ("listener.yearly", "Active · paid yearly"),
        ("listener.pending", "Latest payment pending"),
        ("listener.failed", "Latest payment failed"),
        ("listener.cancelled", "Cancelled at period end"),
    ]:
        print(f"    {demo_email(local)}  ({note})")
    print("\n  Owner accounts / Withdrawals:")
    print(
        f"    {demo_email('studio.aurora')}  "
        f"(earned {_fmt_inr(studio1_earned)}, withdrawn {_fmt_inr(studio1_withdrawn)}, "
        f"balance {_fmt_inr(s1_bal)})"
    )
    print(
        f"    {demo_email('studio.midnight')}  "
        f"(earned {_fmt_inr(studio2_earned)}, withdrawn {_fmt_inr(studio2_withdrawn)}, "
        f"balance {_fmt_inr(s2_bal)})"
    )
    print(
        f"    {demo_email('radio.wavefm')}  "
        f"(earned {_fmt_inr(radio_earned)}, withdrawn {_fmt_inr(radio_withdrawn)}, "
        f"balance {_fmt_inr(r_bal)})"
    )
    print("\n  Log in as admin@verisonic.com and open Accounts to review.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Accounts admin demo data")
    parser.add_argument(
        "--reset",
        action="store_true",
        help=f"Remove existing *@{DEMO_DOMAIN} users before seeding",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        if args.reset:
            removed = reset_demo_data(db)
            db.commit()
            if removed:
                print(f"Removed {removed} demo user(s).")
        elif db.query(User).filter(User.email.like(f"%@{DEMO_DOMAIN}")).first():
            print(
                f"Demo data already exists (*@{DEMO_DOMAIN}). "
                "Re-run with --reset to replace it."
            )
            return

        seed(db)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
