import csv
import io
import re
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.subscription_plans import get_plan
from app.models import (
    Artist,
    BillableTrackPlay,
    OwnerWallet,
    RadioListenSession,
    RadioStation,
    SubscriptionPayment,
    Track,
    User,
    WalletLedgerEntry,
    WithdrawalRequest,
)
from app.services.wallet_service import decrypt_withdrawal_bank_snapshot
from app.services.withdrawal_export_service import resolve_export_timezone


def _csv_filename_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "export"


def _export_timestamp_suffix(tz: ZoneInfo) -> str:
    return datetime.now(tz).strftime("%Y-%m-%d-%H-%M-%S")


def _filename_with_timestamp(base: str, tz: ZoneInfo) -> str:
    name = base[:-4] if base.endswith(".csv") else base
    return f"{name}-{_export_timestamp_suffix(tz)}.csv"


def _rupees_from_paise(paise: int) -> str:
    return f"{paise / 100:.2f}"


def _account_type_label(value: str) -> str:
    if value == "studio":
        return "Studio"
    if value == "radio":
        return "Radio"
    return value.replace("_", " ")


def _subscription_label(subscription: str, cycle: Optional[str]) -> str:
    if subscription == "premium":
        if cycle == "yearly":
            return "Premium · Yearly"
        if cycle == "monthly":
            return "Premium · Monthly"
        return "Premium"
    return subscription.replace("_", " ")


def _payment_status_label(status: str) -> str:
    if status == "paid":
        return "Paid"
    if status == "created":
        return "Pending"
    if status == "failed":
        return "Failed"
    return status.replace("_", " ")


def _format_duration(seconds: int) -> str:
    if seconds <= 0:
        return "—"
    hours = seconds // 3600
    mins = (seconds % 3600) // 60
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m"


def _format_local_datetime(value: Optional[datetime], tz: ZoneInfo, locale: str) -> str:
    if value is None:
        return ""
    aware = value.replace(tzinfo=ZoneInfo("UTC")) if value.tzinfo is None else value.astimezone(ZoneInfo("UTC"))
    local = aware.astimezone(tz)
    if locale.startswith("en-IN"):
        formatted = local.strftime("%d %b %Y, %I:%M %p")
        return formatted.replace("AM", "am").replace("PM", "pm")
    return local.strftime("%b %d, %Y, %I:%M %p")


def _write_csv_section(headers: List[str], rows: List[List], *, with_bom: bool = True) -> str:
    output = io.StringIO()
    if with_bom:
        output.write("\ufeff")
    writer = csv.writer(output, lineterminator="\r\n")
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


def _resolve_account_type(user: User) -> str:
    if user.role == "studio_admin":
        return "studio"
    if user.role == "radio_admin":
        return "radio"
    return user.role


def _owner_display_name(
    user: User,
    artist: Optional[Artist],
    stations: Optional[List[RadioStation]] = None,
) -> str:
    if user.role == "radio_admin" and stations:
        return stations[0].name.strip()
    if user.role == "studio_admin" and artist and artist.stage_name:
        return artist.stage_name.strip()
    if user.full_name and user.full_name.strip():
        return user.full_name.strip()
    return user.email


def _owner_financials(db: Session, user_id: int) -> tuple[int, int, int]:
    wallet = db.query(OwnerWallet).filter(OwnerWallet.user_id == user_id).first()
    balance = int(wallet.balance_paise) if wallet else 0
    withdrawn = int(
        db.query(func.coalesce(func.sum(WithdrawalRequest.amount_paise), 0))
        .filter(WithdrawalRequest.user_id == user_id, WithdrawalRequest.status == "paid")
        .scalar()
        or 0
    )
    track_revenue = int(
        db.query(func.coalesce(func.sum(BillableTrackPlay.credit_paise), 0))
        .filter(BillableTrackPlay.owner_user_id == user_id)
        .scalar()
        or 0
    )
    radio_revenue = int(
        db.query(func.coalesce(func.sum(RadioListenSession.total_credit_paise), 0))
        .filter(RadioListenSession.owner_user_id == user_id)
        .scalar()
        or 0
    )
    return track_revenue + radio_revenue, withdrawn, balance


def _owner_user_ids(db: Session) -> List[int]:
    return [
        row[0]
        for row in db.query(User.id)
        .filter(User.role.in_(["studio_admin", "radio_admin"]))
        .all()
    ]


def _station_revenue_stats(db: Session, station_id: int) -> tuple[int, int, int]:
    revenue = int(
        db.query(func.coalesce(func.sum(RadioListenSession.total_credit_paise), 0))
        .filter(RadioListenSession.station_id == station_id)
        .scalar()
        or 0
    )
    listen_seconds = int(
        db.query(func.coalesce(func.sum(RadioListenSession.total_seconds), 0))
        .filter(RadioListenSession.station_id == station_id)
        .scalar()
        or 0
    )
    session_count = int(
        db.query(func.count(RadioListenSession.id))
        .filter(RadioListenSession.station_id == station_id)
        .scalar()
        or 0
    )
    return revenue, listen_seconds, session_count


def _plan_label(plan_id: str, db: Session) -> str:
    plan = get_plan(plan_id, db)
    if plan is not None:
        return plan.label
    return plan_id.replace("_", " ").title()


def _latest_subscription_payment(db: Session, user_id: int) -> Optional[SubscriptionPayment]:
    return (
        db.query(SubscriptionPayment)
        .filter(SubscriptionPayment.user_id == user_id)
        .order_by(SubscriptionPayment.id.desc())
        .first()
    )


def _subscriber_subscription_status(user: User) -> str:
    return "cancelled" if user.subscription_cancel_at_period_end else "active"


def _subscriber_next_payment_at(user: User) -> Optional[datetime]:
    if user.subscription_cancel_at_period_end:
        return None
    return user.subscription_expires_at


def build_owners_list_csv(db: Session, *, timezone: str, locale: str) -> Tuple[str, str]:
    tz = resolve_export_timezone(timezone)
    rows: List[List] = []
    for user_id in _owner_user_ids(db):
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            continue
        artist = db.query(Artist).filter(Artist.user_id == user_id).first()
        stations = (
            db.query(RadioStation)
            .filter(RadioStation.owner_id == user_id)
            .order_by(RadioStation.name.asc())
            .all()
        )
        total_revenue, withdrawn, balance = _owner_financials(db, user_id)
        rows.append(
            [
                _owner_display_name(user, artist, stations),
                user.email,
                _account_type_label(_resolve_account_type(user)),
                _rupees_from_paise(total_revenue),
                _rupees_from_paise(withdrawn),
                _rupees_from_paise(balance),
            ]
        )
    rows.sort(key=lambda row: (-float(row[3]), str(row[0]).lower()))
    content = _write_csv_section(
        ["Owner", "Email", "Type", "Total earned (INR)", "Withdrawn (INR)", "Balance (INR)"],
        rows,
    )
    return content, _filename_with_timestamp("verisonic-owner-accounts", tz)


def build_owner_detail_csv(
    db: Session,
    user_id: int,
    *,
    timezone: str,
    locale: str,
) -> Tuple[str, str]:
    tz = resolve_export_timezone(timezone)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ("studio_admin", "radio_admin"):
        raise ValueError("Owner account not found")

    artist = db.query(Artist).filter(Artist.user_id == user_id).first()
    stations = db.query(RadioStation).filter(RadioStation.owner_id == user_id).order_by(RadioStation.name.asc()).all()
    owner_name = _owner_display_name(user, artist, stations)
    slug = _csv_filename_slug(owner_name or user.email)
    account_type = _resolve_account_type(user)

    if account_type == "studio" and artist is not None:
        track_rows = (
            db.query(
                Track.id,
                Track.title,
                func.coalesce(func.sum(BillableTrackPlay.credit_paise), 0),
                func.count(BillableTrackPlay.id),
            )
            .outerjoin(
                BillableTrackPlay,
                (BillableTrackPlay.track_id == Track.id)
                & (BillableTrackPlay.owner_user_id == user_id),
            )
            .filter(Track.artist_id == artist.id)
            .group_by(Track.id, Track.title)
            .order_by(func.coalesce(func.sum(BillableTrackPlay.credit_paise), 0).desc(), Track.title.asc())
            .all()
        )
        rows = [
            [title, _rupees_from_paise(int(revenue or 0)), int(play_count or 0)]
            for _, title, revenue, play_count in track_rows
        ]
        content = _write_csv_section(["Track", "Total earned (INR)", "Play count"], rows)
        return content, _filename_with_timestamp(f"verisonic-owner-{slug}-tracks", tz)

    station_rows = []
    for station in stations:
        revenue, listen_seconds, session_count = _station_revenue_stats(db, station.id)
        station_rows.append(
            [
                station.name,
                user.email,
                _rupees_from_paise(revenue),
                session_count,
                _format_duration(listen_seconds),
            ]
        )
    content = _write_csv_section(
        ["Station", "Email", "Total earned (INR)", "Sessions", "Listen time"],
        station_rows,
    )
    return content, _filename_with_timestamp(f"verisonic-owner-{slug}-stations", tz)


def build_subscribers_list_csv(
    db: Session,
    *,
    status: Optional[str],
    timezone: str,
    locale: str,
) -> Tuple[str, str]:
    tz = resolve_export_timezone(timezone)
    users = (
        db.query(User)
        .filter(User.subscription == "premium")
        .order_by(User.full_name.asc().nulls_last(), User.email.asc())
        .all()
    )
    rows: List[List] = []
    for user in users:
        latest = _latest_subscription_payment(db, user.id)
        last_status = latest.status if latest is not None else "active"
        if status and last_status != status:
            continue
        last_payment_at = latest.paid_at or latest.created_at if latest is not None else None
        rows.append(
            [
                user.full_name or "",
                user.email,
                _subscription_label(user.subscription, user.subscription_cycle),
                "Cancelled" if _subscriber_subscription_status(user) == "cancelled" else "Active",
                _payment_status_label(last_status),
                _rupees_from_paise(latest.amount_paise) if latest is not None else "",
                _format_local_datetime(last_payment_at, tz, locale),
                _format_local_datetime(_subscriber_next_payment_at(user), tz, locale),
            ]
        )
    filter_slug = f"-{status}" if status else ""
    content = _write_csv_section(
        [
            "Name",
            "Email",
            "Plan",
            "Subscription status",
            "Payment status",
            "Amount (INR)",
            "Last payment",
            "Next payment",
        ],
        rows,
    )
    return content, _filename_with_timestamp(f"verisonic-subscribers{filter_slug}", tz)


def build_subscriber_detail_csv(
    db: Session,
    user_id: int,
    *,
    timezone: str,
    locale: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
) -> Tuple[str, str]:
    if from_date is not None and to_date is not None and to_date < from_date:
        raise ValueError("End date must be on or after start date.")

    tz = resolve_export_timezone(timezone)
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.subscription != "premium":
        raise ValueError("Subscriber not found")

    is_cancelled = _subscriber_subscription_status(user) == "cancelled"
    pending_plan_label = None
    if user.pending_plan_id:
        pending_plan_label = _plan_label(user.pending_plan_id, db)

    renew_on = "Cancelled"
    if not is_cancelled:
        renew_on = _format_local_datetime(user.subscription_expires_at, tz, locale)

    queued_plan = ""
    if user.pending_plan_id:
        label = pending_plan_label or user.pending_plan_id
        queued_plan = f"{label} (prepaid)" if user.pending_plan_paid else label

    summary_rows: List[List] = [
        ["Name", user.full_name or ""],
        ["Email", user.email],
        ["Plan", _subscription_label(user.subscription, user.subscription_cycle)],
        ["Subscription status", "Cancelled" if is_cancelled else "Active"],
        ["Renew on", renew_on],
        ["Queued plan", queued_plan],
    ]
    if from_date is not None or to_date is not None:
        summary_rows.extend(
            [
                ["Period from", from_date.isoformat() if from_date else ""],
                ["Period to", to_date.isoformat() if to_date else ""],
            ]
        )
    summary = _write_csv_section(["Field", "Value"], summary_rows)

    payments_query = db.query(SubscriptionPayment).filter(SubscriptionPayment.user_id == user_id)
    if from_date is not None:
        payments_query = payments_query.filter(
            SubscriptionPayment.created_at >= datetime.combine(from_date, datetime.min.time())
        )
    if to_date is not None:
        payments_query = payments_query.filter(
            SubscriptionPayment.created_at
            < datetime.combine(to_date + timedelta(days=1), datetime.min.time())
        )
    payments = payments_query.order_by(SubscriptionPayment.id.desc()).all()

    if search_query := _normalize_export_search(search):
        payments = [row for row in payments if _payment_export_matches_search(row, search_query, db)]

    payment_rows = [
        [
            _plan_label(payment.plan_id, db),
            _rupees_from_paise(payment.amount_paise),
            _payment_status_label(payment.status),
            payment.razorpay_payment_id or payment.razorpay_order_id or "",
            _format_local_datetime(payment.created_at, tz, locale),
            _format_local_datetime(payment.paid_at, tz, locale),
        ]
        for payment in payments
    ]
    payments_section = _write_csv_section(
        ["Plan", "Amount (INR)", "Payment status", "Transaction number", "Created", "Paid"],
        payment_rows,
        with_bom=False,
    )
    slug = _csv_filename_slug(user.email)
    content = f"{summary}\r\n{payments_section}"
    return content, _filename_with_timestamp(f"verisonic-subscriber-{slug}", tz)


def _normalize_export_search(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    trimmed = value.strip().lower()
    return trimmed or None


def _payment_export_matches_search(payment: SubscriptionPayment, query: str, db: Session) -> bool:
    amount_rupees = f"{payment.amount_paise / 100:.2f}"
    haystack = " ".join(
        filter(
            None,
            [
                _plan_label(payment.plan_id, db),
                payment.status or "",
                _payment_status_label(payment.status),
                payment.razorpay_order_id or "",
                payment.razorpay_payment_id or "",
                amount_rupees,
                str(payment.amount_paise),
            ],
        )
    ).lower()
    return query in haystack


def _past_withdrawals_paise(db: Session, user_id: int, before: datetime) -> int:
    """Paid withdrawals strictly before the period start."""
    return int(
        db.query(func.coalesce(func.sum(WithdrawalRequest.amount_paise), 0))
        .filter(
            WithdrawalRequest.user_id == user_id,
            WithdrawalRequest.status == "paid",
            WithdrawalRequest.created_at < before,
        )
        .scalar()
        or 0
    )


def _opening_balance_paise(db: Session, user_id: int, before: datetime) -> int:
    """
    Wallet balance at period start = sum of ledger entries before From.
    Equivalent to (earnings before From) − (withdrawals before From), including adjustments.
    """
    wallet = db.query(OwnerWallet).filter(OwnerWallet.user_id == user_id).first()
    if not wallet:
        return 0
    return int(
        db.query(func.coalesce(func.sum(WalletLedgerEntry.amount_paise), 0))
        .filter(
            WalletLedgerEntry.wallet_id == wallet.id,
            WalletLedgerEntry.created_at < before,
        )
        .scalar()
        or 0
    )


def _withdrawal_export_matches_search(row: WithdrawalRequest, query: str) -> bool:
    bank = decrypt_withdrawal_bank_snapshot(row)
    amount_rupees = f"{row.amount_paise / 100:.2f}"
    transaction_number = row.utr_reference or str(row.id)
    haystack = " ".join(
        filter(
            None,
            [
                str(row.id),
                transaction_number,
                row.status or "",
                row.utr_reference or "",
                row.admin_note or "",
                bank["bank_name"] or "",
                bank["account_number_masked"] or "",
                bank["ifsc_code"] or "",
                bank["account_holder_name"] or "",
                amount_rupees,
                str(row.amount_paise),
            ],
        )
    ).lower()
    return query in haystack


def build_withdrawals_users_list_csv(
    db: Session,
    *,
    timezone: str,
    locale: str,
) -> Tuple[str, str]:
    tz = resolve_export_timezone(timezone)
    user_ids = [row[0] for row in db.query(WithdrawalRequest.user_id).distinct().all()]
    rows: List[List] = []
    for user_id in user_ids:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            continue
        artist = db.query(Artist).filter(Artist.user_id == user_id).first()
        stations = (
            db.query(RadioStation)
            .filter(RadioStation.owner_id == user_id)
            .order_by(RadioStation.name.asc())
            .all()
        )
        _, withdrawn, balance = _owner_financials(db, user_id)
        count = int(
            db.query(func.count(WithdrawalRequest.id))
            .filter(
                WithdrawalRequest.user_id == user_id,
                WithdrawalRequest.status == "paid",
            )
            .scalar()
            or 0
        )
        last_at = (
            db.query(func.max(WithdrawalRequest.created_at))
            .filter(
                WithdrawalRequest.user_id == user_id,
                WithdrawalRequest.status == "paid",
            )
            .scalar()
        )
        rows.append(
            [
                _owner_display_name(user, artist, stations),
                user.email,
                _account_type_label(_resolve_account_type(user)),
                count,
                _rupees_from_paise(withdrawn),
                _rupees_from_paise(balance),
                _format_local_datetime(last_at, tz, locale),
            ]
        )
    rows.sort(key=lambda row: (-float(row[4]), str(row[0]).lower()))
    content = _write_csv_section(
        [
            "Owner",
            "Email",
            "Type",
            "No. of withdrawals",
            "Total withdrawn (INR)",
            "Wallet balance (INR)",
            "Last withdrawal",
        ],
        rows,
    )
    return content, _filename_with_timestamp("verisonic-withdrawals", tz)


def build_withdrawal_user_detail_csv(
    db: Session,
    user_id: int,
    *,
    timezone: str,
    locale: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    search: Optional[str] = None,
) -> Tuple[str, str]:
    if from_date is not None and to_date is not None and to_date < from_date:
        raise ValueError("End date must be on or after start date.")

    tz = resolve_export_timezone(timezone)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("User not found")

    has_withdrawals = (
        db.query(WithdrawalRequest.id)
        .filter(WithdrawalRequest.user_id == user_id)
        .first()
    )
    if not has_withdrawals:
        raise ValueError("No withdrawals found for this user")

    artist = db.query(Artist).filter(Artist.user_id == user_id).first()
    stations = (
        db.query(RadioStation)
        .filter(RadioStation.owner_id == user_id)
        .order_by(RadioStation.name.asc())
        .all()
    )
    total_earned, _, balance = _owner_financials(db, user_id)
    owner_name = _owner_display_name(user, artist, stations)
    account_type = _account_type_label(_resolve_account_type(user))

    summary_rows: List[List] = [
        ["Owner", owner_name],
        ["Email", user.email],
        ["Type", account_type],
        ["Total earned (INR)", _rupees_from_paise(total_earned)],
        ["Wallet balance (INR)", _rupees_from_paise(balance)],
    ]

    if from_date is not None:
        period_start = datetime.combine(from_date, datetime.min.time())
        past_withdrawn = _past_withdrawals_paise(db, user_id, period_start)
        opening_balance = _opening_balance_paise(db, user_id, period_start)
        summary_rows.extend(
            [
                ["Period from", from_date.isoformat()],
                ["Period to", to_date.isoformat() if to_date else ""],
                ["Past withdrawals (INR)", _rupees_from_paise(past_withdrawn)],
                ["Opening balance (INR)", _rupees_from_paise(opening_balance)],
            ]
        )
    elif to_date is not None:
        summary_rows.extend(
            [
                ["Period from", ""],
                ["Period to", to_date.isoformat()],
            ]
        )

    summary = _write_csv_section(["Field", "Value"], summary_rows)

    query = (
        db.query(WithdrawalRequest)
        .filter(
            WithdrawalRequest.user_id == user_id,
            WithdrawalRequest.status == "paid",
        )
    )
    if from_date is not None:
        query = query.filter(
            WithdrawalRequest.created_at >= datetime.combine(from_date, datetime.min.time())
        )
    if to_date is not None:
        query = query.filter(
            WithdrawalRequest.created_at
            < datetime.combine(to_date + timedelta(days=1), datetime.min.time())
        )
    rows = query.order_by(WithdrawalRequest.created_at.asc()).all()

    if search_query := _normalize_export_search(search):
        rows = [row for row in rows if _withdrawal_export_matches_search(row, search_query)]

    withdrawal_rows = []
    for row in rows:
        bank = decrypt_withdrawal_bank_snapshot(row)
        withdrawal_rows.append(
            [
                _format_local_datetime(row.created_at, tz, locale),
                row.utr_reference or str(row.id),
                _rupees_from_paise(row.amount_paise),
                bank["bank_name"] or "",
                bank["account_number_masked"] or "",
                bank["ifsc_code"] or "",
            ]
        )

    withdrawals_section = _write_csv_section(
        [
            "Date",
            "Transaction number",
            "Amount (INR)",
            "Bank name",
            "Bank account (masked)",
            "IFSC",
        ],
        withdrawal_rows,
        with_bom=False,
    )
    slug = _csv_filename_slug(owner_name or user.email)
    content = f"{summary}\r\n{withdrawals_section}"
    return content, _filename_with_timestamp(f"verisonic-withdrawals-{slug}", tz)
