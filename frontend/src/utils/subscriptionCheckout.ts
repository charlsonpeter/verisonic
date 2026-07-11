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
}

export function formatInr(amountRupees: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amountRupees);
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const res = await fetch('/api/subscriptions/plans');
  if (!res.ok) {
    throw new Error('Could not load subscription plans.');
  }
  return res.json();
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
): Promise<{ message: string }> {
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

export async function openSubscriptionCheckout(options: {
  order: CreateOrderResponse;
  userEmail?: string;
  userName?: string;
  token: string;
}): Promise<{ message: string }> {
  const loaded = await loadRazorpayScript();
  const Razorpay = window.Razorpay;
  if (!loaded || !Razorpay) {
    throw new Error('Could not load Razorpay checkout.');
  }

  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: options.order.key_id,
      amount: options.order.amount_paise,
      currency: options.order.currency,
      name: 'VeriSonic',
      description: options.order.plan_label,
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
          reject(err);
        }
      },
      modal: {
        ondismiss: () => reject(new Error('Checkout closed.')),
      },
    });

    rzp.on('payment.failed', (response) => {
      reject(new Error(response.error?.description || 'Payment failed.'));
    });

    rzp.open();
  });
}
