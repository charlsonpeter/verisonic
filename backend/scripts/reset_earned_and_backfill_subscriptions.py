#!/usr/bin/env python3
"""Clear owner/play revenue data and backfill paid subscription records for premium users."""
# docker exec -w /app verisonic_backend env PYTHONPATH=/app python scripts/reset_earned_and_backfill_subscriptions.py

from __future__ import annotations

import argparse
import datetime
import os
import sys
import uuid

from app.core.subscription_plans import get_plan, plan_id_for_cycle
from app.db.session import SessionLocal
from app.models import (
    BillableTrackPlay,
    OwnerWallet,
    RadioListenSession,
    SubscriptionPayment,
    User,
    WalletLedgerEntry,
    WithdrawalRequest,
)


def clear_earned_data(db) -> dict[str, int]:
    counts = {
        "wallet_ledger_entries": db.query(WalletLedgerEntry).delete(synchronize_session=False),
        "withdrawal_requests": db.query(WithdrawalRequest).delete(synchronize_session=False),
        "billable_track_plays": db.query(BillableTrackPlay).delete(synchronize_session=False),
        "radio_listen_sessions": db.query(RadioListenSession).delete(synchronize_session=False),
    }
    wallets_reset = (
        db.query(OwnerWallet)
        .update({OwnerWallet.balance_paise: 0}, synchronize_session=False)
    )
    counts["owner_wallets_reset"] = wallets_reset
    return counts


def backfill_premium_subscription_payments(db) -> list[str]:
    created: list[str] = []
    premium_users = db.query(User).filter(User.subscription == "premium").order_by(User.id.asc()).all()

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

        db.add(
            SubscriptionPayment(
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
        )
        created.append(f"{user.email} -> {plan.id} ({plan.amount_paise} paise)")

    return created


def main() -> None:
    parser = argparse.ArgumentParser(
        description="DANGEROUS: wipe all earned revenue data and backfill subscription payments."
    )
    parser.add_argument(
        "--i-know-what-im-doing",
        action="store_true",
        help="Required confirmation flag. Refuses to run without it.",
    )
    args = parser.parse_args()
    if not args.i_know_what_im_doing:
        print(
            "Refusing to run: this script deletes ALL wallet ledger, withdrawals, "
            "billable plays, and radio sessions, then zeroes every wallet.\n"
            "Re-run with --i-know-what-im-doing if you really intend this.",
            file=sys.stderr,
        )
        sys.exit(1)
    if os.getenv("VERISONIC_ENV", "").lower() in ("production", "prod"):
        print("Refusing to run against production (VERISONIC_ENV=production).", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        cleared = clear_earned_data(db)
        created = backfill_premium_subscription_payments(db)
        db.commit()
        print("Cleared earned data:")
        for key, value in cleared.items():
            print(f"  {key}: {value}")
        print(f"\nBackfilled {len(created)} premium subscription payment(s):")
        for line in created:
            print(f"  {line}")
        if not created:
            print("  (all premium users already had a paid subscription record)")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
