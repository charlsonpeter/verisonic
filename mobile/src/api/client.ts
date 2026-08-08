import { API_URL } from '@/utils/constants';
import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
} from '@/api/tokens';

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export type RefreshResult = 'success' | 'unauthorized' | 'unavailable';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  auth?: boolean;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Internal: skip refresh+retry to avoid loops. */
  _retried?: boolean;
};

function detailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: unknown }).message);
  }
  return fallback;
}

let refreshPromise: Promise<RefreshResult> | null = null;
const sessionInvalidListeners = new Set<() => void>();

export function onSessionInvalid(listener: () => void): () => void {
  sessionInvalidListeners.add(listener);
  return () => {
    sessionInvalidListeners.delete(listener);
  };
}

function emitSessionInvalid() {
  sessionInvalidListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
}

/**
 * Rotate tokens using the SecureStore refresh token (body-based; no cookies on native).
 */
export async function refreshAccessToken(): Promise<RefreshResult> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshResult> => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await clearAuthTokens();
      return 'unauthorized';
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          await clearAuthTokens();
          return 'unauthorized';
        }
        return 'unavailable';
      }

      const data = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!data.access_token) {
        await clearAuthTokens();
        return 'unauthorized';
      }
      // Server rotates refresh tokens — always persist the new pair.
      await setAuthTokens(data.access_token, data.refresh_token ?? refreshToken);
      return 'success';
    } catch {
      return 'unavailable';
    } finally {
      clearTimeout(timer);
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = true,
    headers = {},
    timeoutMs = 12000,
    _retried = false,
  } = options;
  let token = options.token;
  if (auth && token === undefined) {
    token = await getAccessToken();
  }

  const reqHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...headers,
  };
  if (body !== undefined) {
    reqHeaders['Content-Type'] = 'application/json';
  }
  if (auth && token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(`Request timed out (${API_URL})`, 408);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 && auth && !_retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed === 'success') {
      return apiRequest<T>(path, { ...options, token: undefined, _retried: true });
    }
    if (refreshed === 'unauthorized') {
      emitSessionInvalid();
    }
    // unavailable: fall through and surface the 401 without wiping tokens
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail ?? data;
    throw new ApiError(detailMessage(detail, `Request failed (${res.status})`), res.status, detail);
  }

  return data as T;
}
