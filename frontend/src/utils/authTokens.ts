const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return null;
}

export function setAuthTokens(accessToken: string, _refreshToken?: string | null): void {
  sessionStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function clearAuthTokens(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let refreshPromise: Promise<boolean> | null = null;

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        clearAuthTokens();
        return false;
      }
      const data = await res.json();
      if (data.access_token) {
        setAuthTokens(data.access_token, data.refresh_token);
        return true;
      }
      clearAuthTokens();
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function shouldAttemptTokenRefresh(url: string): boolean {
  return (
    !url.includes('/api/auth/login') &&
    !url.includes('/api/auth/register') &&
    !url.includes('/api/auth/refresh') &&
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
