import React, { useEffect, useState } from 'react';
import { Crown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { hasPaidSubscription } from '../../utils/accountTier';
import {
  fetchSubscriptionPlans,
  formatInr,
  openSubscriptionCheckout,
  type SubscriptionPlan,
  createSubscriptionOrder,
} from '../../utils/subscriptionCheckout';
import { showError, showSuccess } from '../../utils/swal';

interface SubscriptionPlansProps {
  compact?: boolean;
  onSuccess?: () => void;
  onRequireAuth?: () => void;
}

export const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  compact = false,
  onSuccess,
  onRequireAuth,
}) => {
  const { token, currentUser, fetchCurrentUser } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscriptionPlans()
      .then(setPlans)
      .catch((err: Error) => setLoadError(err.message));
  }, []);

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!token) {
      onRequireAuth?.();
      return;
    }
    if (hasPaidSubscription(currentUser)) {
      showSuccess('Already subscribed', 'Your premium subscription is already active.');
      return;
    }

    setLoadingPlanId(plan.id);
    try {
      const order = await createSubscriptionOrder(plan.id, token);
      const result = await openSubscriptionCheckout({
        order,
        token,
        userEmail: currentUser?.email,
        userName: currentUser?.full_name,
      });
      await fetchCurrentUser();
      showSuccess('Subscription activated', result.message);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed.';
      if (message !== 'Checkout closed.') {
        showError('Checkout failed', message);
      }
    } finally {
      setLoadingPlanId(null);
    }
  };

  if (loadError) {
    return (
      <p className="text-[11px] text-amber-400/90 font-semibold">
        {loadError}
      </p>
    );
  }

  if (plans.length === 0) {
    return (
      <p className="text-[11px] text-slate-500 font-semibold">
        Loading subscription plans…
      </p>
    );
  }

  return (
    <div className={`grid gap-4 ${compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'}`}>
      {plans.map((plan) => {
        const isYearly = plan.cycle === 'yearly';
        const isLoading = loadingPlanId === plan.id;
        return (
          <div
            key={plan.id}
            className={`relative rounded-2xl border p-5 flex flex-col justify-between ${
              isYearly
                ? 'bg-rose-600/10 border-rose-500/30 shadow-md shadow-rose-500/5'
                : 'bg-slate-950/40 border-white/5'
            }`}
          >
            {isYearly && (
              <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-[8px] font-extrabold uppercase tracking-wider text-amber-400">
                <Crown className="w-3 h-3" />
                Best value
              </span>
            )}
            <div>
              <h4 className={`text-sm font-bold ${isYearly ? 'text-rose-400' : 'text-white'}`}>
                {plan.label}
              </h4>
              <p className="text-2xl font-extrabold text-white mt-2">
                {formatInr(plan.amount_rupees)}
                <span className="text-[10px] text-slate-500 font-bold block mt-1 uppercase">
                  {plan.cycle === 'monthly' ? 'per month' : 'per year'}
                </span>
              </p>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">{plan.description}</p>
              <ul className="mt-4 space-y-2 text-[10px] text-slate-350">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  Unlimited playback
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  Lossless & hi-res streams
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                  Playlists & favorites
                </li>
              </ul>
            </div>
            <button
              type="button"
              disabled={!!loadingPlanId}
              onClick={() => handleSubscribe(plan)}
              className={`mt-5 w-full py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider transition disabled:opacity-60 ${
                isYearly
                  ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white hover:scale-[1.01]'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5'
              }`}
            >
              {isLoading ? 'Opening checkout…' : `Subscribe · ${formatInr(plan.amount_rupees)}`}
            </button>
          </div>
        );
      })}
    </div>
  );
};
