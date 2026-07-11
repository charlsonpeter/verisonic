"""Self-service subscription plans (INR). Unlimited is admin-assigned only."""
from dataclasses import dataclass
from typing import Dict, Literal

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


SUBSCRIPTION_PLANS: Dict[PlanId, SubscriptionPlan] = {
    "premium_monthly": SubscriptionPlan(
        id="premium_monthly",
        label="Premium Monthly",
        subscription="premium",
        cycle="monthly",
        amount_paise=9900,
        currency="INR",
        duration_days=30,
        description="Full lossless streaming, playlists, and premium quality for 30 days.",
    ),
    "premium_yearly": SubscriptionPlan(
        id="premium_yearly",
        label="Premium Yearly",
        subscription="premium",
        cycle="yearly",
        amount_paise=99900,
        currency="INR",
        duration_days=365,
        description="Full lossless streaming for 12 months — best value.",
    ),
}


def get_plan(plan_id: str) -> SubscriptionPlan | None:
    return SUBSCRIPTION_PLANS.get(plan_id)  # type: ignore[arg-type]


def plan_id_for_cycle(cycle: str) -> str | None:
    if cycle == "monthly":
        return "premium_monthly"
    if cycle == "yearly":
        return "premium_yearly"
    return None
