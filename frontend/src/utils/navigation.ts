export type AuthUserLike = {
  role?: string;
  real_role?: string;
  artist_profile?: { profile_complete?: boolean } | null;
} | null;

/** Role-aware default tab after login, mode switch, or leaving a denied route. */
export function getPostLoginTab(
  user: AuthUserLike,
  opts: { serverUserMode: 'admin' | 'listener'; hasStudioProfileComplete: boolean }
): string {
  if (!user) return 'home';
  const role = user.real_role || user.role;
  if (role === 'radio_admin' && opts.serverUserMode === 'admin') return 'radio';
  if (role === 'studio_admin' && opts.serverUserMode === 'admin') {
    return opts.hasStudioProfileComplete ? 'track-list' : 'studio-profile';
  }
  return 'home';
}

/** Tabs allowed while radio/studio staff are in Listen mode. */
export const STAFF_LISTENER_TABS = new Set([
  'home',
  'radio',
  'search',
  'favorites',
  'playlists',
  'contact',
  'profile',
  'artist',
  'details',
  'settings',
  'admin-password-reset',
]);
