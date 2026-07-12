"""Self-service subscription plans (INR). Unlimited is admin-assigned only."""
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from sqlalchemy.orm import Session

PlanCycle = Literal["monthly", "yearly"]
PlanId = Literal["premium_monthly", "premium_yearly"]


@dataclass(frozen=True)
class SubscriptionPlan:
    id: PlanId
    label: str
    subscription: str
    cycle: PlanCycle
    amount_paise: int
    currency: str
    duration_days: int
    description: str

    @property
    def amount_rupees(self) -> int:
        return self.amount_paise // 100


DEFAULT_MONTHLY_PAISE = 9900
DEFAULT_YEARLY_PAISE = 99900


def _build_plans(*, monthly_paise: int, yearly_paise: int) -> Dict[PlanId, SubscriptionPlan]:
    return {
        "premium_monthly": SubscriptionPlan(
            id="premium_monthly",
            label="Premium Monthly",
            subscription="premium",
            cycle="monthly",
            amount_paise=monthly_paise,
            currency="INR",
            duration_days=30,
            description="Full lossless streaming, playlists, and premium quality for 30 days.",
        ),
        "premium_yearly": SubscriptionPlan(
            id="premium_yearly",
            label="Premium Yearly",
            subscription="premium",
            cycle="yearly",
            amount_paise=yearly_paise,
            currency="INR",
            duration_days=365,
            description="Full lossless streaming for 12 months — best value.",
        ),
    }


SUBSCRIPTION_PLANS: Dict[PlanId, SubscriptionPlan] = _build_plans(
    monthly_paise=DEFAULT_MONTHLY_PAISE,
    yearly_paise=DEFAULT_YEARLY_PAISE,
)


def get_subscription_plans(db: Optional[Session] = None) -> Dict[PlanId, SubscriptionPlan]:
    if db is None:
        return SUBSCRIPTION_PLANS
    from app.services.revenue_settings_service import get_revenue_settings

    settings = get_revenue_settings(db)
    return _build_plans(
        monthly_paise=settings.premium_monthly_paise,
        yearly_paise=settings.premium_yearly_paise,
    )


def get_plan(plan_id: str, db: Optional[Session] = None) -> SubscriptionPlan | None:
    return get_subscription_plans(db).get(plan_id)  # type: ignore[arg-type]


def plan_id_for_cycle(cycle: str) -> str | None:
    if cycle == "monthly":
        return "premium_monthly"
    if cycle == "yearly":
        return "premium_yearly"
    return None
