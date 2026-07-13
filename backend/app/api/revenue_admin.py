from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth import get_current_admin
from app.db.session import get_db
from app.models import (
    Artist,
    BillableTrackPlay,
    OwnerWallet,
    RadioListenSession,
    RadioStation,
    SubscriptionPayment,
    Track,
    User,
    WithdrawalRequest,
)
from app.core.subscription_plans import get_plan
from app.services.accounts_export_service import (
    build_owner_detail_csv,
    build_owners_list_csv,
    build_subscriber_detail_csv,
    build_subscribers_list_csv,
    build_withdrawal_user_detail_csv,
    build_withdrawals_users_list_csv,
)
from app.services.revenue_settings_service import get_revenue_settings, update_revenue_settings
from app.services.wallet_service import (
    decrypt_withdrawal_bank_snapshot,
    get_saved_bank_account,
    mask_account_number,
)

router = APIRouter(prefix="/admin/revenue", tags=["admin-revenue"])


def _csv_attachment_response(content: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    utr_reference: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime]
    account_holder_name: Optional[str]
    bank_name: Optional[str]
    account_number_masked: Optional[str]
    account_number: Optional[str]
    ifsc_code: Optional[str]


class AccountsSummaryResponse(BaseModel):
    subscription_revenue_paise: int
    owners_revenue_paise: int
    total_withdrawn_paise: int
    total_balance_paise: int
    studio_count: int
    station_count: int
    premium_subscriber_count: int
    pending_subscription_count: int


class AdminOwnerAccountResponse(BaseModel):
    user_id: int
    email: str
    owner_name: str
    account_type: str
    total_revenue_paise: int
    total_withdrawals_paise: int
    balance_paise: int


class StudioRevenueDetail(BaseModel):
    studio_id: int
    stage_name: str
    track_revenue_paise: int
    qualifying_plays: int


class TrackRevenueDetail(BaseModel):
    track_id: int
    title: str
    revenue_paise: int
    play_count: int


class StationRevenueDetail(BaseModel):
    station_id: int
    name: str
    revenue_paise: int
    listen_seconds: int
    session_count: int


class AdminOwnerAccountDetailResponse(BaseModel):
    user_id: int
    email: str
    owner_name: str
    account_type: str
    total_revenue_paise: int
    total_withdrawals_paise: int
    balance_paise: int
    studio: Optional[StudioRevenueDetail] = None
    tracks: List[TrackRevenueDetail] = []
    stations: List[StationRevenueDetail] = []
    list_total: int = 0
    has_more: bool = False


class AdminSubscriptionPaymentResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str]
    plan_id: str
    amount_paise: int
    status: str
    razorpay_order_id: str
    razorpay_payment_id: Optional[str]
    created_at: datetime
    paid_at: Optional[datetime]


class AdminSubscriberResponse(BaseModel):
    user_id: int
    user_email: str
    user_name: Optional[str]
    subscription: str
    subscription_cycle: Optional[str]
    subscription_status: str
    next_payment_at: Optional[datetime]
    last_amount_paise: Optional[int]
    last_payment_status: str
    last_payment_at: Optional[datetime]


class AdminSubscriberPaymentItem(BaseModel):
    id: int
    plan_id: str
    plan_label: str
    amount_paise: int
    status: str
    razorpay_order_id: str
    razorpay_payment_id: Optional[str]
    created_at: datetime
    paid_at: Optional[datetime]


class AdminSubscriberDetailResponse(BaseModel):
    user_id: int
    user_email: str
    user_name: Optional[str]
    subscription: str
    subscription_cycle: Optional[str]
    subscription_status: str
    subscription_activated_at: Optional[datetime]
    subscription_expires_at: Optional[datetime]
    next_payment_at: Optional[datetime]
    pending_plan_id: Optional[str]
    pending_plan_label: Optional[str]
    pending_plan_paid: bool
    payments: List[AdminSubscriberPaymentItem]
    payments_total: int = 0
    has_more_payments: bool = False


class PaginatedAdminOwnerAccountsResponse(BaseModel):
    items: List[AdminOwnerAccountResponse]
    total: int
    has_more: bool


class PaginatedAdminSubscribersResponse(BaseModel):
    items: List[AdminSubscriberResponse]
    total: int
    has_more: bool


class AdminWithdrawalUserResponse(BaseModel):
    user_id: int
    email: str
    owner_name: str
    account_type: str
    total_withdrawals_paise: int
    withdrawal_count: int
    balance_paise: int
    last_withdrawal_at: Optional[datetime]


class AdminWithdrawalUserItem(BaseModel):
    id: int
    amount_paise: int
    status: str
    admin_note: Optional[str]
    utr_reference: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime]
    account_holder_name: Optional[str]
    bank_name: Optional[str]
    account_number_masked: Optional[str]
    ifsc_code: Optional[str]


class AdminWithdrawalUserDetailResponse(BaseModel):
    user_id: int
    email: str
    owner_name: str
    account_type: str
    total_withdrawals_paise: int
    balance_paise: int
    withdrawal_count: int
    withdrawals: List[AdminWithdrawalUserItem]
    withdrawals_total: int = 0
    has_more_withdrawals: bool = False


class PaginatedAdminWithdrawalUsersResponse(BaseModel):
    items: List[AdminWithdrawalUserResponse]
    total: int
    has_more: bool


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


def _withdrawal_bank_details(db: Session, row: WithdrawalRequest) -> dict[str, Optional[str]]:
    if row.account_holder_name:
        snap = decrypt_withdrawal_bank_snapshot(row)
        return {
            "account_holder_name": snap.get("account_holder_name") or None,
            "bank_name": snap.get("bank_name") or None,
            "account_number": row.account_number_masked,
            "account_number_masked": row.account_number_masked,
            "ifsc_code": snap.get("ifsc_code") or None,
        }
    bank = get_saved_bank_account(db, row.user_id)
    if not bank:
        return {
            "account_holder_name": None,
            "bank_name": None,
            "account_number": None,
            "account_number_masked": None,
            "ifsc_code": None,
        }
    return {
        "account_holder_name": bank.account_holder_name,
        "bank_name": bank.bank_name,
        "account_number": bank.account_number,
        "account_number_masked": mask_account_number(bank.account_number),
        "ifsc_code": bank.ifsc_code,
    }


def _serialize_withdrawal(db: Session, row: WithdrawalRequest) -> AdminWithdrawalResponse:
    user = db.query(User).filter(User.id == row.user_id).first()
    bank = _withdrawal_bank_details(db, row)
    return AdminWithdrawalResponse(
        id=row.id,
        user_id=row.user_id,
        user_email=user.email if user else "",
        user_name=user.full_name if user else None,
        amount_paise=row.amount_paise,
        status=row.status,
        admin_note=row.admin_note,
        utr_reference=row.utr_reference,
        created_at=row.created_at,
        processed_at=row.processed_at,
        account_holder_name=bank["account_holder_name"],
        bank_name=bank["bank_name"],
        account_number_masked=bank["account_number_masked"],
        account_number=bank["account_number"],
        ifsc_code=bank["ifsc_code"],
    )


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
    total_revenue = track_revenue + radio_revenue
    return total_revenue, withdrawn, balance


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


def _pending_subscription_count(db: Session) -> int:
    """Users whose most recent subscription payment attempt failed."""
    latest_payment_ids = (
        db.query(func.max(SubscriptionPayment.id).label("latest_id"))
        .group_by(SubscriptionPayment.user_id)
        .subquery()
    )
    return int(
        db.query(func.count(SubscriptionPayment.id))
        .join(latest_payment_ids, SubscriptionPayment.id == latest_payment_ids.c.latest_id)
        .filter(SubscriptionPayment.status == "failed")
        .scalar()
        or 0
    )


@router.get("/summary", response_model=AccountsSummaryResponse)
def accounts_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    total_balance = int(
        db.query(func.coalesce(func.sum(OwnerWallet.balance_paise), 0)).scalar() or 0
    )
    withdrawn_paise = int(
        db.query(func.coalesce(func.sum(WithdrawalRequest.amount_paise), 0))
        .filter(WithdrawalRequest.status == "paid")
        .scalar()
        or 0
    )
    premium_count = int(
        db.query(func.count(User.id)).filter(User.subscription == "premium").scalar() or 0
    )
    sub_revenue = int(
        db.query(func.coalesce(func.sum(SubscriptionPayment.amount_paise), 0))
        .filter(SubscriptionPayment.status == "paid")
        .scalar()
        or 0
    )
    track_owner_revenue = int(
        db.query(func.coalesce(func.sum(BillableTrackPlay.credit_paise), 0)).scalar() or 0
    )
    radio_owner_revenue = int(
        db.query(func.coalesce(func.sum(RadioListenSession.total_credit_paise), 0)).scalar() or 0
    )
    studio_count = int(
        db.query(func.count(User.id)).filter(User.role == "studio_admin").scalar() or 0
    )
    station_count = int(db.query(func.count(RadioStation.id)).scalar() or 0)
    pending_subscription_count = _pending_subscription_count(db)
    return AccountsSummaryResponse(
        subscription_revenue_paise=sub_revenue,
        owners_revenue_paise=track_owner_revenue + radio_owner_revenue,
        total_withdrawn_paise=withdrawn_paise,
        total_balance_paise=total_balance,
        studio_count=studio_count,
        station_count=station_count,
        premium_subscriber_count=premium_count,
        pending_subscription_count=pending_subscription_count,
    )


def _collect_owner_accounts(db: Session) -> List[AdminOwnerAccountResponse]:
    results: List[AdminOwnerAccountResponse] = []
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
        results.append(
            AdminOwnerAccountResponse(
                user_id=user.id,
                email=user.email,
                owner_name=_owner_display_name(user, artist, stations),
                account_type=_resolve_account_type(user),
                total_revenue_paise=total_revenue,
                total_withdrawals_paise=withdrawn,
                balance_paise=balance,
            )
        )
    results.sort(key=lambda row: (-row.total_revenue_paise, row.owner_name.lower()))
    return results


def _normalize_search(search: Optional[str]) -> Optional[str]:
    if not search:
        return None
    stripped = search.strip().lower()
    return stripped or None


def _owner_matches_search(row: AdminOwnerAccountResponse, query: str) -> bool:
    haystack = " ".join(
        filter(None, [row.owner_name or "", row.email or "", row.account_type or ""])
    ).lower()
    return query in haystack


def _subscriber_matches_search(row: AdminSubscriberResponse, query: str) -> bool:
    haystack = " ".join(
        filter(
            None,
            [
                row.user_name or "",
                row.user_email or "",
                row.subscription or "",
                row.subscription_cycle or "",
                row.last_payment_status or "",
                row.subscription_status or "",
            ],
        )
    ).lower()
    return query in haystack


def _payment_matches_search(payment: AdminSubscriberPaymentItem, query: str) -> bool:
    haystack = " ".join(
        filter(
            None,
            [
                payment.plan_label or "",
                payment.plan_id or "",
                payment.status or "",
                payment.razorpay_order_id or "",
                payment.razorpay_payment_id or "",
            ],
        )
    ).lower()
    return query in haystack


def _withdrawal_user_matches_search(row: AdminWithdrawalUserResponse, query: str) -> bool:
    haystack = " ".join(
        filter(None, [row.owner_name or "", row.email or "", row.account_type or ""])
    ).lower()
    return query in haystack


def _serialize_withdrawal_user_item(db: Session, row: WithdrawalRequest) -> AdminWithdrawalUserItem:
    bank = _withdrawal_bank_details(db, row)
    return AdminWithdrawalUserItem(
        id=row.id,
        amount_paise=row.amount_paise,
        status=row.status,
        admin_note=row.admin_note,
        utr_reference=row.utr_reference,
        created_at=row.created_at,
        processed_at=row.processed_at,
        account_holder_name=bank["account_holder_name"],
        bank_name=bank["bank_name"],
        account_number_masked=bank["account_number_masked"],
        ifsc_code=bank["ifsc_code"],
    )


def _withdrawal_item_matches_search(item: AdminWithdrawalUserItem, query: str) -> bool:
    amount_rupees = f"{item.amount_paise / 100:.2f}"
    transaction_number = item.utr_reference or str(item.id)
    haystack = " ".join(
        filter(
            None,
            [
                str(item.id),
                transaction_number,
                item.status or "",
                item.utr_reference or "",
                item.admin_note or "",
                item.bank_name or "",
                item.account_number_masked or "",
                item.ifsc_code or "",
                item.account_holder_name or "",
                amount_rupees,
                str(item.amount_paise),
            ],
        )
    ).lower()
    return query in haystack


def _collect_withdrawal_users(db: Session) -> List[AdminWithdrawalUserResponse]:
    user_ids = [
        row[0]
        for row in db.query(WithdrawalRequest.user_id).distinct().all()
    ]
    results: List[AdminWithdrawalUserResponse] = []
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
        results.append(
            AdminWithdrawalUserResponse(
                user_id=user.id,
                email=user.email,
                owner_name=_owner_display_name(user, artist, stations),
                account_type=_resolve_account_type(user),
                total_withdrawals_paise=withdrawn,
                withdrawal_count=count,
                balance_paise=balance,
                last_withdrawal_at=last_at,
            )
        )
    results.sort(
        key=lambda row: (
            -(row.last_withdrawal_at.timestamp() if row.last_withdrawal_at else 0),
            row.owner_name.lower(),
        )
    )
    return results


@router.get("/owners", response_model=PaginatedAdminOwnerAccountsResponse)
def list_owner_accounts(
    search: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    results = _collect_owner_accounts(db)
    if query := _normalize_search(search):
        results = [row for row in results if _owner_matches_search(row, query)]
    total = len(results)
    page = results[offset : offset + limit]
    return PaginatedAdminOwnerAccountsResponse(
        items=page,
        total=total,
        has_more=offset + len(page) < total,
    )


@router.get("/owners/export.csv")
def export_owner_accounts_csv(
    timezone: Optional[str] = Query(None),
    locale: Optional[str] = Query("en-US"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        content, filename = build_owners_list_csv(db, timezone=timezone or "UTC", locale=locale or "en-US")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _csv_attachment_response(content, filename)


@router.get("/owners/{user_id}", response_model=AdminOwnerAccountDetailResponse)
def get_owner_account_detail(
    user_id: int,
    search: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.role not in ("studio_admin", "radio_admin"):
        raise HTTPException(status_code=404, detail="Owner account not found")

    artist = db.query(Artist).filter(Artist.user_id == user_id).first()
    stations = db.query(RadioStation).filter(RadioStation.owner_id == user_id).order_by(RadioStation.name.asc()).all()
    account_type = _resolve_account_type(user)
    total_revenue, withdrawn, balance = _owner_financials(db, user_id)

    studio_detail = None
    track_details: List[TrackRevenueDetail] = []
    if user.role == "studio_admin" and artist is not None:
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
        track_details = [
            TrackRevenueDetail(
                track_id=int(track_id),
                title=title,
                revenue_paise=int(revenue or 0),
                play_count=int(play_count or 0),
            )
            for track_id, title, revenue, play_count in track_rows
        ]
        if query := _normalize_search(search):
            track_details = [
                row for row in track_details if query in (row.title or "").lower()
            ]
        total = len(track_details)
        track_page = track_details[offset : offset + limit]
        return AdminOwnerAccountDetailResponse(
            user_id=user.id,
            email=user.email,
            owner_name=_owner_display_name(user, artist, stations),
            account_type=account_type,
            total_revenue_paise=total_revenue,
            total_withdrawals_paise=withdrawn,
            balance_paise=balance,
            studio=studio_detail,
            tracks=track_page,
            stations=[],
            list_total=total,
            has_more=offset + len(track_page) < total,
        )

    station_details: List[StationRevenueDetail] = []
    if user.role == "radio_admin":
        for station in stations:
            revenue, listen_seconds, session_count = _station_revenue_stats(db, station.id)
            station_details.append(
                StationRevenueDetail(
                    station_id=station.id,
                    name=station.name,
                    revenue_paise=revenue,
                    listen_seconds=listen_seconds,
                    session_count=session_count,
                )
            )

    if query := _normalize_search(search):
        station_details = [
            row for row in station_details if query in (row.name or "").lower()
        ]
    total = len(station_details)
    station_page = station_details[offset : offset + limit]
    return AdminOwnerAccountDetailResponse(
        user_id=user.id,
        email=user.email,
        owner_name=_owner_display_name(user, artist, stations),
        account_type=account_type,
        total_revenue_paise=total_revenue,
        total_withdrawals_paise=withdrawn,
        balance_paise=balance,
        studio=studio_detail,
        tracks=[],
        stations=station_page,
        list_total=total,
        has_more=offset + len(station_page) < total,
    )


@router.get("/owners/{user_id}/export.csv")
def export_owner_account_detail_csv(
    user_id: int,
    timezone: Optional[str] = Query(None),
    locale: Optional[str] = Query("en-US"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        content, filename = build_owner_detail_csv(
            db,
            user_id,
            timezone=timezone or "UTC",
            locale=locale or "en-US",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _csv_attachment_response(content, filename)


def _latest_subscription_payment(db: Session, user_id: int) -> Optional[SubscriptionPayment]:
    return (
        db.query(SubscriptionPayment)
        .filter(SubscriptionPayment.user_id == user_id)
        .order_by(SubscriptionPayment.id.desc())
        .first()
    )


def _subscriber_last_payment_status(user: User, latest: Optional[SubscriptionPayment]) -> str:
    if latest is not None:
        return latest.status
    return "active"


def _subscriber_subscription_status(user: User) -> str:
    return "cancelled" if user.subscription_cancel_at_period_end else "active"


def _subscriber_next_payment_at(user: User) -> Optional[datetime]:
    if user.subscription_cancel_at_period_end:
        return None
    return user.subscription_expires_at


def _collect_subscribers(db: Session, status: Optional[str] = None) -> List[AdminSubscriberResponse]:
    users = (
        db.query(User)
        .filter(User.subscription == "premium")
        .order_by(User.full_name.asc().nulls_last(), User.email.asc())
        .all()
    )
    results: List[AdminSubscriberResponse] = []
    for user in users:
        latest = _latest_subscription_payment(db, user.id)
        last_status = _subscriber_last_payment_status(user, latest)
        if status and last_status != status:
            continue
        last_payment_at = None
        if latest is not None:
            last_payment_at = latest.paid_at or latest.created_at
        results.append(
            AdminSubscriberResponse(
                user_id=user.id,
                user_email=user.email,
                user_name=user.full_name,
                subscription=user.subscription,
                subscription_cycle=user.subscription_cycle,
                subscription_status=_subscriber_subscription_status(user),
                next_payment_at=_subscriber_next_payment_at(user),
                last_amount_paise=latest.amount_paise if latest else None,
                last_payment_status=last_status,
                last_payment_at=last_payment_at,
            )
        )
    return results


@router.get("/subscribers", response_model=PaginatedAdminSubscribersResponse)
def list_subscribers(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    results = _collect_subscribers(db, status)
    if query := _normalize_search(search):
        results = [row for row in results if _subscriber_matches_search(row, query)]
    total = len(results)
    page = results[offset : offset + limit]
    return PaginatedAdminSubscribersResponse(
        items=page,
        total=total,
        has_more=offset + len(page) < total,
    )


@router.get("/subscribers/export.csv")
def export_subscribers_csv(
    status: Optional[str] = None,
    timezone: Optional[str] = Query(None),
    locale: Optional[str] = Query("en-US"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        content, filename = build_subscribers_list_csv(
            db,
            status=status,
            timezone=timezone or "UTC",
            locale=locale or "en-US",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _csv_attachment_response(content, filename)


def _plan_label(plan_id: str, db: Session) -> str:
    plan = get_plan(plan_id, db)
    if plan is not None:
        return plan.label
    return plan_id.replace("_", " ").title()


@router.get("/subscribers/{user_id}", response_model=AdminSubscriberDetailResponse)
def get_subscriber_detail(
    user_id: int,
    search: Optional[str] = None,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    if from_date is not None and to_date is not None and to_date < from_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or user.subscription != "premium":
        raise HTTPException(status_code=404, detail="Subscriber not found")

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
    pending_plan_label = None
    if user.pending_plan_id:
        pending_plan_label = _plan_label(user.pending_plan_id, db)

    payment_items = [
        AdminSubscriberPaymentItem(
            id=payment.id,
            plan_id=payment.plan_id,
            plan_label=_plan_label(payment.plan_id, db),
            amount_paise=payment.amount_paise,
            status=payment.status,
            razorpay_order_id=payment.razorpay_order_id,
            razorpay_payment_id=payment.razorpay_payment_id,
            created_at=payment.created_at,
            paid_at=payment.paid_at,
        )
        for payment in payments
    ]
    if query := _normalize_search(search):
        payment_items = [row for row in payment_items if _payment_matches_search(row, query)]
    total = len(payment_items)
    payment_page = payment_items[offset : offset + limit]

    return AdminSubscriberDetailResponse(
        user_id=user.id,
        user_email=user.email,
        user_name=user.full_name,
        subscription=user.subscription,
        subscription_cycle=user.subscription_cycle,
        subscription_status=_subscriber_subscription_status(user),
        subscription_activated_at=user.subscription_activated_at,
        subscription_expires_at=user.subscription_expires_at,
        next_payment_at=_subscriber_next_payment_at(user),
        pending_plan_id=user.pending_plan_id,
        pending_plan_label=pending_plan_label,
        pending_plan_paid=bool(user.pending_plan_paid),
        payments=payment_page,
        payments_total=total,
        has_more_payments=offset + len(payment_page) < total,
    )


@router.get("/subscribers/{user_id}/export.csv")
def export_subscriber_detail_csv(
    user_id: int,
    search: Optional[str] = None,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    timezone: Optional[str] = Query(None),
    locale: Optional[str] = Query("en-US"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        content, filename = build_subscriber_detail_csv(
            db,
            user_id,
            timezone=timezone or "UTC",
            locale=locale or "en-US",
            from_date=from_date,
            to_date=to_date,
            search=search,
        )
    except ValueError as exc:
        status = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return _csv_attachment_response(content, filename)


@router.get("/subscription-payments", response_model=List[AdminSubscriptionPaymentResponse])
def list_subscription_payments(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    query = (
        db.query(SubscriptionPayment, User)
        .join(User, SubscriptionPayment.user_id == User.id)
        .order_by(SubscriptionPayment.created_at.desc())
    )
    if status:
        query = query.filter(SubscriptionPayment.status == status)
    rows = query.limit(200).all()
    return [
        AdminSubscriptionPaymentResponse(
            id=payment.id,
            user_id=user.id,
            user_email=user.email,
            user_name=user.full_name,
            plan_id=payment.plan_id,
            amount_paise=payment.amount_paise,
            status=payment.status,
            razorpay_order_id=payment.razorpay_order_id,
            razorpay_payment_id=payment.razorpay_payment_id,
            created_at=payment.created_at,
            paid_at=payment.paid_at,
        )
        for payment, user in rows
    ]


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


@router.get("/withdrawals/users", response_model=PaginatedAdminWithdrawalUsersResponse)
def list_withdrawal_users(
    search: Optional[str] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    results = _collect_withdrawal_users(db)
    if query := _normalize_search(search):
        results = [row for row in results if _withdrawal_user_matches_search(row, query)]
    total = len(results)
    page = results[offset : offset + limit]
    return PaginatedAdminWithdrawalUsersResponse(
        items=page,
        total=total,
        has_more=offset + len(page) < total,
    )


@router.get("/withdrawals/users/export.csv")
def export_withdrawal_users_csv(
    timezone: Optional[str] = Query(None),
    locale: Optional[str] = Query("en-US"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        content, filename = build_withdrawals_users_list_csv(
            db,
            timezone=timezone or "UTC",
            locale=locale or "en-US",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _csv_attachment_response(content, filename)


@router.get("/withdrawals/users/{user_id}", response_model=AdminWithdrawalUserDetailResponse)
def get_withdrawal_user_detail(
    user_id: int,
    search: Optional[str] = None,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    if from_date is not None and to_date is not None and to_date < from_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    has_withdrawals = (
        db.query(WithdrawalRequest.id)
        .filter(WithdrawalRequest.user_id == user_id)
        .first()
    )
    if not has_withdrawals:
        raise HTTPException(status_code=404, detail="No withdrawals found for this user")

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
    rows = query.order_by(WithdrawalRequest.created_at.desc()).all()

    items = [_serialize_withdrawal_user_item(db, row) for row in rows]
    if search_query := _normalize_search(search):
        items = [row for row in items if _withdrawal_item_matches_search(row, search_query)]

    total = len(items)
    page = items[offset : offset + limit]

    return AdminWithdrawalUserDetailResponse(
        user_id=user.id,
        email=user.email,
        owner_name=_owner_display_name(user, artist, stations),
        account_type=_resolve_account_type(user),
        total_withdrawals_paise=withdrawn,
        balance_paise=balance,
        withdrawal_count=count,
        withdrawals=page,
        withdrawals_total=total,
        has_more_withdrawals=offset + len(page) < total,
    )


@router.get("/withdrawals/users/{user_id}/export.csv")
def export_withdrawal_user_detail_csv(
    user_id: int,
    search: Optional[str] = None,
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    timezone: Optional[str] = Query(None),
    locale: Optional[str] = Query("en-US"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    try:
        content, filename = build_withdrawal_user_detail_csv(
            db,
            user_id,
            timezone=timezone or "UTC",
            locale=locale or "en-US",
            from_date=from_date,
            to_date=to_date,
            search=search,
        )
    except ValueError as exc:
        status = 404 if "not found" in str(exc).lower() else 400
        raise HTTPException(status_code=status, detail=str(exc)) from exc
    return _csv_attachment_response(content, filename)


@router.get("/withdrawals", response_model=List[AdminWithdrawalResponse])
def list_withdrawals(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
):
    """Completed owner withdrawals (instant self-service; no admin approval queue)."""
    rows = (
        db.query(WithdrawalRequest)
        .filter(WithdrawalRequest.status == "paid")
        .order_by(WithdrawalRequest.created_at.desc())
        .limit(200)
        .all()
    )
    return [_serialize_withdrawal(db, row) for row in rows]
