#!/usr/bin/env python3
"""Clear earned / settlement revenue data and backfill paid subscription records.

Wipes wallet ledger, withdrawals, billable listens, radio sessions, daily
settlement runs/credits, and zeroes owner wallets. Then creates paid
SubscriptionPayment rows (with billing period bounds) for premium users that
lack one — required by user-centric daily settlement.

Usage:
  docker exec -w /app verisonic_backend env PYTHONPATH=/app \\
    python scripts/reset_earned_and_backfill_subscriptions.py --i-know-what-im-doing

Optional:
  --keep-listens   Keep BillableTrackPlay / RadioListenSession rows, clear only
                   credits/settlement/wallets, then re-settle all listen dates.
"""
from __future__ import annotations

import argparse
import datetime
import os
import sys
import uuid

from sqlalchemy import func

from app.core.subscription_plans import get_plan, plan_id_for_cycle
from app.db.session import SessionLocal
from app.models import (
    BillableTrackPlay,
    DailySettlementCredit,
    DailySettlementRun,
    OwnerWallet,
    RadioListenSession,
    SubscriptionPayment,
    User,
    WalletLedgerEntry,
    WithdrawalRequest,
)
from app.services.billing_period import stamp_payment_billing_period
from app.services.daily_settlement_service import settle_day


def clear_earned_data(db, *, keep_listens: bool = False) -> dict[str, int]:
    counts: dict[str, int] = {
        "daily_settlement_credits": db.query(DailySettlementCredit).delete(
            synchronize_session=False
        ),
        "daily_settlement_runs": db.query(DailySettlementRun).delete(synchronize_session=False),
        "wallet_ledger_entries": db.query(WalletLedgerEntry).delete(synchronize_session=False),
        "withdrawal_requests": db.query(WithdrawalRequest).delete(synchronize_session=False),
    }
    if keep_listens:
        counts["billable_track_plays"] = 0
        counts["radio_listen_sessions"] = 0
    else:
        counts["billable_track_plays"] = db.query(BillableTrackPlay).delete(
            synchronize_session=False
        )
        counts["radio_listen_sessions"] = db.query(RadioListenSession).delete(
            synchronize_session=False
        )

    wallets_reset = db.query(OwnerWallet).update(
        {OwnerWallet.balance_paise: 0},
        synchronize_session=False,
    )
    counts["owner_wallets_reset"] = wallets_reset
    return counts


def backfill_premium_subscription_payments(db) -> list[str]:
    created: list[str] = []
    premium_users = (
        db.query(User).filter(User.subscription == "premium").order_by(User.id.asc()).all()
    )

    for user in premium_users:
        has_paid = (
            db.query(SubscriptionPayment.id)
            .filter(
                SubscriptionPayment.user_id == user.id,
                SubscriptionPayment.status == "paid",
            )
            .first()
        )
        if has_paid:
            continue

        plan_id = user.pending_plan_id if user.pending_plan_paid and user.pending_plan_id else None
        if not plan_id:
            plan_id = plan_id_for_cycle(user.subscription_cycle or "monthly")
        if not plan_id:
            plan_id = "premium_monthly"

        plan = get_plan(plan_id, db)
        if plan is None:
            plan = get_plan("premium_monthly", db)
        if plan is None:
            raise RuntimeError("Could not resolve subscription plan for backfill")

        paid_at = user.subscription_activated_at or user.created_at or datetime.datetime.utcnow()
        suffix = uuid.uuid4().hex[:12]
        order_id = f"backfill_order_{user.id}_{suffix}"
        payment_id = f"backfill_pay_{user.id}_{suffix}"

        payment = SubscriptionPayment(
            user_id=user.id,
            plan_id=plan.id,
            amount_paise=plan.amount_paise,
            currency=plan.currency,
            razorpay_order_id=order_id,
            razorpay_payment_id=payment_id,
            status="paid",
            created_at=paid_at,
            paid_at=paid_at,
        )
        stamp_payment_billing_period(payment, user)
        db.add(payment)
        period_note = ""
        if payment.billing_period_start and payment.billing_period_end:
            period_note = (
                f" [{payment.billing_period_start.date()} → {payment.billing_period_end.date()}]"
            )
        created.append(f"{user.email} -> {plan.id} ({plan.amount_paise} paise){period_note}")

    return created


def stamp_missing_payment_periods(db) -> int:
    """Stamp billing_period_* on paid payments that are missing bounds."""
    updated = 0
    payments = (
        db.query(SubscriptionPayment)
        .filter(
            SubscriptionPayment.status == "paid",
            SubscriptionPayment.billing_period_start.is_(None),
        )
        .order_by(SubscriptionPayment.id.asc())
        .all()
    )
    for payment in payments:
        user = db.query(User).filter(User.id == payment.user_id).first()
        if user is None or user.subscription_expires_at is None:
            continue
        stamp_payment_billing_period(payment, user)
        if payment.billing_period_start is not None:
            updated += 1
    return updated


def listen_settlement_dates(db) -> list[str]:
    """UTC dates that have track plays or radio sessions (for re-settle)."""
    dates: set[str] = set()
    for (play_date,) in db.query(BillableTrackPlay.play_date).distinct().all():
        if play_date:
            dates.add(str(play_date))
    for (started_at,) in (
        db.query(RadioListenSession.started_at)
        .filter(RadioListenSession.started_at.isnot(None))
        .distinct()
        .all()
    ):
        dates.add(started_at.strftime("%Y-%m-%d"))
    return sorted(dates)


def resettle_listen_dates(db) -> dict[str, int]:
    dates = listen_settlement_dates(db)
    stats = {
        "dates": len(dates),
        "completed": 0,
        "failed": 0,
        "skipped": 0,
        "total_credited_paise": 0,
    }
    for date_str in dates:
        run = settle_day(db, date_str, force=True)
        if run.status == "completed":
            stats["completed"] += 1
            stats["total_credited_paise"] += int(run.total_credited_paise or 0)
        elif run.status == "skipped":
            stats["skipped"] += 1
        else:
            stats["failed"] += 1
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "DANGEROUS: wipe earned revenue / settlement data and backfill "
            "subscription payments for daily settlement."
        )
    )
    parser.add_argument(
        "--i-know-what-im-doing",
        action="store_true",
        help="Required confirmation flag. Refuses to run without it.",
    )
    parser.add_argument(
        "--keep-listens",
        action="store_true",
        help=(
            "Keep billable track plays and radio sessions; clear wallets/settlement "
            "only, then re-run daily settlement for those dates."
        ),
    )
    args = parser.parse_args()
    if not args.i_know_what_im_doing:
        print(
            "Refusing to run: this script deletes revenue/settlement data "
            "(ledger, withdrawals, settlement runs/credits"
            + (
                ""
                if args.keep_listens
                else ", billable plays, radio sessions"
            )
            + "), zeroes every wallet, then backfills premium payments.\n"
            "Re-run with --i-know-what-im-doing if you really intend this.",
            file=sys.stderr,
        )
        sys.exit(1)
    if os.getenv("VERISONIC_ENV", "").lower() in ("production", "prod"):
        print("Refusing to run against production (VERISONIC_ENV=production).", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        cleared = clear_earned_data(db, keep_listens=args.keep_listens)
        created = backfill_premium_subscription_payments(db)
        stamped = stamp_missing_payment_periods(db)
        db.flush()

        settle_stats = None
        if args.keep_listens:
            settle_stats = resettle_listen_dates(db)

        db.commit()

        print("Cleared earned / settlement data:")
        for key, value in cleared.items():
            print(f"  {key}: {value}")

        print(f"\nBackfilled {len(created)} premium subscription payment(s):")
        for line in created:
            print(f"  {line}")
        if not created:
            print("  (all premium users already had a paid subscription record)")

        print(f"\nStamped billing periods on {stamped} existing paid payment(s).")

        if settle_stats is not None:
            print("\nRe-settled listen dates:")
            for key, value in settle_stats.items():
                if key == "total_credited_paise":
                    print(f"  {key}: {value} (₹{value / 100:.2f})")
                else:
                    print(f"  {key}: {value}")
            remaining = int(
                db.query(func.coalesce(func.sum(OwnerWallet.balance_paise), 0)).scalar() or 0
            )
            print(f"  wallet_balances_total_paise: {remaining} (₹{remaining / 100:.2f})")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
