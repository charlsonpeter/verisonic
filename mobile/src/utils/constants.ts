import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API base URL.
 * Prefer app.json `extra.apiUrl`, then EXPO_PUBLIC_API_URL at build time.
 * Override at runtime via EXPO_PUBLIC_API_URL when starting Expo.
 *
 * iOS Simulator: NSURLSession fails cleartext HTTP to public IPs
 * ("Network request failed"). In __DEV__, those hosts are rewritten to
 * 127.0.0.1 so traffic can go through a local proxy/docker on :3000.
 * Physical devices: set EXPO_PUBLIC_API_URL to skip the rewrite.
 */
function resolveDefaultApiUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (fromExtra) return fromExtra.replace(/\/$/, '');
  return 'http://54.66.243.141:3000/api';
}

function isIpv4Host(host: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function applyIosSimulatorLoopback(url: string): string {
  if (!__DEV__ || Platform.OS !== 'ios') return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || !isIpv4Host(parsed.hostname)) return url;
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0') return url;
    parsed.hostname = '127.0.0.1';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url;
  }
}

const rawApiUrl = (process.env.EXPO_PUBLIC_API_URL || resolveDefaultApiUrl()).replace(/\/$/, '');
export const API_URL = process.env.EXPO_PUBLIC_API_URL
  ? rawApiUrl
  : applyIosSimulatorLoopback(rawApiUrl);

/** Prefer emulator-friendly host when launching without env override. */
export const METRO_HINT = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const FREE_TRACK_PREVIEW_SECONDS = 30;
export const FREE_RADIO_PREVIEW_SECONDS = 60;

export const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=300';
