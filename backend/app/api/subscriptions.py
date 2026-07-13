import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.config import settings
from app.core.premium import is_trial_active
from app.core.subscription_plans import get_plan, get_subscription_plans
from app.db.session import get_db
from app.models import SubscriptionPayment, User
from app.services.razorpay_service import (
    RazorpayNotConfiguredError,
    create_order,
    new_receipt,
    verify_payment_signature,
)
from app.services.subscription_service import (
    apply_pending_subscription_if_due,
    apply_plan_immediately,
    clear_cancellation,
    handle_subscription_payment_failure,
    premium_is_active,
    queue_plan_change,
    schedule_cancellation,
    validate_checkout_plan,
    validate_schedule_change,
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
    queued: bool = False


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentFailedRequest(BaseModel):
    razorpay_order_id: str


class PaymentFailedResponse(BaseModel):
    message: str
    subscription: str


class VerifyPaymentResponse(BaseModel):
    subscription: str
    subscription_cycle: str
    subscription_expires_at: datetime.datetime
    message: str
    queued: bool = False
    pending_plan_id: Optional[str] = None


class ScheduleChangeRequest(BaseModel):
    plan_id: str


class SubscriptionStatusResponse(BaseModel):
    subscription: str
    subscription_cycle: Optional[str] = None
    subscription_expires_at: Optional[datetime.datetime] = None
    subscription_activated_at: Optional[datetime.datetime] = None
    is_active: bool
    current_plan_id: Optional[str] = None
    pending_plan_id: Optional[str] = None
    pending_plan_label: Optional[str] = None
    pending_plan_paid: bool = False
    cancel_at_period_end: bool = False


class SubscriptionActionResponse(BaseModel):
    message: str
    subscription_expires_at: Optional[datetime.datetime] = None
    pending_plan_id: Optional[str] = None
    pending_plan_paid: bool = False
    cancel_at_period_end: bool = False


def _sync_user_subscription(user: User, db: Session) -> None:
    apply_pending_subscription_if_due(user, db)
    db.refresh(user)


def _pending_plan_label(plan_id: Optional[str], db: Session) -> Optional[str]:
    if not plan_id:
        return None
    plan = get_plan(plan_id, db)
    return plan.label if plan else None


@router.get("/status", response_model=SubscriptionStatusResponse)
def get_subscription_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
    from app.services.subscription_service import current_plan_id

    return SubscriptionStatusResponse(
        subscription=current_user.subscription,
        subscription_cycle=current_user.subscription_cycle,
        subscription_expires_at=current_user.subscription_expires_at,
        subscription_activated_at=current_user.subscription_activated_at,
        is_active=premium_is_active(current_user),
        current_plan_id=current_plan_id(current_user),
        pending_plan_id=current_user.pending_plan_id,
        pending_plan_label=_pending_plan_label(current_user.pending_plan_id, db),
        pending_plan_paid=bool(current_user.pending_plan_paid),
        cancel_at_period_end=bool(current_user.subscription_cancel_at_period_end),
    )


@router.get("/plans", response_model=List[SubscriptionPlanResponse])
def list_subscription_plans(db: Session = Depends(get_db)):
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
        for plan in get_subscription_plans(db).values()
    ]


@router.post("/create-order", response_model=CreateOrderResponse)
def create_subscription_order(
    body: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
    plan = get_plan(body.plan_id, db)
    if plan is None:
        raise HTTPException(status_code=400, detail="Invalid subscription plan")

    validate_checkout_plan(current_user, plan)
    queued = premium_is_active(current_user)

    try:
        receipt = new_receipt()
        order = create_order(
            amount_paise=plan.amount_paise,
            currency=plan.currency,
            receipt=receipt,
            notes={
                "user_id": str(current_user.id),
                "plan_id": plan.id,
                "queued": "true" if queued else "false",
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
        queued=queued,
    )


@router.post("/verify", response_model=VerifyPaymentResponse)
def verify_subscription_payment(
    body: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
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

    plan = get_plan(payment.plan_id, db)
    if plan is None:
        raise HTTPException(status_code=400, detail="Plan no longer available")

    if payment.status == "paid":
        return VerifyPaymentResponse(
            subscription=current_user.subscription,
            subscription_cycle=current_user.subscription_cycle or plan.cycle,
            subscription_expires_at=current_user.subscription_expires_at or datetime.datetime.utcnow(),
            message="Payment already processed.",
            queued=bool(current_user.pending_plan_id == plan.id),
            pending_plan_id=current_user.pending_plan_id,
        )

    try:
        if not verify_payment_signature(
            order_id=body.razorpay_order_id,
            payment_id=body.razorpay_payment_id,
            signature=body.razorpay_signature,
        ):
            handle_subscription_payment_failure(current_user, payment)
            db.commit()
            raise HTTPException(status_code=400, detail="Payment verification failed")
    except RazorpayNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    payment.status = "paid"
    payment.razorpay_payment_id = body.razorpay_payment_id
    payment.paid_at = datetime.datetime.utcnow()

    if premium_is_active(current_user):
        queue_plan_change(current_user, plan, prepaid=True)
        message = (
            f"{plan.label} is scheduled to start when your current subscription ends."
        )
        queued = True
    else:
        apply_plan_immediately(current_user, plan)
        message = f"{plan.label} activated successfully."
        queued = False

    db.commit()
    db.refresh(current_user)

    return VerifyPaymentResponse(
        subscription=current_user.subscription,
        subscription_cycle=current_user.subscription_cycle or plan.cycle,
        subscription_expires_at=current_user.subscription_expires_at or datetime.datetime.utcnow(),
        message=message,
        queued=queued,
        pending_plan_id=current_user.pending_plan_id,
    )


@router.post("/payment-failed", response_model=PaymentFailedResponse)
def report_subscription_payment_failed(
    body: PaymentFailedRequest,
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

    if payment.status != "paid":
        handle_subscription_payment_failure(current_user, payment)
        db.commit()
        db.refresh(current_user)

    if premium_is_active(current_user):
        message = "Payment failed. Your current subscription is unchanged."
    elif is_trial_active(current_user):
        message = "Payment failed. Your free trial continues until 7 days after you joined."
    else:
        message = "Payment failed. You are on the free preview plan."

    return PaymentFailedResponse(
        message=message,
        subscription=current_user.subscription,
    )


@router.post("/schedule-change", response_model=SubscriptionActionResponse)
def schedule_subscription_change(
    body: ScheduleChangeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
    plan = get_plan(body.plan_id, db)
    if plan is None:
        raise HTTPException(status_code=400, detail="Invalid subscription plan")

    validate_schedule_change(current_user, plan)
    queue_plan_change(current_user, plan, prepaid=False)
    db.commit()

    expiry = current_user.subscription_expires_at
    return SubscriptionActionResponse(
        message=(
            f"Your plan will switch to {plan.label} at the end of your current billing period. "
            "Subscribe to Monthly before then to avoid interruption, or prepay from the plan card."
        ),
        subscription_expires_at=expiry,
        pending_plan_id=current_user.pending_plan_id,
        pending_plan_paid=False,
        cancel_at_period_end=False,
    )


@router.post("/cancel", response_model=SubscriptionActionResponse)
def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
    if not premium_is_active(current_user):
        raise HTTPException(status_code=400, detail="No active subscription to cancel.")

    schedule_cancellation(current_user)
    db.commit()

    expiry = current_user.subscription_expires_at
    return SubscriptionActionResponse(
        message="Your subscription will end at the close of your current billing period. Premium access continues until then.",
        subscription_expires_at=expiry,
        pending_plan_id=None,
        pending_plan_paid=False,
        cancel_at_period_end=True,
    )


@router.post("/reactivate", response_model=SubscriptionActionResponse)
def reactivate_subscription(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
    if not premium_is_active(current_user):
        raise HTTPException(status_code=400, detail="No active subscription to reactivate.")

    if not current_user.subscription_cancel_at_period_end:
        raise HTTPException(status_code=400, detail="Subscription is not scheduled for cancellation.")

    clear_cancellation(current_user)
    db.commit()

    return SubscriptionActionResponse(
        message="Cancellation removed. Your subscription will renew as usual.",
        pending_plan_id=current_user.pending_plan_id,
        pending_plan_paid=bool(current_user.pending_plan_paid),
        cancel_at_period_end=False,
    )


@router.post("/clear-scheduled-change", response_model=SubscriptionActionResponse)
def clear_scheduled_change(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _sync_user_subscription(current_user, db)
    if not current_user.pending_plan_id:
        raise HTTPException(status_code=400, detail="No scheduled plan change to remove.")

    if current_user.pending_plan_paid:
        raise HTTPException(
            status_code=400,
            detail="This scheduled change was prepaid and cannot be removed online. Contact support if needed.",
        )

    current_user.pending_plan_id = None
    current_user.pending_plan_paid = False
    db.commit()

    return SubscriptionActionResponse(
        message="Scheduled plan change removed.",
        pending_plan_id=None,
        pending_plan_paid=False,
        cancel_at_period_end=bool(current_user.subscription_cancel_at_period_end),
    )
