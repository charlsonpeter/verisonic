import { absoluteMediaUrl } from '@/utils/accountTier';
import { API_URL, DEFAULT_COVER } from '@/utils/constants';

/** Resolve API-relative or localhost media paths for Image / AV. */
export function mediaUri(pathOrUrl?: string | null): string | undefined {
  return absoluteMediaUrl(pathOrUrl, API_URL);
}

export function coverUri(pathOrUrl?: string | null): string {
  return mediaUri(pathOrUrl) || DEFAULT_COVER;
}
