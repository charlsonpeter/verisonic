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


def validate_revenue_settings_payload(
    data: dict[str, Any],
    *,
    current: PlatformRevenueSettings | None = None,
) -> None:
    company = data.get(
        "company_share_bps",
        current.company_share_bps if current is not None else None,
    )
    owner = data.get(
        "owner_share_bps",
        current.owner_share_bps if current is not None else None,
    )
    if company is not None and owner is not None and int(company) + int(owner) != 10000:
        raise ValueError("Company and owner shares must total 100%.")

    # Legacy pool fields: still optional to update, but if both provided must sum to 100%.
    if "studio_pool_bps" in data or "radio_pool_bps" in data:
        studio = data.get(
            "studio_pool_bps",
            current.studio_pool_bps if current is not None else None,
        )
        radio = data.get(
            "radio_pool_bps",
            current.radio_pool_bps if current is not None else None,
        )
        if studio is not None and radio is not None and int(studio) + int(radio) != 10000:
            raise ValueError("Studio and radio pool shares must total 100% of the owner pool.")

    positive_int_fields = (
        "premium_monthly_paise",
        "premium_yearly_paise",
        "min_track_seconds",
        "min_radio_heartbeat_sec",
        "min_withdrawal_paise",
        "min_valid_daily_listen_seconds",
        # legacy estimate fields (optional updates)
        "estimated_qualifying_plays_per_day",
        "estimated_radio_minutes_per_day",
    )
    for field in positive_int_fields:
        if field in data and data[field] is not None and int(data[field]) <= 0:
            raise ValueError(f"{field} must be greater than zero.")


def update_revenue_settings(db: Session, data: dict[str, Any]) -> PlatformRevenueSettings:
    settings = get_revenue_settings(db)
    validate_revenue_settings_payload(data, current=settings)
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
        "daily_settlement_enabled",
        "min_valid_daily_listen_seconds",
    }
    for key, value in data.items():
        if key not in allowed or value is None:
            continue
        if key == "daily_settlement_enabled":
            setattr(settings, key, bool(value))
        else:
            setattr(settings, key, int(value))
    db.commit()
    db.refresh(settings)
    return settings
