from typing import Any

from sqlalchemy.orm import Session

from app.models import PlatformRevenueSettings


def get_revenue_settings(db: Session) -> PlatformRevenueSettings:
    row = db.query(PlatformRevenueSettings).filter(PlatformRevenueSettings.id == 1).first()
    if row is None:
        row = PlatformRevenueSettings(id=1)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def validate_revenue_settings_payload(data: dict[str, Any]) -> None:
    share_fields = ("company_share_bps", "owner_share_bps")
    if all(k in data for k in share_fields):
        if data["company_share_bps"] + data["owner_share_bps"] != 10000:
            raise ValueError("Company and owner shares must total 100%.")
    pool_fields = ("studio_pool_bps", "radio_pool_bps")
    if all(k in data for k in pool_fields):
        if data["studio_pool_bps"] + data["radio_pool_bps"] != 10000:
            raise ValueError("Studio and radio pool shares must total 100% of the owner pool.")

    positive_int_fields = (
        "premium_monthly_paise",
        "premium_yearly_paise",
        "min_track_seconds",
        "min_radio_heartbeat_sec",
        "estimated_qualifying_plays_per_day",
        "estimated_radio_minutes_per_day",
        "min_withdrawal_paise",
    )
    for field in positive_int_fields:
        if field in data and int(data[field]) <= 0:
            raise ValueError(f"{field} must be greater than zero.")


def update_revenue_settings(db: Session, data: dict[str, Any]) -> PlatformRevenueSettings:
    validate_revenue_settings_payload(data)
    settings = get_revenue_settings(db)
    allowed = {
        "premium_monthly_paise",
        "premium_yearly_paise",
        "company_share_bps",
        "owner_share_bps",
        "studio_pool_bps",
        "radio_pool_bps",
        "min_track_seconds",
        "min_radio_heartbeat_sec",
        "estimated_qualifying_plays_per_day",
        "estimated_radio_minutes_per_day",
        "min_withdrawal_paise",
    }
    for key, value in data.items():
        if key in allowed and value is not None:
            setattr(settings, key, int(value))
    db.commit()
    db.refresh(settings)
    return settings
