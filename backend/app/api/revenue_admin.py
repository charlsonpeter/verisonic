from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_admin
from app.db.session import get_db
from app.models import User, WithdrawalRequest
from app.services.revenue_settings_service import get_revenue_settings, update_revenue_settings
from app.services.wallet_service import get_saved_bank_account, mask_account_number, process_withdrawal

router = APIRouter(prefix="/admin/revenue", tags=["admin-revenue"])


class RevenueSettingsResponse(BaseModel):
    premium_monthly_paise: int
    premium_yearly_paise: int
    premium_monthly_rupees: int
    premium_yearly_rupees: int
    company_share_bps: int
    owner_share_bps: int
    studio_pool_bps: int
    radio_pool_bps: int
    min_track_seconds: int
    min_radio_heartbeat_sec: int
    estimated_qualifying_plays_per_day: int
    estimated_radio_minutes_per_day: int
    min_withdrawal_paise: int
    updated_at: Optional[datetime] = None


class RevenueSettingsUpdate(BaseModel):
    premium_monthly_paise: Optional[int] = None
    premium_yearly_paise: Optional[int] = None
    company_share_bps: Optional[int] = Field(default=None, ge=0, le=10000)
    owner_share_bps: Optional[int] = Field(default=None, ge=0, le=10000)
    studio_pool_bps: Optional[int] = Field(default=None, ge=0, le=10000)
    radio_pool_bps: Optional[int] = Field(default=None, ge=0, le=10000)
    min_track_seconds: Optional[int] = Field(default=None, ge=1)
    min_radio_heartbeat_sec: Optional[int] = Field(default=None, ge=1)
    estimated_qualifying_plays_per_day: Optional[int] = Field(default=None, ge=1)
    estimated_radio_minutes_per_day: Optional[int] = Field(default=None, ge=1)
    min_withdrawal_paise: Optional[int] = Field(default=None, ge=1)


class AdminWithdrawalResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str]
    amount_paise: int
    status: str
    admin_note: Optional[str]
    created_at: datetime
    processed_at: Optional[datetime]
    account_holder_name: Optional[str]
    bank_name: Optional[str]
    account_number_masked: Optional[str]
    account_number: Optional[str]
    ifsc_code: Optional[str]


class ProcessWithdrawalRequest(BaseModel):
    action: str
    admin_note: Optional[str] = None


def _serialize_settings(settings) -> RevenueSettingsResponse:
    return RevenueSettingsResponse(
        premium_monthly_paise=settings.premium_monthly_paise,
        premium_yearly_paise=settings.premium_yearly_paise,
        premium_monthly_rupees=settings.premium_monthly_paise // 100,
        premium_yearly_rupees=settings.premium_yearly_paise // 100,
        company_share_bps=settings.company_share_bps,
        owner_share_bps=settings.owner_share_bps,
        studio_pool_bps=settings.studio_pool_bps,
        radio_pool_bps=settings.radio_pool_bps,
        min_track_seconds=settings.min_track_seconds,
        min_radio_heartbeat_sec=settings.min_radio_heartbeat_sec,
        estimated_qualifying_plays_per_day=settings.estimated_qualifying_plays_per_day,
        estimated_radio_minutes_per_day=settings.estimated_radio_minutes_per_day,
        min_withdrawal_paise=settings.min_withdrawal_paise,
        updated_at=settings.updated_at,
    )


@router.get("/settings", response_model=RevenueSettingsResponse)
def read_revenue_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    return _serialize_settings(get_revenue_settings(db))


@router.put("/settings", response_model=RevenueSettingsResponse)
def save_revenue_settings(
    body: RevenueSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        settings = update_revenue_settings(db, body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _serialize_settings(settings)


@router.get("/withdrawals", response_model=List[AdminWithdrawalResponse])
def list_withdrawals(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    query = db.query(WithdrawalRequest).order_by(WithdrawalRequest.created_at.desc())
    if status:
        query = query.filter(WithdrawalRequest.status == status)
    rows = query.limit(200).all()
    results: List[AdminWithdrawalResponse] = []
    for row in rows:
        user = db.query(User).filter(User.id == row.user_id).first()
        bank = get_saved_bank_account(db, row.user_id)
        results.append(
            AdminWithdrawalResponse(
                id=row.id,
                user_id=row.user_id,
                user_email=user.email if user else "",
                user_name=user.full_name if user else None,
                amount_paise=row.amount_paise,
                status=row.status,
                admin_note=row.admin_note,
                created_at=row.created_at,
                processed_at=row.processed_at,
                account_holder_name=bank.account_holder_name if bank else None,
                bank_name=bank.bank_name if bank else None,
                account_number_masked=mask_account_number(bank.account_number) if bank else None,
                account_number=bank.account_number if bank else None,
                ifsc_code=bank.ifsc_code if bank else None,
            )
        )
    return results


@router.post("/withdrawals/{withdrawal_id}/process", response_model=AdminWithdrawalResponse)
def process_withdrawal_request(
    withdrawal_id: int,
    body: ProcessWithdrawalRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    try:
        req = process_withdrawal(
            db,
            withdrawal_id=withdrawal_id,
            admin=admin,
            action=body.action,
            admin_note=body.admin_note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = db.query(User).filter(User.id == req.user_id).first()
    bank = get_saved_bank_account(db, req.user_id)
    return AdminWithdrawalResponse(
        id=req.id,
        user_id=req.user_id,
        user_email=user.email if user else "",
        user_name=user.full_name if user else None,
        amount_paise=req.amount_paise,
        status=req.status,
        admin_note=req.admin_note,
        created_at=req.created_at,
        processed_at=req.processed_at,
        account_holder_name=bank.account_holder_name if bank else None,
        bank_name=bank.bank_name if bank else None,
        account_number_masked=mask_account_number(bank.account_number) if bank else None,
        account_number=bank.account_number if bank else None,
        ifsc_code=bank.ifsc_code if bank else None,
    )
