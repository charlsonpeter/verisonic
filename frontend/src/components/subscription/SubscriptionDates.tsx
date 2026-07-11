import React from 'react';
import { formatExpiryDate } from '../../utils/subscriptionCheckout';

interface SubscriptionDatesProps {
  activatedAt?: string | null;
  expiresAt?: string | null;
  compact?: boolean;
}

export const SubscriptionDates: React.FC<SubscriptionDatesProps> = ({
  activatedAt,
  expiresAt,
  compact = false,
}) => {
  if (!activatedAt && !expiresAt) return null;

  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {activatedAt && (
        <div className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2.5">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
            Plan activated
          </span>
          <span className="text-xs font-bold text-white mt-1 block">
            {formatExpiryDate(activatedAt)}
          </span>
        </div>
      )}
      {expiresAt && (
        <div className="rounded-xl border border-white/5 bg-slate-950/50 px-3 py-2.5">
          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
            Next renewal
          </span>
          <span className="text-xs font-bold text-rose-300 mt-1 block">
            {formatExpiryDate(expiresAt)}
          </span>
        </div>
      )}
    </div>
  );
};
