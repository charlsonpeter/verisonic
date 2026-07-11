import React from 'react';
import { formatExpiryDate, getQueuedPlanLabel } from '../../utils/subscriptionCheckout';

interface SubscriptionQueueNoticeProps {
  pendingPlanId?: string | null;
  pendingPlanPaid?: boolean;
  renewOn?: string | null;
  cancelAtPeriodEnd?: boolean;
}

export const SubscriptionQueueNotice: React.FC<SubscriptionQueueNoticeProps> = ({
  pendingPlanId,
  pendingPlanPaid = false,
  renewOn,
  cancelAtPeriodEnd = false,
}) => {
  if (cancelAtPeriodEnd) {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
        <span className="text-[9px] text-amber-400 font-bold uppercase tracking-wider block">
          Queued change
        </span>
        <p className="text-xs font-semibold text-white mt-1">
          Subscription cancels{renewOn ? ` on ${formatExpiryDate(renewOn)}` : ' at end of current period'}.
          No renewal scheduled.
        </p>
      </div>
    );
  }

  if (!pendingPlanId) return null;

  const planLabel = getQueuedPlanLabel(pendingPlanId) || 'New plan';

  return (
    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
      <span className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider block">
        Queued plan change
      </span>
      <p className="text-xs font-semibold text-white mt-1">
        Switches to {planLabel}
        {renewOn ? ` on ${formatExpiryDate(renewOn)}` : ' at renewal'}
        {pendingPlanPaid ? ' (paid)' : ''}.
      </p>
    </div>
  );
};
