import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'verisonic_access_token';

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

export async function setAccessToken(token: string): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(ACCESS_KEY, token), 2000, undefined as unknown as void);
  } catch {
    // ignore storage failures — session will be in-memory only for this run
  }
}

export async function clearAccessToken(): Promise<void> {
  try {
    await withTimeout(SecureStore.deleteItemAsync(ACCESS_KEY), 2000, undefined as unknown as void);
  } catch {
    // ignore
  }
}
