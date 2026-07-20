export type StreamQualityTrack = {
  id?: number;
  original_file_path?: string;
  hls_playlist_path?: string;
  hls_normal_path?: string;
  hls_high_path?: string;
  hls_lossless_path?: string;
  hls_hires_path?: string;
  mp3_320_path?: string;
  aac_256_path?: string;
  aac_128_path?: string;
  stream_url?: string;
  file_format?: string;
  sample_rate?: number;
  bit_depth?: number;
};

export type QualityLevelSetting = 'normal' | 'high' | 'hires' | 'lossless';

import { fetchStreamTicket, buildMasterStreamUrl } from './authTokens';

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
  lossless: 'True lossless FLAC HLS at CD quality (16-bit / 44.1 kHz) — segmented, not a full-file download.',
  hires: 'True lossless FLAC HLS at the original sample rate and bit depth (Hi-Res Master) — segmented streaming.',
  high: 'AAC 256 kbps HLS — high-quality lossy segmented streaming.',
  normal: 'AAC 128 kbps HLS — optimized for mobile and limited bandwidth.',
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

export function isMasterStreamPath(path: string): boolean {
  return path.toLowerCase().includes('/stream/master');
}

/** True when URL/path is a FLAC lossless or hi-res HLS playlist. */
export function isFlacHlsPath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.includes('/lossless/') || lower.includes('/hires/');
}

export function formatMasterStreamLabel(
  track: StreamQualityTrack,
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

/** True when any quality HLS playlist (or legacy free preview) is available. */
export function trackHasPlayableStream(track: StreamQualityTrack): boolean {
  return !!(
    track.hls_normal_path ||
    track.hls_high_path ||
    track.hls_lossless_path ||
    track.hls_hires_path ||
    track.hls_playlist_path ||
    track.aac_128_path ||
    track.stream_url
  );
}

/**
 * Resolve stream candidates for the user's quality setting.
 * Primary playback is HLS segments.
 * Free tier may fall back to progressive AAC 128 only until normal HLS exists.
 * Premium always uses HLS (FLAC tiers fall back to high/normal HLS if needed).
 */
export function getStreamCandidatesForQuality(
  track: StreamQualityTrack,
  quality: QualityLevelSetting,
  isPremium: boolean,
): string[] {
  if (!isPremium) {
    // Free tier: normal HLS, then legacy progressive AAC 128 during migration
    return uniquePaths([track.hls_normal_path, track.aac_128_path]);
  }

  let primary: Array<string | undefined | null> = [];
  switch (quality) {
    case 'lossless':
      primary = [
        track.hls_lossless_path,
        track.hls_high_path,
        track.hls_playlist_path,
        track.hls_normal_path,
      ];
      break;
    case 'hires':
      primary = [
        track.hls_hires_path,
        track.hls_lossless_path,
        track.hls_high_path,
        track.hls_playlist_path,
        track.hls_normal_path,
      ];
      break;
    case 'high':
      primary = [
        track.hls_high_path,
        track.hls_playlist_path,
        track.hls_normal_path,
      ];
      break;
    case 'normal':
      primary = [track.hls_normal_path];
      break;
    default:
      primary = [track.hls_normal_path];
  }

  return uniquePaths(primary);
}

export async function resolveStreamUrl(path: string, track?: StreamQualityTrack): Promise<string> {
  if (isMasterStreamPath(path) && track?.id) {
    const ticket = await fetchStreamTicket(track.id);
    if (!ticket) return '';
    return buildMasterStreamUrl(track.id, ticket) || '';
  }
  return path;
}

export function describeStreamPath(
  path: string,
  track?: StreamQualityTrack,
): string {
  const lower = path.toLowerCase();
  if (isMasterStreamPath(path)) {
    return track ? formatMasterStreamLabel(track) : 'Studio master';
  }
  if (lower.includes('/lossless/') || lower.includes('hls_lossless')) {
    return 'Lossless FLAC HLS · 16-bit / 44.1 kHz';
  }
  if (lower.includes('/hires/') || lower.includes('hls_hires')) {
    return track
      ? `Hi-Res FLAC HLS · ${formatMasterStreamLabel(track)}`
      : 'Hi-Res Master FLAC HLS';
  }
  if (lower.includes('/high/') || lower.includes('hls_high')) {
    return 'High Quality HLS · AAC 256 kbps';
  }
  if (lower.includes('/normal/') || lower.includes('hls_normal')) {
    return 'Normal Quality HLS · AAC 128 kbps';
  }
  if (lower.includes('.m3u8') || lower.includes('/hls/')) return 'HLS adaptive stream';
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
