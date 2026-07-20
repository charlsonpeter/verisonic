import type { User } from '../context/AuthContext';
import { parseServerDateTime } from './dateTime';

export function getTrialDaysLeft(user: User | null): number {
  if (!user?.created_at) return 0;
  const createdAt = parseServerDateTime(user.created_at);
  const now = new Date();
  const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(7 - diffDays));
}

export function getUserRole(user: User | null): User['role'] | undefined {
  return user?.real_role || user?.role;
}

export function hasPaidSubscription(user: User | null): boolean {
  if (!user) return false;
  if (!['premium', 'unlimited'].includes(user.subscription || '')) return false;
  if (user.subscription === 'unlimited') return true;
  if (!user.subscription_expires_at) return true;
  return parseServerDateTime(user.subscription_expires_at) > new Date();
}

export function isOnFreeTrial(user: User | null): boolean {
  if (!user || hasPaidSubscription(user)) return false;
  return getTrialDaysLeft(user) > 0;
}

/** Shared tier label for profile, settings, and header badges. */
export function getAccountTierLabel(user: User | null): string {
  if (!user) return 'Guest';
  if (user.subscription === 'unlimited') return 'Unlimited';
  if (user.subscription === 'premium') {
    return user.subscription_cycle === 'yearly' ? 'Premium Yearly' : 'Premium Monthly';
  }
  const trialDays = getTrialDaysLeft(user);
  if (trialDays > 0) return `Free Trial · ${trialDays}d left`;
  return 'Free Preview';
}

export const getAccountTierBadge = getAccountTierLabel;
