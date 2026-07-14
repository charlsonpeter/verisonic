import datetime
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.core.premium import paid_subscription_is_active
from app.models import (
    Artist,
    BillableTrackPlay,
    OwnerBankAccount,
    OwnerWallet,
    PlatformRevenueSettings,
    RadioListenSession,
    RadioStation,
    Track,
    User,
    WalletLedgerEntry,
    WithdrawalRequest,
)
from app.services.field_encryption import decrypt_value, encrypt_value
from app.services.revenue_settings_service import get_revenue_settings


@dataclass
class BankDetails:
    account_holder_name: str
    bank_name: Optional[str]
    account_number: str
    ifsc_code: str


def utcnow() -> datetime.datetime:
    return datetime.datetime.utcnow()


def utc_today() -> str:
    return utcnow().strftime("%Y-%m-%d")


def is_premium_paying_listener(user: User) -> bool:
    if user.subscription != "premium":
        return False
    return paid_subscription_is_active(user)


def is_billable_listener(user: User) -> bool:
    real_role = getattr(user, "_real_role", None) or user.role
    if real_role == "admin":
        return False
    if real_role in ("studio_admin", "radio_admin") and user.role != "listener":
        return False
    return is_premium_paying_listener(user)


def listener_plan_price_and_days(listener: User, settings: PlatformRevenueSettings) -> tuple[int, int]:
    """Legacy helper (estimate-based model). Prefer billing_period.resolve_billing_period_for_date."""
    if listener.subscription_cycle == "yearly":
        return settings.premium_yearly_paise, 365
    return settings.premium_monthly_paise, 30


def track_play_credit_paise(
    settings: PlatformRevenueSettings,
    plan_price_paise: int,
    plan_duration_days: int,
) -> int:
    """Deprecated: estimate-based realtime credit. Daily settlement replaces this."""
    owner_pool = plan_price_paise * settings.owner_share_bps // 10000
    studio_pool = owner_pool * settings.studio_pool_bps // 10000
    total_plays = plan_duration_days * settings.estimated_qualifying_plays_per_day
    if total_plays <= 0:
        return 0
    return max(1, studio_pool // total_plays)


def radio_heartbeat_credit_paise(
    settings: PlatformRevenueSettings,
    plan_price_paise: int,
    plan_duration_days: int,
) -> int:
    """Deprecated: estimate-based realtime credit. Daily settlement replaces this."""
    owner_pool = plan_price_paise * settings.owner_share_bps // 10000
    radio_pool = owner_pool * settings.radio_pool_bps // 10000
    total_minutes = plan_duration_days * settings.estimated_radio_minutes_per_day
    if total_minutes <= 0:
        return 0
    per_minute_paise = radio_pool // total_minutes
    credit = (per_minute_paise * settings.min_radio_heartbeat_sec) // 60
    return max(1, credit) if credit > 0 else 0


def qualifies_track_play(
    listened_seconds: float,
    track_duration: Optional[float],
    min_track_seconds: int,
) -> bool:
    if listened_seconds < min_track_seconds:
        return False
    if track_duration and track_duration > 0:
        if listened_seconds > track_duration + 2:
            return False
        return listened_seconds >= track_duration * 0.5
    return True


def get_or_create_wallet(db: Session, user_id: int, *, for_update: bool = False) -> OwnerWallet:
    query = db.query(OwnerWallet).filter(OwnerWallet.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    wallet = query.first()
    if wallet is None:
        wallet = OwnerWallet(user_id=user_id, balance_paise=0)
        db.add(wallet)
        db.flush()
        if for_update:
            locked = (
                db.query(OwnerWallet)
                .filter(OwnerWallet.user_id == user_id)
                .with_for_update()
                .first()
            )
            if locked is not None:
                return locked
    return wallet


def credit_wallet(
    db: Session,
    *,
    owner_user_id: int,
    amount_paise: int,
    entry_type: str,
    description: str,
    reference_id: Optional[str],
    listener_user_id: Optional[int],
) -> bool:
    """Credit owner wallet. Returns False if amount<=0 or reference_id already exists."""
    if amount_paise <= 0:
        return False
    if reference_id:
        exists = (
            db.query(WalletLedgerEntry.id)
            .filter(WalletLedgerEntry.reference_id == reference_id)
            .first()
        )
        if exists is not None:
            return False
    wallet = get_or_create_wallet(db, owner_user_id, for_update=True)
    wallet.balance_paise += amount_paise
    wallet.updated_at = utcnow()
    db.add(
        WalletLedgerEntry(
            wallet_id=wallet.id,
            amount_paise=amount_paise,
            entry_type=entry_type,
            description=description,
            reference_id=reference_id,
            listener_user_id=listener_user_id,
        )
    )
    return True


def process_track_listen_progress(
    db: Session,
    *,
    listener: User,
    track: Track,
    listened_seconds: float,
) -> Optional[int]:
    """Record a qualifying listen for daily settlement. Does not credit wallets."""
    if not is_billable_listener(listener):
        return None

    artist = db.query(Artist).filter(Artist.id == track.artist_id).first()
    if artist is None or artist.user_id == listener.id:
        return None

    settings = get_revenue_settings(db)
    if not qualifies_track_play(listened_seconds, track.duration, settings.min_track_seconds):
        return None

    play_date = utc_today()
    existing = (
        db.query(BillableTrackPlay)
        .filter(
            BillableTrackPlay.listener_user_id == listener.id,
            BillableTrackPlay.track_id == track.id,
            BillableTrackPlay.play_date == play_date,
        )
        .first()
    )
    if existing is not None:
        if listened_seconds > float(existing.listened_seconds or 0):
            existing.listened_seconds = listened_seconds
            db.commit()
        return 0

    record = BillableTrackPlay(
        listener_user_id=listener.id,
        track_id=track.id,
        owner_user_id=artist.user_id,
        listened_seconds=listened_seconds,
        credit_paise=0,
        play_date=play_date,
    )
    db.add(record)
    db.commit()
    return 0


def start_radio_listen_session(
    db: Session,
    *,
    listener: User,
    station: RadioStation,
) -> Optional[str]:
    if not is_billable_listener(listener):
        return None
    if station.owner_id is None or station.owner_id == listener.id:
        return None

    db.query(RadioListenSession).filter(
        RadioListenSession.listener_user_id == listener.id,
        RadioListenSession.is_active.is_(True),
    ).update({"is_active": False, "ended_at": utcnow()})

    token = uuid.uuid4().hex
    session = RadioListenSession(
        session_token=token,
        listener_user_id=listener.id,
        station_id=station.id,
        owner_user_id=station.owner_id,
        is_active=True,
        started_at=utcnow(),
        last_heartbeat_at=utcnow(),
    )
    db.add(session)
    db.commit()
    return token


def heartbeat_radio_listen_session(
    db: Session,
    *,
    listener: User,
    session_token: str,
) -> Optional[int]:
    """Accumulate listen seconds for settlement. Returns total_seconds (API field kept)."""
    session = (
        db.query(RadioListenSession)
        .filter(
            RadioListenSession.session_token == session_token,
            RadioListenSession.listener_user_id == listener.id,
            RadioListenSession.is_active.is_(True),
        )
        .with_for_update()
        .first()
    )
    if session is None:
        return None

    settings = get_revenue_settings(db)
    now = utcnow()
    if session.last_heartbeat_at:
        elapsed = int((now - session.last_heartbeat_at).total_seconds())
    else:
        elapsed = settings.min_radio_heartbeat_sec

    if elapsed < settings.min_radio_heartbeat_sec:
        return session.total_seconds

    billable_seconds = (elapsed // settings.min_radio_heartbeat_sec) * settings.min_radio_heartbeat_sec
    if billable_seconds <= 0:
        return session.total_seconds

    session.total_seconds += billable_seconds
    session.last_heartbeat_at = now
    db.commit()
    return session.total_seconds


def end_radio_listen_session(db: Session, *, listener: User, session_token: str) -> None:
    session = (
        db.query(RadioListenSession)
        .filter(
            RadioListenSession.session_token == session_token,
            RadioListenSession.listener_user_id == listener.id,
            RadioListenSession.is_active.is_(True),
        )
        .first()
    )
    if session is None:
        return
    heartbeat_radio_listen_session(db, listener=listener, session_token=session_token)
    session.is_active = False
    session.ended_at = utcnow()
    db.commit()


def mask_account_number(account_number: str) -> str:
    if len(account_number) <= 4:
        return account_number
    return f"{'*' * (len(account_number) - 4)}{account_number[-4:]}"


def safe_decrypt_stored_value(value: Optional[str]) -> str:
    """Decrypt Fernet-stored values; return legacy plaintext rows unchanged."""
    if not value:
        return ""
    try:
        return decrypt_value(value)
    except ValueError:
        return value


def encrypt_withdrawal_bank_snapshot(bank: BankDetails) -> dict[str, Optional[str]]:
    """Persist payout bank details encrypted at rest; never store full account number."""
    return {
        "account_holder_name": encrypt_value(bank.account_holder_name.strip()),
        "bank_name": encrypt_value(bank.bank_name.strip()) if bank.bank_name and bank.bank_name.strip() else None,
        "account_number_masked": mask_account_number(bank.account_number),
        "ifsc_code": encrypt_value(bank.ifsc_code.strip().upper()),
    }


def decrypt_withdrawal_bank_snapshot(row: WithdrawalRequest) -> dict[str, str]:
    return {
        "account_holder_name": safe_decrypt_stored_value(row.account_holder_name),
        "bank_name": safe_decrypt_stored_value(row.bank_name),
        "account_number_masked": row.account_number_masked or "",
        "ifsc_code": safe_decrypt_stored_value(row.ifsc_code),
    }


def _decrypt_bank_row(row: OwnerBankAccount) -> BankDetails:
    return BankDetails(
        account_holder_name=decrypt_value(row.account_holder_name),
        bank_name=decrypt_value(row.bank_name) if row.bank_name else None,
        account_number=decrypt_value(row.account_number),
        ifsc_code=decrypt_value(row.ifsc_code),
    )


def get_saved_bank_account(db: Session, user_id: int) -> Optional[BankDetails]:
    row = db.query(OwnerBankAccount).filter(OwnerBankAccount.user_id == user_id).first()
    if row is None:
        return None
    try:
        return _decrypt_bank_row(row)
    except ValueError:
        return None


def delete_saved_bank_account(db: Session, user_id: int) -> None:
    row = db.query(OwnerBankAccount).filter(OwnerBankAccount.user_id == user_id).first()
    if row is not None:
        db.delete(row)
        db.commit()


def upsert_bank_account(
    db: Session,
    *,
    user_id: int,
    account_holder_name: str,
    bank_name: Optional[str],
    account_number: str,
    ifsc_code: str,
) -> BankDetails:
    validate_bank_details(
        BankDetails(
            account_holder_name=account_holder_name,
            bank_name=bank_name,
            account_number=account_number,
            ifsc_code=ifsc_code,
        )
    )
    row = db.query(OwnerBankAccount).filter(OwnerBankAccount.user_id == user_id).first()
    if row is None:
        row = OwnerBankAccount(user_id=user_id)
        db.add(row)
    row.account_holder_name = encrypt_value(account_holder_name.strip())
    row.bank_name = encrypt_value(bank_name.strip()) if bank_name and bank_name.strip() else None
    row.account_number = encrypt_value(account_number.strip())
    row.ifsc_code = encrypt_value(ifsc_code.strip().upper())
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return BankDetails(
        account_holder_name=account_holder_name.strip(),
        bank_name=bank_name.strip() if bank_name else None,
        account_number=account_number.strip(),
        ifsc_code=ifsc_code.strip().upper(),
    )


def validate_bank_details(bank: BankDetails) -> None:
    if len(bank.account_holder_name.strip()) < 2:
        raise ValueError("Account holder name is required.")
    if len(bank.account_number.strip()) < 6:
        raise ValueError("A valid account number is required.")
    if len(bank.ifsc_code.strip()) < 5:
        raise ValueError("A valid IFSC code is required.")


def request_withdrawal(
    db: Session,
    *,
    user: User,
    amount_paise: int,
    bank: BankDetails,
    save_bank_account: bool = False,
) -> WithdrawalRequest:
    real_role = getattr(user, "_real_role", None) or user.role
    if real_role not in ("studio_admin", "radio_admin"):
        raise ValueError("Only studio and radio admins can withdraw earnings.")

    validate_bank_details(bank)

    settings = get_revenue_settings(db)
    if amount_paise < settings.min_withdrawal_paise:
        raise ValueError(f"Minimum withdrawal is ₹{settings.min_withdrawal_paise / 100:.2f}.")

    wallet = get_or_create_wallet(db, user.id, for_update=True)
    if amount_paise > wallet.balance_paise:
        raise ValueError("Insufficient balance.")

    now = utcnow()
    wallet.balance_paise -= amount_paise
    wallet.updated_at = now

    bank_snapshot = encrypt_withdrawal_bank_snapshot(bank)
    req = WithdrawalRequest(
        user_id=user.id,
        amount_paise=amount_paise,
        status="paid",
        processed_at=now,
        account_holder_name=bank_snapshot["account_holder_name"],
        bank_name=bank_snapshot["bank_name"],
        account_number_masked=bank_snapshot["account_number_masked"],
        ifsc_code=bank_snapshot["ifsc_code"],
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
        )
    )

    if save_bank_account:
        upsert_bank_account(
            db,
            user_id=user.id,
            account_holder_name=bank.account_holder_name,
            bank_name=bank.bank_name,
            account_number=bank.account_number,
            ifsc_code=bank.ifsc_code,
        )
    else:
        db.commit()

    db.refresh(req)
    return req


def process_withdrawal(
    db: Session,
    *,
    withdrawal_id: int,
    admin: User,
    action: str,
    admin_note: Optional[str] = None,
    utr_reference: Optional[str] = None,
) -> WithdrawalRequest:
    req = db.query(WithdrawalRequest).filter(WithdrawalRequest.id == withdrawal_id).first()
    if req is None:
        raise ValueError("Withdrawal request not found.")
    if req.status != "pending":
        raise ValueError("Withdrawal request is already processed.")

    now = utcnow()
    if action == "paid":
        req.status = "paid"
        if utr_reference and utr_reference.strip():
            req.utr_reference = utr_reference.strip()
    elif action == "rejected":
        wallet = get_or_create_wallet(db, req.user_id, for_update=True)
        wallet.balance_paise += req.amount_paise
        wallet.updated_at = now
        db.add(
            WalletLedgerEntry(
                wallet_id=wallet.id,
                amount_paise=req.amount_paise,
                entry_type="adjustment",
                description="Withdrawal rejected — balance restored",
                reference_id=f"withdrawal:{req.id}:rejected",
                listener_user_id=None,
            )
        )
        req.status = "rejected"
    else:
        raise ValueError("Invalid withdrawal action.")

    req.admin_note = admin_note
    req.processed_by_id = admin.id
    req.processed_at = now
    db.commit()
    db.refresh(req)
    return req
