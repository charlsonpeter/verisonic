import React from 'react';
import { formatExpiryDate } from '../../utils/subscriptionCheckout';

interface SubscriptionDatesProps {
  activatedAt?: string | null;
  expiresAt?: string | null;
  compact?: boolean;
  inline?: boolean;
}

export const SubscriptionDates: React.FC<SubscriptionDatesProps> = ({
  activatedAt,
  expiresAt,
  compact = false,
  inline = false,
}) => {
  if (!activatedAt && !expiresAt) return null;

  const dateCard = (label: string, value: string, valueClass = 'text-white') => (
    <div className={`rounded-xl border border-white/5 bg-slate-950/50 ${inline ? 'px-3 py-2 min-w-[7.5rem]' : 'px-3 py-2.5'}`}>
      <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block whitespace-nowrap">
        {label}
      </span>
      <span className={`text-xs font-bold mt-1 block whitespace-nowrap ${valueClass}`}>
        {value}
      </span>
    </div>
  );

  if (inline) {
    return (
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {activatedAt && dateCard('Subscribed from', formatExpiryDate(activatedAt))}
        {expiresAt && dateCard('Renew on', formatExpiryDate(expiresAt), 'text-rose-300')}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {activatedAt && dateCard('Subscribed from', formatExpiryDate(activatedAt))}
      {expiresAt && dateCard('Renew on', formatExpiryDate(expiresAt), 'text-rose-300')}
    </div>
  );
};
