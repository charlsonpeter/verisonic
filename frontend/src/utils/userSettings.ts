import type { QualityLevelSetting } from './streamQuality';

const API_URL = '/api';

export async function saveUserStreamQuality(
  quality: QualityLevelSetting
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/me/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream_quality: quality }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function parseStoredStreamQuality(
  value: string | null | undefined
): QualityLevelSetting | null {
  if (!value) return null;
  if (['normal', 'high', 'hires', 'lossless'].includes(value)) {
    return value as QualityLevelSetting;
  }
  return null;
}
