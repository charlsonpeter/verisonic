import base64
import hashlib
import hmac
import uuid
from typing import Any

import httpx

from app.core.config import settings


class RazorpayNotConfiguredError(Exception):
    pass


def _require_keys() -> tuple[str, str]:
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise RazorpayNotConfiguredError("Razorpay is not configured on the server.")
    return settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET


def _auth_header() -> str:
    key_id, key_secret = _require_keys()
    token = base64.b64encode(f"{key_id}:{key_secret}".encode()).decode()
    return f"Basic {token}"


def create_order(*, amount_paise: int, currency: str, receipt: str, notes: dict[str, str]) -> dict[str, Any]:
    response = httpx.post(
        "https://api.razorpay.com/v1/orders",
        json={
            "amount": amount_paise,
            "currency": currency,
            "receipt": receipt,
            "notes": notes,
        },
        headers={"Authorization": _auth_header()},
        timeout=30.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Razorpay order creation failed: {response.text}")
    return response.json()


def verify_payment_signature(*, order_id: str, payment_id: str, signature: str) -> bool:
    _, key_secret = _require_keys()
    body = f"{order_id}|{payment_id}".encode()
    expected = hmac.new(key_secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def new_receipt() -> str:
    return f"vs_{uuid.uuid4().hex[:24]}"
