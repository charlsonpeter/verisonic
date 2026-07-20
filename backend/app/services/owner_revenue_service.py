"""Owner earned totals and per-asset revenue for Accounts UI.

Post-settlement model: wallet credits use entry_type ``daily_settlement``.
Legacy ``credit_paise`` / ``total_credit_paise`` remain for pre-cutover rows only.
Track/station INR is attributed from each day's settlement by listen duration.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    BillableTrackPlay,
    DailySettlementCredit,
    OwnerWallet,
    RadioListenSession,
    Track,
    WalletLedgerEntry,
    WithdrawalRequest,
)
from app.services.daily_settlement_service import allocate_by_duration


EARNING_ENTRY_TYPES = ("daily_settlement", "track_play", "radio_listen")


def owner_earned_paise(db: Session, user_id: int) -> int:
    """Total credited to the owner wallet (settlement + any legacy listen credits)."""
    return int(
        db.query(func.coalesce(func.sum(WalletLedgerEntry.amount_paise), 0))
        .join(OwnerWallet, OwnerWallet.id == WalletLedgerEntry.wallet_id)
        .filter(
            OwnerWallet.user_id == user_id,
            WalletLedgerEntry.amount_paise > 0,
            WalletLedgerEntry.entry_type.in_(EARNING_ENTRY_TYPES),
        )
        .scalar()
        or 0
    )


def owner_withdrawn_paise(db: Session, user_id: int) -> int:
    return int(
        db.query(func.coalesce(func.sum(WithdrawalRequest.amount_paise), 0))
        .filter(WithdrawalRequest.user_id == user_id, WithdrawalRequest.status == "paid")
        .scalar()
        or 0
    )


def owner_balance_paise(db: Session, user_id: int) -> int:
    wallet = db.query(OwnerWallet).filter(OwnerWallet.user_id == user_id).first()
    return int(wallet.balance_paise) if wallet else 0


def owner_financials(db: Session, user_id: int) -> tuple[int, int, int]:
    """Returns (earned_paise, withdrawn_paise, balance_paise)."""
    return owner_earned_paise(db, user_id), owner_withdrawn_paise(db, user_id), owner_balance_paise(db, user_id)


def total_owners_earned_paise(db: Session) -> int:
    return int(
        db.query(func.coalesce(func.sum(WalletLedgerEntry.amount_paise), 0))
        .filter(
            WalletLedgerEntry.amount_paise > 0,
            WalletLedgerEntry.entry_type.in_(EARNING_ENTRY_TYPES),
        )
        .scalar()
        or 0
    )


def _settlement_credits_by_date(db: Session, owner_user_id: int) -> Dict[str, int]:
    rows = (
        db.query(DailySettlementCredit.settlement_date, DailySettlementCredit.amount_paise)
        .filter(DailySettlementCredit.owner_user_id == owner_user_id)
        .all()
    )
    out: Dict[str, int] = defaultdict(int)
    for date_str, amount in rows:
        out[str(date_str)] += int(amount or 0)
    return dict(out)


def track_revenue_by_id(db: Session, *, owner_user_id: int, artist_id: int) -> Dict[int, int]:
    """Per-track earned paise: duration share of daily settlement + legacy credit_paise."""
    revenue: Dict[int, int] = defaultdict(int)

    # Legacy realtime credits (pre-settlement cutover)
    legacy_rows = (
        db.query(BillableTrackPlay.track_id, func.coalesce(func.sum(BillableTrackPlay.credit_paise), 0))
        .filter(BillableTrackPlay.owner_user_id == owner_user_id)
        .group_by(BillableTrackPlay.track_id)
        .all()
    )
    for track_id, amount in legacy_rows:
        revenue[int(track_id)] += int(amount or 0)

    credits_by_date = _settlement_credits_by_date(db, owner_user_id)
    if not credits_by_date:
        return dict(revenue)

    # Seconds per track per UTC play_date for this owner
    sec_rows = (
        db.query(
            BillableTrackPlay.play_date,
            BillableTrackPlay.track_id,
            func.coalesce(func.sum(BillableTrackPlay.listened_seconds), 0),
        )
        .filter(BillableTrackPlay.owner_user_id == owner_user_id)
        .group_by(BillableTrackPlay.play_date, BillableTrackPlay.track_id)
        .all()
    )
    seconds_by_date: Dict[str, Dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for play_date, track_id, seconds in sec_rows:
        seconds_by_date[str(play_date)][int(track_id)] += float(seconds or 0)

    # Radio seconds per UTC day (so track rows don't absorb radio's share of settlement)
    radio_by_date: Dict[str, float] = defaultdict(float)
    radio_rows = (
        db.query(RadioListenSession.started_at, RadioListenSession.total_seconds)
        .filter(
            RadioListenSession.owner_user_id == owner_user_id,
            RadioListenSession.total_seconds > 0,
            RadioListenSession.started_at.isnot(None),
        )
        .all()
    )
    for started_at, total_seconds in radio_rows:
        radio_by_date[started_at.strftime("%Y-%m-%d")] += float(total_seconds or 0)

    # Include all artist tracks with 0 so callers can list them
    track_ids = [
        int(row[0])
        for row in db.query(Track.id).filter(Track.artist_id == artist_id).all()
    ]
    for tid in track_ids:
        revenue.setdefault(tid, 0)

    for date_str, credit in credits_by_date.items():
        if credit <= 0:
            continue
        by_track = seconds_by_date.get(date_str) or {}
        alloc_map: Dict[int, float] = {tid: float(sec) for tid, sec in by_track.items()}
        radio_sec = radio_by_date.get(date_str, 0.0)
        if radio_sec > 0:
            alloc_map[-1] = radio_sec
        if not alloc_map:
            continue
        shares = allocate_by_duration(credit, alloc_map)
        for tid, paise in shares.items():
            if tid > 0:
                revenue[tid] += paise

    return dict(revenue)


def station_revenue_by_id(db: Session, *, owner_user_id: int) -> Dict[int, int]:
    """Per-station earned paise: duration share of daily settlement + legacy session credits."""
    revenue: Dict[int, int] = defaultdict(int)

    legacy_rows = (
        db.query(
            RadioListenSession.station_id,
            func.coalesce(func.sum(RadioListenSession.total_credit_paise), 0),
        )
        .filter(RadioListenSession.owner_user_id == owner_user_id)
        .group_by(RadioListenSession.station_id)
        .all()
    )
    for station_id, amount in legacy_rows:
        revenue[int(station_id)] += int(amount or 0)

    credits_by_date = _settlement_credits_by_date(db, owner_user_id)
    if not credits_by_date:
        return dict(revenue)

    sec_rows = (
        db.query(
            RadioListenSession.station_id,
            RadioListenSession.started_at,
            RadioListenSession.total_seconds,
        )
        .filter(
            RadioListenSession.owner_user_id == owner_user_id,
            RadioListenSession.total_seconds > 0,
            RadioListenSession.started_at.isnot(None),
        )
        .all()
    )
    seconds_by_date: Dict[str, Dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for station_id, started_at, total_seconds in sec_rows:
        date_str = started_at.strftime("%Y-%m-%d")
        seconds_by_date[date_str][int(station_id)] += float(total_seconds or 0)

    track_by_date: Dict[str, float] = defaultdict(float)
    track_rows = (
        db.query(BillableTrackPlay.play_date, func.coalesce(func.sum(BillableTrackPlay.listened_seconds), 0))
        .filter(BillableTrackPlay.owner_user_id == owner_user_id)
        .group_by(BillableTrackPlay.play_date)
        .all()
    )
    for play_date, seconds in track_rows:
        track_by_date[str(play_date)] += float(seconds or 0)

    for date_str, credit in credits_by_date.items():
        if credit <= 0:
            continue
        by_station = seconds_by_date.get(date_str) or {}
        alloc_map: Dict[int, float] = {sid: float(sec) for sid, sec in by_station.items()}
        track_sec = track_by_date.get(date_str, 0.0)
        if track_sec > 0:
            alloc_map[-1] = track_sec
        if not alloc_map:
            continue
        shares = allocate_by_duration(credit, alloc_map)
        for sid, paise in shares.items():
            if sid > 0:
                revenue[sid] += paise

    return dict(revenue)


def station_listen_stats(db: Session, station_id: int) -> Tuple[int, int]:
    """Returns (listen_seconds, session_count)."""
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
    return listen_seconds, session_count


def track_play_counts(db: Session, *, owner_user_id: int, artist_id: int) -> Dict[int, int]:
    rows = (
        db.query(Track.id, func.count(BillableTrackPlay.id))
        .outerjoin(
            BillableTrackPlay,
            (BillableTrackPlay.track_id == Track.id)
            & (BillableTrackPlay.owner_user_id == owner_user_id),
        )
        .filter(Track.artist_id == artist_id)
        .group_by(Track.id)
        .all()
    )
    return {int(tid): int(cnt or 0) for tid, cnt in rows}
