export type StreamQualityTrack = {
  id?: number;
  original_file_path?: string;
  hls_playlist_path?: string;
  mp3_320_path?: string;
  aac_256_path?: string;
  aac_128_path?: string;
  stream_url?: string;
};

export type QualityLevelSetting = 'normal' | 'high' | 'hires' | 'lossless';

export const QUALITY_STORAGE_KEY = 'qualityLevelSetting';

const VALID_QUALITY_LEVELS: QualityLevelSetting[] = ['normal', 'high', 'hires', 'lossless'];

function qualityStorageKey(userId?: number | null): string {
  return userId ? `${QUALITY_STORAGE_KEY}:${userId}` : QUALITY_STORAGE_KEY;
}

export function loadStoredQuality(userId?: number | null): QualityLevelSetting | null {
  const stored = localStorage.getItem(qualityStorageKey(userId)) as QualityLevelSetting | null;
  if (stored && VALID_QUALITY_LEVELS.includes(stored)) {
    return stored;
  }

  if (userId) {
    const legacy = localStorage.getItem(QUALITY_STORAGE_KEY) as QualityLevelSetting | null;
    if (legacy && VALID_QUALITY_LEVELS.includes(legacy)) {
      localStorage.setItem(qualityStorageKey(userId), legacy);
      return legacy;
    }
  }

  return null;
}

export function saveStoredQuality(quality: QualityLevelSetting, userId?: number | null): void {
  localStorage.setItem(qualityStorageKey(userId), quality);
}

export function getEffectiveQuality(
  preferred: QualityLevelSetting,
  canConfigureStreamQuality: boolean
): QualityLevelSetting {
  return canConfigureStreamQuality ? preferred : 'normal';
}

export const QUALITY_LABELS: Record<QualityLevelSetting, string> = {
  lossless: 'Lossless',
  hires: 'Hi-Res Master',
  high: 'High Quality',
  normal: 'Normal Quality',
};

export const QUALITY_DESCRIPTIONS: Record<QualityLevelSetting, string> = {
  lossless: 'Best studio master quality. Recommended for external DACs.',
  hires: 'High-resolution streaming for premium headphones and speakers.',
  high: 'Balanced quality with efficient streaming.',
  normal: 'Optimized for mobile and limited bandwidth.',
};

function uniquePaths(paths: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

export function buildMasterStreamUrl(trackId: number | undefined, accessToken: string | null): string | null {
  if (!trackId || !accessToken) return null;
  return `/api/music/${trackId}/stream/master?access_token=${encodeURIComponent(accessToken)}`;
}

export function getStreamCandidatesForQuality(
  track: StreamQualityTrack,
  quality: QualityLevelSetting,
  isPremium: boolean,
  accessToken: string | null = null,
): string[] {
  if (!isPremium) {
    return track.aac_128_path ? [track.aac_128_path] : [];
  }

  const masterUrl = buildMasterStreamUrl(track.id, accessToken);

  switch (quality) {
    case 'lossless':
      return uniquePaths([
        masterUrl,
        track.hls_playlist_path,
        track.mp3_320_path,
        track.aac_256_path,
        track.stream_url,
      ]);
    case 'hires':
      return uniquePaths([
        track.hls_playlist_path,
        masterUrl,
        track.aac_256_path,
        track.mp3_320_path,
        track.stream_url,
      ]);
    case 'high':
      return uniquePaths([
        track.mp3_320_path,
        track.aac_256_path,
        track.hls_playlist_path,
        track.aac_128_path,
        track.stream_url,
      ]);
    case 'normal':
      return uniquePaths([
        track.aac_128_path,
        track.mp3_320_path,
        track.stream_url,
      ]);
    default:
      return uniquePaths([
        track.hls_playlist_path,
        track.mp3_320_path,
        track.aac_128_path,
        track.stream_url,
      ]);
  }
}

export function describeStreamPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.includes('/stream/master')) return 'Lossless master';
  if (lower.includes('.m3u8') || lower.includes('/hls/')) return 'HLS adaptive';
  if (lower.includes('/originals/') || lower.endsWith('.flac')) return 'Lossless master';
  if (lower.endsWith('.wav') || lower.endsWith('.aiff') || lower.endsWith('.alac')) return 'Lossless master';
  if (lower.includes('320k') || lower.endsWith('.mp3')) return 'MP3 320 kbps';
  if (lower.includes('256k')) return 'AAC 256 kbps';
  if (lower.includes('128k') || lower.endsWith('.aac')) return 'AAC 128 kbps';
  if (lower.startsWith('/api/radio/')) return 'Live stream';
  return 'Stream';
}
