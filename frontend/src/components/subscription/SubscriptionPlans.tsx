import React, { useEffect, useState } from 'react';
import { Crown, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  cancelSubscription,
  clearScheduledChange,
  createSubscriptionOrder,
  fetchSubscriptionPlans,
  fetchSubscriptionStatus,
  formatExpiryDate,
  enrichSubscriptionMessage,
  subscriptionEndsLabel,
  formatInr,
  openSubscriptionCheckout,
  planIdForCycle,
  reactivateSubscription,
  resolveSubscriptionStatus,
  scheduleSubscriptionChange,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '../../utils/subscriptionCheckout';
import { showConfirm, showError, showSuccess } from '../../utils/swal';
import { SubscriptionDates } from './SubscriptionDates';
import { SubscriptionQueueNotice } from './SubscriptionQueueNotice';

interface SubscriptionPlansProps {
  compact?: boolean;
  modal?: boolean;
  /** Optional card rendered as the first column in a 3-column landing layout. */
  leadingSlot?: React.ReactNode;
  onSuccess?: () => void;
  onRequireAuth?: () => void;
}

export const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  compact = false,
  modal = false,
  leadingSlot,
  onSuccess,
  onRequireAuth,
}) => {
  const { token, currentUser, fetchCurrentUser } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [mgmtBusy, setMgmtBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const effectiveStatus = resolveSubscriptionStatus(status, currentUser);
  const activatedAt =
    currentUser?.subscription_activated_at ??
    effectiveStatus?.subscription_activated_at ??
    null;
  const expiresAt =
    currentUser?.subscription_expires_at ??
    effectiveStatus?.subscription_expires_at ??
    null;

  const reload = async () => {
    const planList = await fetchSubscriptionPlans();
    setPlans(planList);
    if (token) {
      try {
        const subStatus = await fetchSubscriptionStatus(token);
        setStatus(subStatus);
      } catch {
        setStatus(null);
      }
    } else {
      setStatus(null);
    }
  };

  useEffect(() => {
    reload().catch((err: Error) => setLoadError(err.message));
  }, [token, currentUser?.subscription, currentUser?.subscription_cycle]);

  const getPlanAction = (plan: SubscriptionPlan): {
    label: string;
    mode: 'subscribe' | 'upgrade' | 'schedule-switch' | 'current' | 'scheduled';
    disabled: boolean;
  } => {
    if (!effectiveStatus?.is_active) {
      return { label: `Subscribe · ${formatInr(plan.amount_rupees)}`, mode: 'subscribe', disabled: false };
    }

    const currentId =
      effectiveStatus.current_plan_id || planIdForCycle(effectiveStatus.subscription_cycle);

    if (currentId === plan.id) {
      return { label: 'Current plan', mode: 'current', disabled: true };
    }

    if (effectiveStatus.pending_plan_id === plan.id) {
      return {
        label: effectiveStatus.pending_plan_paid ? 'Scheduled & paid' : 'Scheduled at renewal',
        mode: 'scheduled',
        disabled: true,
      };
    }

    if (effectiveStatus.subscription_cycle === 'monthly' && plan.cycle === 'yearly') {
      return {
        label: `Upgrade · ${formatInr(plan.amount_rupees)}`,
        mode: 'upgrade',
        disabled: false,
      };
    }

    if (effectiveStatus.subscription_cycle === 'yearly' && plan.cycle === 'monthly') {
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
      showSuccess(
        result.queued ? 'Plan scheduled' : 'Subscription activated',
        enrichSubscriptionMessage(
          result.message,
          result.subscription_expires_at,
          result.queued ? 'ends' : 'renew',
        ),
      );
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed.';
      if (message !== 'Checkout closed.') {
        await fetchCurrentUser();
        await reload();
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
    if (action.disabled) return;

    if (action.mode === 'schedule-switch') {
      const confirmed = await showConfirm(
        'Switch to Monthly',
        `Your yearly plan stays active until ${subscriptionEndsLabel(effectiveStatus?.subscription_expires_at)}. After that, you'll move to Monthly. You can prepay Monthly anytime to avoid interruption.`,
        'Schedule switch',
      );
      if (!confirmed) return;

      setLoadingPlanId(plan.id);
      try {
        const result = await scheduleSubscriptionChange(plan.id, token);
        await fetchCurrentUser();
        await reload();
        showSuccess(
          'Plan scheduled',
          enrichSubscriptionMessage(result.message, result.subscription_expires_at, 'ends'),
        );
        onSuccess?.();
      } catch (err) {
        showError('Could not schedule', err instanceof Error ? err.message : 'Try again.');
      } finally {
        setLoadingPlanId(null);
      }
      return;
    }

    if (action.mode === 'upgrade') {
      const expiry = formatExpiryDate(effectiveStatus?.subscription_expires_at);
      const confirmed = await showConfirm(
        'Upgrade to Yearly',
        `Pay ${formatInr(plan.amount_rupees)} now. Your yearly plan starts when your current monthly plan ends${expiry ? ` on ${expiry}` : ''}.`,
        'Continue to checkout',
      );
      if (!confirmed) return;
    }

    if (action.mode === 'subscribe' || action.mode === 'upgrade') {
      await runCheckout(plan);
    }
  };

  const handlePrepayMonthly = async (plan: SubscriptionPlan) => {
    if (!token || effectiveStatus?.subscription_cycle !== 'yearly' || plan.cycle !== 'monthly') return;
    const expiry = formatExpiryDate(effectiveStatus.subscription_expires_at);
    const confirmed = await showConfirm(
      'Prepay Monthly',
      `Pay ${formatInr(plan.amount_rupees)} now. Monthly billing starts automatically when your yearly plan ends${expiry ? ` on ${expiry}` : ''}.`,
      'Continue to checkout',
    );
    if (!confirmed) return;
    await runCheckout(plan);
  };

  const handleCancel = async () => {
    if (!token || !effectiveStatus?.is_active) return;
    const expiry = formatExpiryDate(effectiveStatus.subscription_expires_at);
    const confirmed = await showConfirm(
      'Cancel subscription',
      `Premium access continues${expiry ? ` until ${expiry}` : ' for the rest of your billing period'}. After that, your account returns to Free Preview.`,
      'Cancel at period end',
    );
    if (!confirmed) return;

    setMgmtBusy(true);
    try {
      const result = await cancelSubscription(token);
      await fetchCurrentUser();
      await reload();
      showSuccess(
        'Cancellation scheduled',
        enrichSubscriptionMessage(result.message, result.subscription_expires_at, 'continues'),
      );
      onSuccess?.();
    } catch (err) {
      showError('Could not cancel', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setMgmtBusy(false);
    }
  };

  const handleReactivate = async () => {
    if (!token) return;
    setMgmtBusy(true);
    try {
      const result = await reactivateSubscription(token);
      await fetchCurrentUser();
      await reload();
      showSuccess('Subscription kept active', result.message);
      onSuccess?.();
    } catch (err) {
      showError('Could not reactivate', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setMgmtBusy(false);
    }
  };

  const handleClearSchedule = async () => {
    if (!token) return;
    const confirmed = await showConfirm(
      'Remove scheduled change',
      'Your subscription will stay on the current plan when the period ends.',
      'Remove schedule',
    );
    if (!confirmed) return;

    setMgmtBusy(true);
    try {
      const result = await clearScheduledChange(token);
      await fetchCurrentUser();
      await reload();
      showSuccess('Schedule removed', result.message);
    } catch (err) {
      showError('Could not remove schedule', err instanceof Error ? err.message : 'Try again.');
    } finally {
      setMgmtBusy(false);
    }
  };

  if (loadError) {
    return (
      <div className={leadingSlot ? 'grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch' : undefined}>
        {leadingSlot}
        <p className={`text-[11px] text-amber-400/90 font-semibold ${leadingSlot ? 'md:col-span-2 self-center' : ''}`}>
          {loadError}
        </p>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className={leadingSlot ? 'grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch' : undefined}>
        {leadingSlot}
        <p className={`text-[11px] text-slate-500 font-semibold ${leadingSlot ? 'md:col-span-2 self-center' : ''}`}>
          Loading subscription plans…
        </p>
      </div>
    );
  }

  const currentPlanId = effectiveStatus?.is_active
    ? effectiveStatus.current_plan_id || planIdForCycle(effectiveStatus.subscription_cycle)
    : null;

  return (
    <div className="space-y-4">
      {effectiveStatus?.is_active && !compact && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Current plan</p>
          <p className="text-sm font-bold text-white">
            {effectiveStatus.subscription_cycle === 'yearly' ? 'Premium Yearly' : 'Premium Monthly'}
          </p>
          <SubscriptionDates
            activatedAt={activatedAt}
            expiresAt={expiresAt}
            compact
          />
          {effectiveStatus.cancel_at_period_end && (
            <p className="text-[10px] text-amber-400 font-semibold">
              Cancels at end of current period — no renewal scheduled.
            </p>
          )}
          {effectiveStatus.pending_plan_id && !effectiveStatus.cancel_at_period_end && (
            <p className="text-[10px] text-emerald-400/90 font-semibold">
              {(effectiveStatus.pending_plan_label || 'Plan change')} scheduled
              {effectiveStatus.pending_plan_paid ? ' (paid)' : ''} at renewal
              {effectiveStatus.subscription_expires_at
                ? ` on ${formatExpiryDate(effectiveStatus.subscription_expires_at)}`
                : ''}.
            </p>
          )}
        </div>
      )}

      {effectiveStatus?.is_active && compact && (
        <SubscriptionQueueNotice
          pendingPlanId={effectiveStatus.pending_plan_id}
          pendingPlanPaid={effectiveStatus.pending_plan_paid}
          renewOn={effectiveStatus.subscription_expires_at}
          cancelAtPeriodEnd={effectiveStatus.cancel_at_period_end}
        />
      )}

      <div className={`grid gap-3 items-stretch ${
        leadingSlot
          ? 'grid-cols-1 md:grid-cols-3'
          : modal || compact
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2'
      }`}>
        {leadingSlot}
        {plans.map((plan) => {
          const isLoading = loadingPlanId === plan.id;
          const action = getPlanAction(plan);
          const isCurrent = currentPlanId === plan.id;
          const isUpgrade = action.mode === 'upgrade';
          const showPrepayMonthly =
            effectiveStatus?.subscription_cycle === 'yearly' &&
            plan.cycle === 'monthly' &&
            effectiveStatus.pending_plan_id !== plan.id;

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border flex flex-col justify-between h-full ${
                modal ? 'p-4' : 'p-5'
              } ${
                isCurrent
                  ? 'bg-emerald-500/5 border-emerald-500/30 ring-1 ring-emerald-500/20'
                  : 'bg-slate-950/40 border-white/5'
              }`}
            >
              {isCurrent && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-[8px] font-extrabold uppercase tracking-wider text-emerald-400">
                  Current plan
                </span>
              )}
              {!isCurrent && plan.cycle === 'yearly' && (
                <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-[8px] font-extrabold uppercase tracking-wider text-amber-400">
                  <Crown className="w-3 h-3" />
                  Best value
                </span>
              )}
              <div>
                <h4 className={`text-sm font-bold ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
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
                    Full songs and radio
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`text-rose-400 flex-shrink-0 ${modal ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                    Clearer sound when available
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className={`text-rose-400 flex-shrink-0 ${modal ? 'w-3 h-3' : 'w-3.5 h-3.5'}`} />
                    Playlists and favorites
                  </li>
                </ul>
              </div>
              <div className={modal ? 'mt-3 space-y-2' : 'mt-5 space-y-2'}>
                <button
                  type="button"
                  disabled={!!loadingPlanId || action.disabled || mgmtBusy}
                  onClick={() => handlePlanClick(plan)}
                  className={`w-full py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider transition disabled:opacity-60 ${
                    isUpgrade
                      ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white hover:scale-[1.01]'
                      : isCurrent
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 cursor-default'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5'
                  }`}
                >
                  {isLoading ? 'Processing…' : action.label}
                </button>
                {showPrepayMonthly && (
                  <button
                    type="button"
                    disabled={!!loadingPlanId || mgmtBusy}
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

      {effectiveStatus?.is_active && token && (
        <div className="pt-2 border-t border-white/5 flex flex-wrap gap-2">
          {effectiveStatus.cancel_at_period_end ? (
            <button
              type="button"
              disabled={mgmtBusy || !!loadingPlanId}
              onClick={handleReactivate}
              className="px-4 py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-600/30 transition disabled:opacity-60"
            >
              Keep subscription active
            </button>
          ) : (
            <button
              type="button"
              disabled={mgmtBusy || !!loadingPlanId}
              onClick={handleCancel}
              className="px-4 py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider bg-slate-900 text-slate-400 border border-white/5 hover:text-rose-400 hover:border-rose-500/20 transition disabled:opacity-60"
            >
              Cancel subscription
            </button>
          )}
          {effectiveStatus.pending_plan_id && !effectiveStatus.pending_plan_paid && !effectiveStatus.cancel_at_period_end && (
            <button
              type="button"
              disabled={mgmtBusy || !!loadingPlanId}
              onClick={handleClearSchedule}
              className="px-4 py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider text-slate-400 border border-white/5 hover:text-white transition disabled:opacity-60"
            >
              Remove scheduled change
            </button>
          )}
        </div>
      )}
    </div>
  );
};
