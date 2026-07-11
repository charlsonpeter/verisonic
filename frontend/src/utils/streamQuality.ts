export type StreamQualityTrack = {
  id?: number;
  original_file_path?: string;
  hls_playlist_path?: string;
  mp3_320_path?: string;
  aac_256_path?: string;
  aac_128_path?: string;
  stream_url?: string;
  file_format?: string;
  sample_rate?: number;
  bit_depth?: number;
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
  lossless: 'Original studio master file — bit-perfect FLAC, WAV, or AIFF as uploaded.',
  hires: 'Same original studio master — full sample rate and bit depth from the source file.',
  high: 'MP3 320 kbps or AAC 256 kbps — high-quality lossy streaming.',
  normal: 'AAC 128 kbps — optimized for mobile and limited bandwidth.',
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

export function isMasterStreamPath(path: string): boolean {
  return path.toLowerCase().includes('/stream/master');
}

export function formatMasterStreamLabel(
  track: Pick<StreamQualityTrack, 'file_format' | 'sample_rate' | 'bit_depth'>,
): string {
  const fmt = track.file_format?.trim().toUpperCase() || 'STUDIO MASTER';
  const parts: string[] = [fmt];
  if (track.sample_rate && track.sample_rate > 0) {
    const khz =
      track.sample_rate >= 1000
        ? `${(track.sample_rate / 1000) % 1 === 0 ? track.sample_rate / 1000 : (track.sample_rate / 1000).toFixed(1)} kHz`
        : `${track.sample_rate} Hz`;
    parts.push(khz);
  }
  if (track.bit_depth && track.bit_depth > 0) {
    parts.push(`${track.bit_depth}-bit`);
  }
  return parts.join(' · ');
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
    case 'hires':
      return masterUrl ? [masterUrl] : [];
    case 'high':
      return uniquePaths([
        track.mp3_320_path,
        track.aac_256_path,
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
        track.mp3_320_path,
        track.aac_128_path,
        track.stream_url,
      ]);
  }
}

export function describeStreamPath(
  path: string,
  track?: Pick<StreamQualityTrack, 'file_format' | 'sample_rate' | 'bit_depth'>,
): string {
  const lower = path.toLowerCase();
  if (isMasterStreamPath(path)) {
    return track ? formatMasterStreamLabel(track) : 'Studio master';
  }
  if (lower.includes('.m3u8') || lower.includes('/hls/')) return 'HLS adaptive (AAC 256 kbps)';
  if (lower.includes('/originals/') || lower.endsWith('.flac')) return 'Lossless master';
  if (lower.endsWith('.wav') || lower.endsWith('.aiff') || lower.endsWith('.alac')) return 'Lossless master';
  if (lower.includes('320k') || lower.endsWith('.mp3')) return 'MP3 320 kbps';
  if (lower.includes('256k')) return 'AAC 256 kbps';
  if (lower.includes('128k') || lower.endsWith('.aac')) return 'AAC 128 kbps';
  if (lower.startsWith('/api/radio/')) return 'Live stream';
  return 'Stream';
}

export function isStudioMasterQuality(quality: QualityLevelSetting): boolean {
  return quality === 'lossless' || quality === 'hires';
}
