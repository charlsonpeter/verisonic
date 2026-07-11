import React, { useEffect, useState } from 'react';
import {
  cancelSubscription,
  clearScheduledChange,
  fetchSubscriptionStatus,
  formatExpiryDate,
  reactivateSubscription,
  type SubscriptionStatus,
} from '../../utils/subscriptionCheckout';
import { showConfirm, showError, showSuccess } from '../../utils/swal';

interface SubscriptionManagementProps {
  token: string;
  onUpdated?: () => void | Promise<void>;
}

export const SubscriptionManagement: React.FC<SubscriptionManagementProps> = ({
  token,
  onUpdated,
}) => {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const next = await fetchSubscriptionStatus(token);
    setStatus(next);
  };

  useEffect(() => {
    reload().catch(() => setStatus(null));
  }, [token]);

  if (!status?.is_active) return null;

  const handleCancel = async () => {
    const expiry = formatExpiryDate(status.subscription_expires_at);
    const confirmed = await showConfirm(
      'Cancel subscription',
      `Premium access continues until ${expiry}. After that, your account returns to Free Preview.`,
      'Cancel at period end',
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await cancelSubscription(token);
      await reload();
      await onUpdated?.();
      showSuccess('Cancellation scheduled', result.message);
    } catch (err) {
      showError('Could not cancel', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleReactivate = async () => {
    setBusy(true);
    try {
      const result = await reactivateSubscription(token);
      await reload();
      await onUpdated?.();
      showSuccess('Subscription kept active', result.message);
    } catch (err) {
      showError('Could not reactivate', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleClearSchedule = async () => {
    const confirmed = await showConfirm(
      'Remove scheduled change',
      'Your subscription will stay on the current plan when the period ends.',
      'Remove schedule',
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const result = await clearScheduledChange(token);
      await reload();
      await onUpdated?.();
      showSuccess('Schedule removed', result.message);
    } catch (err) {
      showError('Could not remove schedule', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pt-4 border-t border-white/5 space-y-2">
      {status.cancel_at_period_end ? (
        <button
          type="button"
          disabled={busy}
          onClick={handleReactivate}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/30 transition disabled:opacity-60"
        >
          Keep subscription active
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={handleCancel}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider bg-slate-900 text-slate-400 border border-white/5 hover:text-rose-400 hover:border-rose-500/20 transition disabled:opacity-60"
        >
          Cancel subscription
        </button>
      )}

      {status.pending_plan_id && !status.pending_plan_paid && !status.cancel_at_period_end && (
        <button
          type="button"
          disabled={busy}
          onClick={handleClearSchedule}
          className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider text-slate-400 border border-white/5 hover:text-white transition disabled:opacity-60 ml-0 sm:ml-2"
        >
          Remove scheduled plan change
        </button>
      )}
    </div>
  );
};
