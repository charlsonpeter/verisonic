import * as WebBrowser from 'expo-web-browser';
import { createSubscriptionOrder, verifySubscriptionPayment } from '@/api/endpoints';
import type { CreateOrderResponse } from '@/types/models';

WebBrowser.maybeCompleteAuthSession();

/**
 * Opens Razorpay Checkout in an in-app browser.
 * After payment, Razorpay redirects with query params that we verify against the API.
 *
 * For production store builds, prefer `react-native-razorpay` via a custom Expo dev client.
 * This WebBrowser flow works with Expo Go and matches the existing backend verify endpoint.
 */
export async function openRazorpayCheckout(
  order: CreateOrderResponse,
  userEmail: string,
  userName: string,
): Promise<{
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
} | null> {
  const callback = 'verisonic://razorpay-callback';
  const checkoutUrl =
    `https://api.razorpay.com/v1/checkout/embedded?` +
    new URLSearchParams({
      key_id: order.key_id,
      order_id: order.order_id,
      name: 'VeriSonic',
      description: order.plan_label,
      prefill_email: userEmail,
      prefill_name: userName,
      callback_url: callback,
      redirect: 'true',
    }).toString();

  const result = await WebBrowser.openAuthSessionAsync(checkoutUrl, callback);

  if (result.type !== 'success' || !result.url) {
    return null;
  }

  const url = new URL(result.url);
  const paymentId = url.searchParams.get('razorpay_payment_id');
  const orderId = url.searchParams.get('razorpay_order_id') || order.order_id;
  const signature = url.searchParams.get('razorpay_signature');

  if (!paymentId || !signature) {
    return null;
  }

  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  };
}

export async function purchasePlan(
  planId: string,
  userEmail: string,
  userName: string,
): Promise<string> {
  const order = await createSubscriptionOrder(planId);
  const payment = await openRazorpayCheckout(order, userEmail, userName);
  if (!payment) {
    throw new Error('Payment was cancelled or incomplete.');
  }
  const verified = await verifySubscriptionPayment(payment);
  return verified.message || 'Premium activated.';
}
