declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: (response: { error?: { description?: string } }) => void) => void;
    };
  }
}

export interface SubscriptionPlan {
  id: string;
  label: string;
  cycle: 'monthly' | 'yearly';
  amount_paise: number;
  amount_rupees: number;
  currency: string;
  description: string;
}

export interface CreateOrderResponse {
  order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  plan_id: string;
  plan_label: string;
  queued?: boolean;
}

export interface SubscriptionStatus {
  subscription: string;
  subscription_cycle: 'monthly' | 'yearly' | null;
  subscription_expires_at: string | null;
  subscription_activated_at: string | null;
  is_active: boolean;
  current_plan_id: string | null;
  pending_plan_id: string | null;
  pending_plan_label: string | null;
  pending_plan_paid: boolean;
  cancel_at_period_end: boolean;
}

export interface VerifyPaymentResult {
  message: string;
  queued?: boolean;
  pending_plan_id?: string | null;
}

export function formatInr(amountRupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountRupees);
}

export function formatExpiryDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch('/api/subscriptions/plans');
  if (!res.ok) {
    throw new Error('Could not load subscription plans.');
  }
  return res.json();
}

export async function fetchSubscriptionStatus(token: string): Promise<SubscriptionStatus> {
  const res = await fetch('/api/subscriptions/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not load subscription status.');
  }
  return data;
}

export async function createSubscriptionOrder(
  planId: string,
  token: string,
): Promise<CreateOrderResponse> {
  const res = await fetch('/api/subscriptions/create-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan_id: planId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not start checkout.');
  }
  return data;
}

export async function verifySubscriptionPayment(
  payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
  token: string,
): Promise<VerifyPaymentResult> {
  const res = await fetch('/api/subscriptions/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Payment verification failed.');
  }
  return data;
}

export async function scheduleSubscriptionChange(
  planId: string,
  token: string,
): Promise<{ message: string }> {
  const res = await fetch('/api/subscriptions/schedule-change', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ plan_id: planId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not schedule plan change.');
  }
  return data;
}

export async function cancelSubscription(token: string): Promise<{ message: string }> {
  const res = await fetch('/api/subscriptions/cancel', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not cancel subscription.');
  }
  return data;
}

export async function reactivateSubscription(token: string): Promise<{ message: string }> {
  const res = await fetch('/api/subscriptions/reactivate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not reactivate subscription.');
  }
  return data;
}

export async function clearScheduledChange(token: string): Promise<{ message: string }> {
  const res = await fetch('/api/subscriptions/clear-scheduled-change', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not remove scheduled change.');
  }
  return data;
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.getElementById('razorpay-checkout-js');
    if (existing) {
      existing.addEventListener('load', () => resolve(!!window.Razorpay));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-js';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(!!window.Razorpay);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export async function reportSubscriptionPaymentFailed(
  orderId: string,
  token: string,
): Promise<{ message: string }> {
  const res = await fetch('/api/subscriptions/payment-failed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ razorpay_order_id: orderId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || 'Could not record payment failure.');
  }
  return data;
}

export async function openSubscriptionCheckout(options: {
  order: CreateOrderResponse;
  userEmail?: string;
  userName?: string;
  token: string;
}): Promise<VerifyPaymentResult> {
  const loaded = await loadRazorpayScript();
  const Razorpay = window.Razorpay;
  if (!loaded || !Razorpay) {
    throw new Error('Could not load Razorpay checkout.');
  }

  return new Promise((resolve, reject) => {
    const notifyFailure = async (message: string) => {
      try {
        await reportSubscriptionPaymentFailed(options.order.order_id, options.token);
      } catch {
        // Best-effort; still surface the checkout error to the user.
      }
      reject(new Error(message));
    };

    const rzp = new Razorpay({
      key: options.order.key_id,
      amount: options.order.amount_paise,
      currency: options.order.currency,
      name: 'VeriSonic',
      description: options.order.queued
        ? `${options.order.plan_label} (starts after current plan)`
        : options.order.plan_label,
      order_id: options.order.order_id,
      prefill: {
        email: options.userEmail || '',
        name: options.userName || '',
      },
      theme: { color: '#e11d48' },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          const result = await verifySubscriptionPayment(response, options.token);
          resolve(result);
        } catch (err) {
          void notifyFailure(
            err instanceof Error ? err.message : 'Payment verification failed.',
          );
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Checkout closed.')),
      },
    });

    rzp.on('payment.failed', (response) => {
      void notifyFailure(response.error?.description || 'Payment failed.');
    });

    rzp.open();
  });
}

import type { User } from '../context/AuthContext';
import { hasPaidSubscription } from './accountTier';

export function resolveSubscriptionStatus(
  status: SubscriptionStatus | null,
  currentUser: User | null | undefined,
): SubscriptionStatus | null {
  if (status?.is_active) {
    return {
      ...status,
      subscription_expires_at:
        status.subscription_expires_at ?? currentUser?.subscription_expires_at ?? null,
      subscription_activated_at:
        status.subscription_activated_at ?? currentUser?.subscription_activated_at ?? null,
    };
  }

  if (!currentUser || !hasPaidSubscription(currentUser) || currentUser.subscription !== 'premium') {
    return status;
  }

  const cycle = currentUser.subscription_cycle === 'yearly' ? 'yearly' : 'monthly';

  return {
    subscription: currentUser.subscription,
    subscription_cycle: cycle,
    subscription_expires_at: currentUser.subscription_expires_at ?? null,
    subscription_activated_at: currentUser.subscription_activated_at ?? null,
    is_active: true,
    current_plan_id: planIdForCycle(cycle),
    pending_plan_id: currentUser.pending_plan_id ?? null,
    pending_plan_label: getQueuedPlanLabel(currentUser.pending_plan_id),
    pending_plan_paid: Boolean(currentUser.pending_plan_paid),
    cancel_at_period_end: Boolean(currentUser.subscription_cancel_at_period_end),
  };
}

export function planIdForCycle(cycle: 'monthly' | 'yearly' | null | undefined): string | null {
  if (cycle === 'monthly') return 'premium_monthly';
  if (cycle === 'yearly') return 'premium_yearly';
  return null;
}

const QUEUED_PLAN_LABELS: Record<string, string> = {
  premium_monthly: 'Premium Monthly',
  premium_yearly: 'Premium Yearly',
};

export function getQueuedPlanLabel(planId: string | null | undefined): string | null {
  if (!planId) return null;
  return QUEUED_PLAN_LABELS[planId] ?? null;
}
