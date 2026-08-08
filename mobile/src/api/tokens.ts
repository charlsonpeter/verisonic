import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'verisonic_access_token';
const REFRESH_KEY = 'verisonic_refresh_token';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    }),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await withTimeout(SecureStore.getItemAsync(ACCESS_KEY), 2000, null);
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await withTimeout(SecureStore.getItemAsync(REFRESH_KEY), 2000, null);
  } catch {
    return null;
  }
}

export async function setAuthTokens(accessToken: string, refreshToken?: string | null): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(ACCESS_KEY, accessToken), 2000, undefined as unknown as void);
    if (refreshToken) {
      await withTimeout(SecureStore.setItemAsync(REFRESH_KEY, refreshToken), 2000, undefined as unknown as void);
    }
  } catch {
    // ignore storage failures — session will be in-memory only for this run
  }
}

/** @deprecated Prefer setAuthTokens — kept for call sites that only have access. */
export async function setAccessToken(token: string): Promise<void> {
  await setAuthTokens(token);
}

export async function clearAuthTokens(): Promise<void> {
  try {
    await withTimeout(SecureStore.deleteItemAsync(ACCESS_KEY), 2000, undefined as unknown as void);
  } catch {
    // ignore
  }
  try {
    await withTimeout(SecureStore.deleteItemAsync(REFRESH_KEY), 2000, undefined as unknown as void);
  } catch {
    // ignore
  }
}

export async function clearAccessToken(): Promise<void> {
  await clearAuthTokens();
}
