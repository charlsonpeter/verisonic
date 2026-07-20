import csv
import io
from datetime import date, datetime, timedelta
from typing import List
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy.orm import Session

from app.models import WithdrawalRequest
from app.services.wallet_service import decrypt_withdrawal_bank_snapshot


def _validate_export_range(from_date: date, to_date: date) -> None:
    if to_date < from_date:
        raise ValueError("End date must be on or after start date.")
    span_days = (to_date - from_date).days + 1
    if span_days > 3660:
        raise ValueError("Date range cannot exceed 10 years.")


def resolve_export_timezone(timezone: str | None) -> ZoneInfo:
    if not timezone or not timezone.strip():
        return ZoneInfo("UTC")
    try:
        return ZoneInfo(timezone.strip())
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Invalid timezone.") from exc


def query_user_withdrawals(
    db: Session,
    *,
    user_id: int,
    from_date: date,
    to_date: date,
) -> List[WithdrawalRequest]:
    _validate_export_range(from_date, to_date)
    start = datetime.combine(from_date, datetime.min.time())
    end = datetime.combine(to_date + timedelta(days=1), datetime.min.time())
    return (
        db.query(WithdrawalRequest)
        .filter(
            WithdrawalRequest.user_id == user_id,
            WithdrawalRequest.created_at >= start,
            WithdrawalRequest.created_at < end,
        )
        .order_by(WithdrawalRequest.created_at.asc())
        .all()
    )


def _format_dt_local(value: datetime | None, tz: ZoneInfo) -> str:
    if value is None:
        return ""
    aware = value.replace(tzinfo=ZoneInfo("UTC")) if value.tzinfo is None else value.astimezone(ZoneInfo("UTC"))
    return aware.astimezone(tz).strftime("%Y-%m-%d %H:%M:%S")


def _payout_date(row: WithdrawalRequest, tz: ZoneInfo) -> str:
    return _format_dt_local(row.processed_at or row.created_at, tz)


def build_withdrawals_csv(rows: List[WithdrawalRequest], timezone: str = "UTC") -> str:
    tz = resolve_export_timezone(timezone)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "Payout date",
            "Payout reference no.",
            "Gross payout (INR)",
            "Account holder name",
            "Bank name",
            "Bank account (masked)",
            "IFSC",
            "UTR / transaction ref.",
            "Status",
        ]
    )
    for row in rows:
        bank = decrypt_withdrawal_bank_snapshot(row)
        writer.writerow(
            [
                _payout_date(row, tz),
                row.id,
                f"{row.amount_paise / 100:.2f}",
                bank["account_holder_name"],
                bank["bank_name"],
                bank["account_number_masked"],
                bank["ifsc_code"],
                row.utr_reference or "",
                row.status,
            ]
        )
    return output.getvalue()


def export_filename(from_date: date, to_date: date) -> str:
    return f"verisonic-payouts-{from_date.isoformat()}-to-{to_date.isoformat()}.csv"
