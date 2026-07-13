#!/usr/bin/env python3
"""Seed demo data for the Accounts admin page (owners, subscriptions, withdrawals).

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

from app.core.security import get_password_hash
from app.core.subscription_plans import get_plan
from app.db.session import SessionLocal
from app.models import (
    Artist,
    BillableTrackPlay,
    OwnerBankAccount,
    OwnerWallet,
    RadioListenSession,
    RadioStation,
    SubscriptionPayment,
    Track,
    User,
    WithdrawalRequest,
)
from app.services.subscription_service import apply_admin_subscription
from app.services.wallet_service import (
    BankDetails,
    encrypt_withdrawal_bank_snapshot,
    get_or_create_wallet,
    upsert_bank_account,
)

DEMO_DOMAIN = "accounts-demo.verisonic.local"
DEMO_PASSWORD = "demo12345"


def demo_email(local: str) -> str:
    return f"{local}@{DEMO_DOMAIN}"


def is_demo_email(email: str) -> bool:
    return email.endswith(f"@{DEMO_DOMAIN}")


def utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def days_ago(n: int) -> datetime.datetime:
    return utcnow() - datetime.timedelta(days=n)


def reset_demo_data(db) -> int:
    demo_users = db.query(User).filter(User.email.like(f"%@{DEMO_DOMAIN}")).all()
    if not demo_users:
        return 0
    demo_ids = [u.id for u in demo_users]

    db.query(WithdrawalRequest).filter(WithdrawalRequest.user_id.in_(demo_ids)).delete(
        synchronize_session=False
    )
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
        user.subscription_activated_at = days_ago(20)
        user.subscription_expires_at = days_ago(-10)
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
    credits: list[tuple[str, int]],
) -> None:
    for play_date, credit_paise in credits:
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
        db.add(
            BillableTrackPlay(
                listener_user_id=listener.id,
                track_id=track.id,
                owner_user_id=owner.id,
                listened_seconds=120.0,
                credit_paise=credit_paise,
                play_date=play_date,
                created_at=days_ago(30 - int(play_date.split("-")[2]) % 28),
            )
        )


def add_radio_session(
    db,
    *,
    owner: User,
    station: RadioStation,
    listener: User,
    total_seconds: int,
    credit_paise: int,
    token_suffix: str,
) -> None:
    token = f"demo_session_{token_suffix}"
    exists = (
        db.query(RadioListenSession.id)
        .filter(RadioListenSession.session_token == token)
        .first()
    )
    if exists:
        return
    started = days_ago(5)
    db.add(
        RadioListenSession(
            session_token=token,
            listener_user_id=listener.id,
            station_id=station.id,
            owner_user_id=owner.id,
            total_seconds=total_seconds,
            total_credit_paise=credit_paise,
            is_active=False,
            started_at=started,
            ended_at=started + datetime.timedelta(seconds=total_seconds),
            last_heartbeat_at=started + datetime.timedelta(seconds=total_seconds),
        )
    )


def set_wallet_balance(db, user: User, balance_paise: int) -> None:
    wallet = get_or_create_wallet(db, user.id)
    wallet.balance_paise = balance_paise
    wallet.updated_at = utcnow()


def add_withdrawal(
    db,
    *,
    user: User,
    amount_paise: int,
    bank: BankDetails,
    created_days_ago: int,
) -> None:
    created_at = days_ago(created_days_ago)
    snapshot = encrypt_withdrawal_bank_snapshot(bank)
    db.add(
        WithdrawalRequest(
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
    )


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
    db.add(
        SubscriptionPayment(
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
    )


def seed(db) -> None:

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
        created_days_ago=25, suffix="m1",
    )
    add_subscription_payment(
        db, user=listener_active_y, plan_id="premium_yearly", status="paid",
        created_days_ago=40, suffix="y1",
    )
    add_subscription_payment(
        db, user=listener_pending, plan_id="premium_monthly", status="paid",
        created_days_ago=60, suffix="p0",
    )
    add_subscription_payment(
        db, user=listener_pending, plan_id="premium_monthly", status="created",
        created_days_ago=3, suffix="p1",
    )
    add_subscription_payment(
        db, user=listener_failed, plan_id="premium_monthly", status="paid",
        created_days_ago=45, suffix="f0",
    )
    add_subscription_payment(
        db, user=listener_failed, plan_id="premium_monthly", status="failed",
        created_days_ago=2, suffix="f1",
    )
    add_subscription_payment(
        db, user=listener_cancelled, plan_id="premium_monthly", status="paid",
        created_days_ago=30, suffix="c1",
    )

    play_listener = listener_active_m

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

    add_track_plays(
        db, owner=studio1_user, track=t1, listener=play_listener,
        credits=[("2026-06-01", 8000), ("2026-06-08", 7500), ("2026-06-15", 8200)],
    )
    add_track_plays(
        db, owner=studio1_user, track=t2, listener=listener_active_y,
        credits=[("2026-06-05", 6000), ("2026-06-12", 5800)],
    )
    add_track_plays(
        db, owner=studio2_user, track=t3, listener=play_listener,
        credits=[("2026-06-03", 9000), ("2026-06-10", 9500), ("2026-06-17", 9500)],
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

    # Studio1: earned 35500, withdrawn 28000, balance 7500
    set_wallet_balance(db, studio1_user, 7500)
    add_withdrawal(
        db, user=studio1_user, amount_paise=20000, bank=bank_studio1, created_days_ago=12,
    )
    add_withdrawal(
        db, user=studio1_user, amount_paise=8000, bank=bank_studio1, created_days_ago=4,
    )

    # Studio2: earned 28000, no withdrawals
    set_wallet_balance(db, studio2_user, 28000)

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

    add_radio_session(
        db, owner=radio_user, station=radio_station, listener=play_listener,
        total_seconds=3600, credit_paise=12000, token_suffix="w1",
    )
    add_radio_session(
        db, owner=radio_user, station=radio_station, listener=listener_active_y,
        total_seconds=5400, credit_paise=18000, token_suffix="w2",
    )

    # Radio: earned 30000, withdrawn 20000, balance 10000
    set_wallet_balance(db, radio_user, 10000)
    add_withdrawal(
        db, user=radio_user, amount_paise=15000, bank=bank_radio, created_days_ago=15,
    )
    add_withdrawal(
        db, user=radio_user, amount_paise=5000, bank=bank_radio, created_days_ago=6,
    )

    db.commit()

    print("Accounts demo data seeded successfully.\n")
    print(f"  Password for all demo users: {DEMO_PASSWORD}\n")
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
    for local, note in [
        ("studio.aurora", "Studio · completed withdrawal history"),
        ("studio.midnight", "Studio · revenue only, no withdrawals yet"),
        ("radio.wavefm", "Radio · completed withdrawal history"),
    ]:
        print(f"    {demo_email(local)}  ({note})")
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
