from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models import User, WalletLedgerEntry, WithdrawalRequest
from app.services.email_service import EmailNotConfiguredError, send_email_with_csv_attachment
from app.services.revenue_settings_service import get_revenue_settings
from app.services.wallet_service import (
    BankDetails,
    delete_saved_bank_account,
    get_or_create_wallet,
    get_saved_bank_account,
    mask_account_number,
    request_withdrawal,
    upsert_bank_account,
)
from app.services.withdrawal_export_service import (
    build_withdrawals_csv,
    export_filename,
    query_user_withdrawals,
)

router = APIRouter(prefix="/wallet", tags=["wallet"])


def _require_owner(user: User) -> None:
    real_role = getattr(user, "_real_role", None) or user.role
    if real_role not in ("studio_admin", "radio_admin"):
        raise HTTPException(status_code=403, detail="Wallet is available to studio and radio admins only.")


class WalletSummaryResponse(BaseModel):
    balance_paise: int
    balance_rupees: float
    pending_withdrawal_paise: int
    available_paise: int
    min_withdrawal_paise: int
    has_saved_bank_account: bool


class LedgerEntryResponse(BaseModel):
    id: int
    amount_paise: int
    entry_type: str
    description: Optional[str]
    created_at: datetime


class BankAccountResponse(BaseModel):
    account_holder_name: str
    bank_name: Optional[str]
    account_number_masked: str
    ifsc_code: str
    updated_at: Optional[datetime] = None


class BankAccountInput(BaseModel):
    account_holder_name: str = Field(min_length=2, max_length=120)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    account_number: str = Field(min_length=6, max_length=32)
    ifsc_code: str = Field(min_length=5, max_length=16)


class WithdrawalRequestBody(BaseModel):
    amount_paise: int = Field(gt=0)
    account_holder_name: str = Field(min_length=2, max_length=120)
    bank_name: Optional[str] = Field(default=None, max_length=120)
    account_number: str = Field(min_length=6, max_length=32)
    ifsc_code: str = Field(min_length=5, max_length=16)
    save_bank_account: bool = False


class WithdrawalResponse(BaseModel):
    id: int
    amount_paise: int
    status: str
    created_at: datetime
    processed_at: Optional[datetime]
    admin_note: Optional[str]


class WithdrawalsExportBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_date: date = Field(alias="from")
    to_date: date = Field(alias="to")
    timezone: Optional[str] = None


class WithdrawalsExportEmailResponse(BaseModel):
    message: str


def _export_withdrawals_csv(
    db: Session,
    user: User,
    from_date: date,
    to_date: date,
    timezone: Optional[str] = None,
) -> tuple[str, str]:
    rows = query_user_withdrawals(db, user_id=user.id, from_date=from_date, to_date=to_date)
    csv_content = build_withdrawals_csv(rows, timezone=timezone or "UTC")
    filename = export_filename(from_date, to_date)
    return csv_content, filename


def _bank_input_to_details(body: BankAccountInput | WithdrawalRequestBody) -> BankDetails:
    return BankDetails(
        account_holder_name=body.account_holder_name,
        bank_name=body.bank_name,
        account_number=body.account_number,
        ifsc_code=body.ifsc_code,
    )


@router.get("/summary", response_model=WalletSummaryResponse)
def wallet_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    wallet = get_or_create_wallet(db, current_user.id)
    pending_rows = (
        db.query(WithdrawalRequest)
        .filter(
            WithdrawalRequest.user_id == current_user.id,
            WithdrawalRequest.status == "pending",
        )
        .all()
    )
    pending = sum(row.amount_paise for row in pending_rows)
    revenue_settings = get_revenue_settings(db)
    saved = get_saved_bank_account(db, current_user.id)
    return WalletSummaryResponse(
        balance_paise=wallet.balance_paise,
        balance_rupees=wallet.balance_paise / 100,
        pending_withdrawal_paise=pending,
        available_paise=wallet.balance_paise,
        min_withdrawal_paise=revenue_settings.min_withdrawal_paise,
        has_saved_bank_account=saved is not None,
    )


@router.get("/ledger", response_model=List[LedgerEntryResponse])
def wallet_ledger(
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    wallet = get_or_create_wallet(db, current_user.id)
    query = db.query(WalletLedgerEntry).filter(WalletLedgerEntry.wallet_id == wallet.id)
    if from_date is not None:
        query = query.filter(WalletLedgerEntry.created_at >= datetime.combine(from_date, datetime.min.time()))
    if to_date is not None:
        query = query.filter(
            WalletLedgerEntry.created_at < datetime.combine(to_date + timedelta(days=1), datetime.min.time())
        )
    query = query.order_by(WalletLedgerEntry.created_at.desc())
    if from_date is None and to_date is None:
        query = query.limit(100)
    rows = query.all()
    return [
        LedgerEntryResponse(
            id=row.id,
            amount_paise=row.amount_paise,
            entry_type=row.entry_type,
            description=row.description,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.get("/bank-account", response_model=Optional[BankAccountResponse])
def get_bank_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    saved = get_saved_bank_account(db, current_user.id)
    if saved is None:
        return None
    return BankAccountResponse(
        account_holder_name=saved.account_holder_name,
        bank_name=saved.bank_name,
        account_number_masked=mask_account_number(saved.account_number),
        ifsc_code=saved.ifsc_code,
    )


@router.put("/bank-account", response_model=BankAccountResponse)
def save_bank_account(
    body: BankAccountInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    try:
        saved = upsert_bank_account(
            db,
            user_id=current_user.id,
            account_holder_name=body.account_holder_name,
            bank_name=body.bank_name,
            account_number=body.account_number,
            ifsc_code=body.ifsc_code,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return BankAccountResponse(
        account_holder_name=saved.account_holder_name,
        bank_name=saved.bank_name,
        account_number_masked=mask_account_number(saved.account_number),
        ifsc_code=saved.ifsc_code,
    )


@router.delete("/bank-account", status_code=status.HTTP_204_NO_CONTENT)
def remove_bank_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    delete_saved_bank_account(db, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/withdraw", response_model=WithdrawalResponse)
def create_withdrawal(
    body: WithdrawalRequestBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    try:
        req = request_withdrawal(
            db,
            user=current_user,
            amount_paise=body.amount_paise,
            bank=_bank_input_to_details(body),
            save_bank_account=body.save_bank_account,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return WithdrawalResponse(
        id=req.id,
        amount_paise=req.amount_paise,
        status=req.status,
        created_at=req.created_at,
        processed_at=req.processed_at,
        admin_note=req.admin_note,
    )


@router.get("/withdrawals", response_model=List[WithdrawalResponse])
def list_my_withdrawals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    rows = (
        db.query(WithdrawalRequest)
        .filter(WithdrawalRequest.user_id == current_user.id)
        .order_by(WithdrawalRequest.created_at.desc())
        .limit(10)
        .all()
    )
    return [
        WithdrawalResponse(
            id=row.id,
            amount_paise=row.amount_paise,
            status=row.status,
            created_at=row.created_at,
            processed_at=row.processed_at,
            admin_note=row.admin_note,
        )
        for row in rows
    ]


@router.get("/withdrawals/export.csv")
def export_withdrawals_csv(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    timezone: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    try:
        csv_content, filename = _export_withdrawals_csv(
            db, current_user, from_date, to_date, timezone=timezone
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/withdrawals/export/email", response_model=WithdrawalsExportEmailResponse)
def email_withdrawals_csv(
    body: WithdrawalsExportBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_owner(current_user)
    try:
        csv_content, filename = _export_withdrawals_csv(
            db,
            current_user,
            body.from_date,
            body.to_date,
            timezone=body.timezone,
        )
        send_email_with_csv_attachment(
            to_email=current_user.email,
            subject=f"VeriSonic payout export ({body.from_date} to {body.to_date})",
            body=(
                "Your VeriSonic payout register is attached.\n\n"
                f"Period: {body.from_date.isoformat()} to {body.to_date.isoformat()}\n"
                "Use this CSV for bank reconciliation and accounting records."
            ),
            filename=filename,
            csv_content=csv_content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not send export email.") from exc
    return WithdrawalsExportEmailResponse(
        message=f"CSV sent to {current_user.email}.",
    )
