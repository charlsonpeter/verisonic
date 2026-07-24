import type { Track } from '@/types/models';
import type { QualityLevelSetting } from '@/types/models';
import { absoluteMediaUrl } from '@/utils/accountTier';
import { API_URL } from '@/utils/constants';

export function getStreamCandidates(
  track: Track,
  quality: QualityLevelSetting,
): string[] {
  const paths: Array<string | undefined> = [];
  switch (quality) {
    case 'lossless':
      paths.push(track.hls_lossless_path, track.hls_hires_path, track.hls_high_path, track.hls_normal_path);
      break;
    case 'hires':
      paths.push(track.hls_hires_path, track.hls_lossless_path, track.hls_high_path, track.hls_normal_path);
      break;
    case 'high':
      paths.push(track.hls_high_path, track.aac_256_path, track.mp3_320_path, track.hls_normal_path, track.aac_128_path);
      break;
    case 'normal':
    default:
      paths.push(track.hls_normal_path, track.aac_128_path, track.hls_playlist_path, track.stream_url);
      break;
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const abs = absoluteMediaUrl(p, API_URL);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** Progressive file URL preferred for offline download (not HLS). */
export function getDownloadUrl(
  track: Track,
  premium: boolean,
): { url: string; quality: 'aac_128' | 'aac_256' | 'mp3_320' } | null {
  if (premium) {
    const mp3 = absoluteMediaUrl(track.mp3_320_path, API_URL);
    if (mp3) return { url: mp3, quality: 'mp3_320' };
    const aac256 = absoluteMediaUrl(track.aac_256_path, API_URL);
    if (aac256) return { url: aac256, quality: 'aac_256' };
  }
  const aac128 = absoluteMediaUrl(track.aac_128_path, API_URL);
  if (aac128) return { url: aac128, quality: 'aac_128' };
  const fallback = absoluteMediaUrl(track.stream_url, API_URL);
  if (fallback && !fallback.includes('.m3u8')) {
    return { url: fallback, quality: 'aac_128' };
  }
  return null;
}

export function radioLiveUrl(stationId: number): string {
  return `${API_URL}/radio/${stationId}/live`;
}
