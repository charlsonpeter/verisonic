import React, { useEffect, useState } from 'react';
import { Crown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  createSubscriptionOrder,
  fetchSubscriptionPlans,
  fetchSubscriptionStatus,
  formatExpiryDate,
  formatInr,
  openSubscriptionCheckout,
  planIdForCycle,
  scheduleSubscriptionChange,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '../../utils/subscriptionCheckout';
import { showConfirm, showError, showSuccess } from '../../utils/swal';

interface SubscriptionPlansProps {
  compact?: boolean;
  modal?: boolean;
  onSuccess?: () => void;
  onRequireAuth?: () => void;
}

export const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  compact = false,
  modal = false,
  onSuccess,
  onRequireAuth,
}) => {
  const { token, currentUser, fetchCurrentUser } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = async () => {
    const planList = await fetchSubscriptionPlans();
    setPlans(planList);
    if (token) {
      const subStatus = await fetchSubscriptionStatus(token);
      setStatus(subStatus);
    } else {
      setStatus(null);
    }
  };

  useEffect(() => {
    reload().catch((err: Error) => setLoadError(err.message));
  }, [token]);

  const getPlanAction = (plan: SubscriptionPlan): {
    label: string;
    mode: 'subscribe' | 'upgrade' | 'prepay-switch' | 'schedule-switch' | 'current' | 'scheduled';
    disabled: boolean;
  } => {
    if (!status?.is_active) {
      return { label: `Subscribe · ${formatInr(plan.amount_rupees)}`, mode: 'subscribe', disabled: false };
    }

    if (status.current_plan_id === plan.id) {
      return { label: 'Current plan', mode: 'current', disabled: true };
    }

    if (status.pending_plan_id === plan.id) {
      return {
        label: status.pending_plan_paid ? 'Scheduled & paid' : 'Scheduled at renewal',
        mode: 'scheduled',
        disabled: true,
      };
    }

    if (status.subscription_cycle === 'monthly' && plan.cycle === 'yearly') {
      return {
        label: `Upgrade · ${formatInr(plan.amount_rupees)}`,
        mode: 'upgrade',
        disabled: false,
      };
    }

    if (status.subscription_cycle === 'yearly' && plan.cycle === 'monthly') {
      return {
        label: 'Switch at renewal',
        mode: 'schedule-switch',
        disabled: false,
      };
    }

    return { label: 'Unavailable', mode: 'current', disabled: true };
  };

  const runCheckout = async (plan: SubscriptionPlan) => {
    if (!token) {
      onRequireAuth?.();
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
      await reload();
      showSuccess(result.queued ? 'Plan scheduled' : 'Subscription activated', result.message);
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

  const handlePlanClick = async (plan: SubscriptionPlan) => {
    if (!token) {
      onRequireAuth?.();
      return;
    }

    const action = getPlanAction(plan);

    if (action.mode === 'schedule-switch') {
      const expiry = formatExpiryDate(status?.subscription_expires_at);
      const confirmed = await showConfirm(
        'Switch to Monthly',
        `Your yearly plan stays active until ${expiry}. After that, you'll move to Monthly. You can prepay Monthly anytime to avoid interruption.`,
        'Schedule switch',
      );
      if (!confirmed) return;

      setLoadingPlanId(plan.id);
      try {
        const result = await scheduleSubscriptionChange(plan.id, token);
        await fetchCurrentUser();
        await reload();
        showSuccess('Plan scheduled', result.message);
        onSuccess?.();
      } catch (err) {
        showError('Could not schedule', err instanceof Error ? err.message : 'Try again.');
      } finally {
        setLoadingPlanId(null);
      }
      return;
    }

    if (action.mode === 'upgrade') {
      const expiry = formatExpiryDate(status?.subscription_expires_at);
      const confirmed = await showConfirm(
        'Upgrade to Yearly',
        `Pay ${formatInr(plan.amount_rupees)} now. Your yearly plan starts when your current monthly plan ends on ${expiry}.`,
        'Continue to checkout',
      );
      if (!confirmed) return;
    }

    if (action.mode === 'subscribe' || action.mode === 'upgrade') {
      await runCheckout(plan);
    }
  };

  const handlePrepayMonthly = async (plan: SubscriptionPlan) => {
    if (!token || status?.subscription_cycle !== 'yearly' || plan.cycle !== 'monthly') return;
    const expiry = formatExpiryDate(status.subscription_expires_at);
    const confirmed = await showConfirm(
      'Prepay Monthly',
      `Pay ${formatInr(plan.amount_rupees)} now. Monthly billing starts automatically when your yearly plan ends on ${expiry}.`,
      'Continue to checkout',
    );
    if (!confirmed) return;
    await runCheckout(plan);
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

  const currentPlanId = status?.is_active
    ? status.current_plan_id || planIdForCycle(status.subscription_cycle)
    : null;

  return (
    <div className="space-y-4">
      {status?.is_active && (
        <div className="rounded-2xl border border-white/5 bg-slate-950/40 p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Your subscription</p>
          <p className="text-sm font-bold text-white">
            {status.subscription_cycle === 'yearly' ? 'Premium Yearly' : 'Premium Monthly'}
            {status.subscription_expires_at && (
              <span className="text-slate-400 font-semibold text-xs block mt-1">
                Active until {formatExpiryDate(status.subscription_expires_at)}
              </span>
            )}
          </p>
          {status.cancel_at_period_end && (
            <p className="text-[10px] text-amber-400 font-semibold">
              Cancels at end of current period — no renewal scheduled.
            </p>
          )}
          {status.pending_plan_id && !status.cancel_at_period_end && (
            <p className="text-[10px] text-emerald-400/90 font-semibold">
              {status.pending_plan_label} scheduled
              {status.pending_plan_paid ? ' (paid)' : ''} at renewal
              {status.subscription_expires_at
                ? ` on ${formatExpiryDate(status.subscription_expires_at)}`
                : ''}.
            </p>
          )}
        </div>
      )}

      <div className={`grid gap-3 ${
        modal || compact ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'
      }`}>
        {plans.map((plan) => {
          const isYearly = plan.cycle === 'yearly';
          const isLoading = loadingPlanId === plan.id;
          const action = getPlanAction(plan);
          const isCurrent = currentPlanId === plan.id;
          const showPrepayMonthly =
            status?.subscription_cycle === 'yearly' &&
            plan.cycle === 'monthly' &&
            status.pending_plan_id !== plan.id;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border flex flex-col justify-between ${
                modal ? 'p-4' : 'p-5'
              } ${
                isCurrent
                  ? 'bg-emerald-500/5 border-emerald-500/25'
                  : isYearly
                    ? 'bg-rose-600/10 border-rose-500/30 shadow-md shadow-rose-500/5'
                    : 'bg-slate-950/40 border-white/5'
              }`}
            >
              {isYearly && !isCurrent && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-[8px] font-extrabold uppercase tracking-wider text-amber-400">
                  <Crown className="w-3 h-3" />
                  Best value
                </span>
              )}
              {isCurrent && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[8px] font-extrabold uppercase tracking-wider text-emerald-400">
                  Current
                </span>
              )}
              <div>
                <h4 className={`text-sm font-bold ${isYearly ? 'text-rose-400' : 'text-white'}`}>
                  {plan.label}
                </h4>
                <p className={`font-extrabold text-white ${modal ? 'text-xl mt-1' : 'text-2xl mt-2'}`}>
                  {formatInr(plan.amount_rupees)}
                  <span className="text-[10px] text-slate-500 font-bold block mt-1 uppercase">
                    {plan.cycle === 'monthly' ? 'per month' : 'per year'}
                  </span>
                </p>
                <p className={`text-slate-400 leading-relaxed ${modal ? 'text-[9px] mt-2' : 'text-[10px] mt-3'}`}>
                  {plan.description}
                </p>
                <ul className={`text-slate-350 ${modal ? 'mt-2 space-y-1 text-[9px]' : 'mt-4 space-y-2 text-[10px]'}`}>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`text-rose-400 flex-shrink-0 ${modal ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                    Unlimited playback
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`text-rose-400 flex-shrink-0 ${modal ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                    Lossless & hi-res streams
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`text-rose-400 flex-shrink-0 ${modal ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                    Playlists & favorites
                  </li>
                </ul>
              </div>
              <div className={modal ? 'mt-3 space-y-2' : 'mt-5 space-y-2'}>
                <button
                  type="button"
                  disabled={!!loadingPlanId || action.disabled}
                  onClick={() => handlePlanClick(plan)}
                  className={`w-full py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider transition disabled:opacity-60 ${
                    isYearly && !action.disabled
                      ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white hover:scale-[1.01]'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5'
                  }`}
                >
                  {isLoading ? 'Processing…' : action.label}
                </button>
                {showPrepayMonthly && (
                  <button
                    type="button"
                    disabled={!!loadingPlanId}
                    onClick={() => handlePrepayMonthly(plan)}
                    className="w-full py-2 text-[10px] font-bold rounded-xl uppercase tracking-wider text-rose-400 border border-rose-500/20 hover:bg-rose-500/5 transition disabled:opacity-60"
                  >
                    Prepay Monthly · {formatInr(plan.amount_rupees)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
