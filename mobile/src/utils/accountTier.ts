import type { User } from '@/types/models';

export function parseServerDateTime(iso: string | null | undefined): Date {
  if (!iso) return new Date(0);
  const normalized = iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  return new Date(normalized);
}

export function getTrialDaysLeft(user: User | null): number {
  if (!user?.created_at) return 0;
  const createdAt = parseServerDateTime(user.created_at);
  const diffDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(7 - diffDays));
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

export function canPlayFullContent(user: User | null): boolean {
  return hasPaidSubscription(user) || isOnFreeTrial(user);
}

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

export function formatDuration(seconds: number | undefined | null): string {
  if (!seconds || seconds < 0 || !Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatInr(amountRupees: number): string {
  return `₹${Math.round(amountRupees)}`;
}

const LOCAL_MEDIA_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '0.0.0.0']);

export function absoluteMediaUrl(pathOrUrl: string | undefined | null, apiUrl: string): string | undefined {
  if (!pathOrUrl) return undefined;
  const origin = apiUrl.replace(/\/api\/?$/, '');

  if (/^https?:\/\//i.test(pathOrUrl)) {
    try {
      const parsed = new URL(pathOrUrl);
      if (LOCAL_MEDIA_HOSTS.has(parsed.hostname)) {
        return `${origin}${parsed.pathname}${parsed.search}`;
      }
    } catch {
      return pathOrUrl;
    }
    return pathOrUrl;
  }

  if (pathOrUrl.startsWith('/')) {
    return `${origin}${pathOrUrl}`;
  }
  return pathOrUrl;
}
