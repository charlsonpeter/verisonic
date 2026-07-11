import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.subscription_plans import SUBSCRIPTION_PLANS, get_plan
from app.db.session import get_db
from app.models import SubscriptionPayment, User
from app.services.razorpay_service import (
    RazorpayNotConfiguredError,
    create_order,
    new_receipt,
    verify_payment_signature,
)

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


class SubscriptionPlanResponse(BaseModel):
    id: str
    label: str
    cycle: str
    amount_paise: int
    amount_rupees: int
    currency: str
    description: str


class CreateOrderRequest(BaseModel):
    plan_id: str


class CreateOrderResponse(BaseModel):
    order_id: str
    amount_paise: int
    currency: str
    key_id: str
    plan_id: str
    plan_label: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class VerifyPaymentResponse(BaseModel):
    subscription: str
    subscription_cycle: str
    subscription_expires_at: datetime.datetime
    message: str


def _apply_plan_to_user(user: User, plan) -> None:
    if plan.subscription != "premium":
        raise HTTPException(status_code=400, detail="Invalid checkout plan")
    now = datetime.datetime.utcnow()
    if (
        user.subscription == "premium"
        and user.subscription_expires_at
        and user.subscription_expires_at > now
    ):
        base = user.subscription_expires_at
    else:
        base = now
    user.subscription = plan.subscription
    user.subscription_cycle = plan.cycle
    user.subscription_expires_at = base + datetime.timedelta(days=plan.duration_days)


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
def list_subscription_plans():
    return [
        SubscriptionPlanResponse(
            id=plan.id,
            label=plan.label,
            cycle=plan.cycle,
            amount_paise=plan.amount_paise,
            amount_rupees=plan.amount_rupees,
            currency=plan.currency,
            description=plan.description,
        )
        for plan in SUBSCRIPTION_PLANS.values()
    ]


@router.post("/create-order", response_model=CreateOrderResponse)
def create_subscription_order(
    body: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = get_plan(body.plan_id)
    if plan is None:
        raise HTTPException(status_code=400, detail="Invalid subscription plan")

    try:
        receipt = new_receipt()
        order = create_order(
            amount_paise=plan.amount_paise,
            currency=plan.currency,
            receipt=receipt,
            notes={
                "user_id": str(current_user.id),
                "plan_id": plan.id,
            },
        )
    except RazorpayNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    payment = SubscriptionPayment(
        user_id=current_user.id,
        plan_id=plan.id,
        amount_paise=plan.amount_paise,
        currency=plan.currency,
        razorpay_order_id=order["id"],
        status="created",
    )
    db.add(payment)
    db.commit()

    return CreateOrderResponse(
        order_id=order["id"],
        amount_paise=plan.amount_paise,
        currency=plan.currency,
        key_id=settings.RAZORPAY_KEY_ID,
        plan_id=plan.id,
        plan_label=plan.label,
    )


@router.post("/verify", response_model=VerifyPaymentResponse)
def verify_subscription_payment(
    body: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    payment = (
        db.query(SubscriptionPayment)
        .filter(
            SubscriptionPayment.razorpay_order_id == body.razorpay_order_id,
            SubscriptionPayment.user_id == current_user.id,
        )
        .first()
    )
    if payment is None:
        raise HTTPException(status_code=404, detail="Order not found")

    plan = get_plan(payment.plan_id)
    if plan is None:
        raise HTTPException(status_code=400, detail="Plan no longer available")

    if payment.status == "paid":
        return VerifyPaymentResponse(
            subscription=current_user.subscription,
            subscription_cycle=current_user.subscription_cycle or plan.cycle,
            subscription_expires_at=current_user.subscription_expires_at or datetime.datetime.utcnow(),
            message="Subscription already active.",
        )

    try:
        if not verify_payment_signature(
            order_id=body.razorpay_order_id,
            payment_id=body.razorpay_payment_id,
            signature=body.razorpay_signature,
        ):
            payment.status = "failed"
            db.commit()
            raise HTTPException(status_code=400, detail="Payment verification failed")
    except RazorpayNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    payment.status = "paid"
    payment.razorpay_payment_id = body.razorpay_payment_id
    payment.paid_at = datetime.datetime.utcnow()
    _apply_plan_to_user(current_user, plan)
    db.commit()
    db.refresh(current_user)

    return VerifyPaymentResponse(
        subscription=current_user.subscription,
        subscription_cycle=current_user.subscription_cycle or plan.cycle,
        subscription_expires_at=current_user.subscription_expires_at,
        message=f"{plan.label} activated successfully.",
    )
