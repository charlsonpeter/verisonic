import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * API base URL.
 * Prefer app.json `extra.apiUrl`, then EXPO_PUBLIC_API_URL at build time.
 * Override at runtime via EXPO_PUBLIC_API_URL when starting Expo.
 */
function resolveDefaultApiUrl(): string {
  const fromExtra = Constants.expoConfig?.extra?.apiUrl as string | undefined;
  if (fromExtra) return fromExtra.replace(/\/$/, '');
  return 'http://54.66.243.141:3000/api';
}

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || resolveDefaultApiUrl()).replace(/\/$/, '');

/** Prefer emulator-friendly host when launching without env override. */
export const METRO_HINT = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const FREE_TRACK_PREVIEW_SECONDS = 30;
export const FREE_RADIO_PREVIEW_SECONDS = 60;

export const DEFAULT_COVER =
  'https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=300';
