const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  // Refresh stays httpOnly-cookie only on web — never persist in JS storage.
  return null;
}

export function setAuthTokens(accessToken: string, _refreshToken?: string | null): void {
  suppressSessionRestore = false;
  // Short-lived access token in sessionStorage only. Long-lived session is the
  // httpOnly refresh cookie set by the server (not readable from JS).
  sessionStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function clearAuthTokens(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<RefreshResult> | null = null;
let suppressSessionRestore = false;
let refreshGeneration = 0;
let refreshAbort: AbortController | null = null;

export type RefreshResult = 'success' | 'unauthorized' | 'unavailable';

/** Block silent refresh while logout is in progress / until next login. */
export function beginLogout(): void {
  suppressSessionRestore = true;
  refreshGeneration += 1;
  refreshAbort?.abort();
  refreshAbort = null;
  refreshPromise = null;
}

export function isSessionRestoreSuppressed(): boolean {
  return suppressSessionRestore;
}

/**
 * Rotate access token via httpOnly refresh cookie.
 * - success: new access token stored
 * - unauthorized: server rejected refresh — local access tokens cleared
 * - unavailable: network/5xx — keep existing session for retry
 */
export async function refreshAccessToken(): Promise<RefreshResult> {
  if (suppressSessionRestore) {
    return 'unauthorized';
  }
  if (refreshPromise) {
    return refreshPromise;
  }

  const generation = refreshGeneration;
  const abort = new AbortController();
  refreshAbort = abort;

  refreshPromise = (async (): Promise<RefreshResult> => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
        signal: abort.signal,
      });
      if (suppressSessionRestore || generation !== refreshGeneration) {
        return 'unauthorized';
      }
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          clearAuthTokens();
          return 'unauthorized';
        }
        return 'unavailable';
      }
      const data = await res.json();
      if (suppressSessionRestore || generation !== refreshGeneration) {
        return 'unauthorized';
      }
      if (data.access_token && typeof data.access_token === 'string') {
        setAuthTokens(data.access_token, data.refresh_token);
        return 'success';
      }
      clearAuthTokens();
      return 'unauthorized';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return 'unauthorized';
      }
      // Network / timeout — do not wipe a still-valid session.
      return 'unavailable';
    } finally {
      if (generation === refreshGeneration) {
        refreshPromise = null;
        if (refreshAbort === abort) {
          refreshAbort = null;
        }
      }
    }
  })();

  return refreshPromise;
}

export function shouldAttemptTokenRefresh(url: string): boolean {
  return (
    !url.includes('/api/auth/login') &&
    !url.includes('/api/auth/register') &&
    !url.includes('/api/auth/refresh') &&
    !url.includes('/api/auth/logout') &&
    !url.includes('/api/auth/google')
  );
}

export async function fetchStreamTicket(trackId: number): Promise<string | null> {
  const res = await fetch(`/api/music/${trackId}/stream/ticket`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getAccessToken() || ''}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.ticket || null;
}

export function buildMasterStreamUrl(trackId: number | undefined, ticket: string | null): string | null {
  if (!trackId || !ticket) return null;
  return `/api/music/${trackId}/stream/master?ticket=${encodeURIComponent(ticket)}`;
}

export function createAuthenticatedWebSocket(url: string, token: string | null): WebSocket | null {
  if (!token) return null;
  return new WebSocket(url, [`verisonic.${token}`]);
}

export async function fetchBroadcastKey(stationId: number): Promise<string | null> {
  const res = await fetch(`/api/radio/${stationId}/broadcast-key`, {
    headers: {
      Authorization: `Bearer ${getAccessToken() || ''}`,
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.stream_key || null;
}
