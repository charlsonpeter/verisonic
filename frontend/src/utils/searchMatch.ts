export interface SearchField {
  value: string;
  weight?: number;
}

const DIACRITICS = /\p{Diacritic}/gu;
const NON_WORD = /[^\p{L}\p{N}\s]/gu;

/** Normalize text for comparison: lowercase, strip diacritics, collapse whitespace. */
export function normalizeSearchText(value: string): string {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(NON_WORD, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split query into searchable tokens (words). */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when every character in `needle` appears in order inside `haystack`. */
function fuzzySubsequenceMatch(needle: string, haystack: string): boolean {
  if (needle.length < 3) return false;
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) index += 1;
    if (index === needle.length) return true;
  }
  return false;
}

function scoreTokenInField(token: string, field: string): number {
  if (!token || !field) return 0;
  if (field === token) return 100;
  if (field.startsWith(token)) return 85;

  const wordBoundary = new RegExp(`(?:^|\\s)${escapeRegex(token)}`, 'i');
  if (wordBoundary.test(field)) return 72;

  if (field.includes(token)) return 50;
  if (fuzzySubsequenceMatch(token, field)) return 28;

  return 0;
}

/**
 * Score how well `query` matches the given weighted fields.
 * Uses AND logic across tokens: every token must match at least one field.
 * Returns 0 when there is no match.
 */
export function scoreSearchQuery(query: string, fields: SearchField[]): number {
  const tokens = tokenizeSearchQuery(query);
  if (tokens.length === 0) return 0;

  const normalizedFields = fields
    .map((field) => ({
      value: normalizeSearchText(field.value),
      weight: field.weight ?? 1,
    }))
    .filter((field) => field.value.length > 0);

  if (normalizedFields.length === 0) return 0;

  const normalizedQuery = normalizeSearchText(query);
  let total = 0;

  const primaryField = normalizedFields.reduce((best, field) =>
    field.weight > best.weight ? field : best
  );

  if (normalizedQuery && primaryField.value === normalizedQuery) {
    total += 60;
  } else if (normalizedQuery && primaryField.value.startsWith(normalizedQuery)) {
    total += 35;
  } else if (normalizedQuery && primaryField.value.includes(normalizedQuery)) {
    total += 20;
  }

  for (const token of tokens) {
    let bestTokenScore = 0;
    for (const field of normalizedFields) {
      const tokenScore = scoreTokenInField(token, field.value);
      if (tokenScore > 0) {
        bestTokenScore = Math.max(bestTokenScore, tokenScore * field.weight);
      }
    }
    if (bestTokenScore === 0) return 0;
    total += bestTokenScore;
  }

  return total;
}

export function matchesSearchQuery(query: string, fields: SearchField[]): boolean {
  return scoreSearchQuery(query, fields) > 0;
}

export interface RankedSearchResult<T> {
  item: T;
  score: number;
}

/** Filter and sort items by search relevance (highest score first). */
export function rankSearchResults<T>(
  items: T[],
  query: string,
  getFields: (item: T) => SearchField[],
  options?: { limit?: number; minScore?: number }
): RankedSearchResult<T>[] {
  const minScore = options?.minScore ?? 1;
  const ranked = items
    .map((item) => ({
      item,
      score: scoreSearchQuery(query, getFields(item)),
    }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score);

  return options?.limit ? ranked.slice(0, options.limit) : ranked;
}

type TrackSearchShape = {
  title: string;
  artist_name: string;
  artist_name_override?: string;
  album_title?: string;
  composer?: string;
  genres?: string[];
};

type RadioSearchShape = {
  name: string;
  description?: string;
  category?: string;
  broadcast_frequency?: string;
  city?: string;
};

export function trackSearchFields<T extends TrackSearchShape>(track: T): SearchField[] {
  const artist = track.artist_name || track.artist_name_override || '';
  const fields: SearchField[] = [
    { value: track.title, weight: 1.2 },
    { value: artist, weight: 1 },
  ];
  if (track.album_title) fields.push({ value: track.album_title, weight: 0.85 });
  if (track.composer) fields.push({ value: track.composer, weight: 0.7 });
  if (track.genres?.length) {
    fields.push({ value: track.genres.join(' '), weight: 0.65 });
  }
  return fields;
}

export function radioSearchFields<T extends RadioSearchShape>(station: T): SearchField[] {
  const fields: SearchField[] = [{ value: station.name, weight: 1.2 }];
  if (station.category) fields.push({ value: station.category, weight: 0.9 });
  if (station.description) fields.push({ value: station.description, weight: 0.75 });
  if (station.broadcast_frequency) fields.push({ value: station.broadcast_frequency, weight: 0.7 });
  if (station.city) fields.push({ value: station.city, weight: 0.6 });
  return fields;
}

export function artistSearchFields(name: string): SearchField[] {
  return [{ value: name, weight: 1 }];
}

export function playlistSearchFields<T extends { name: string }>(playlist: T): SearchField[] {
  return [{ value: playlist.name, weight: 1 }];
}

/** Primary API search term: first token widens backend results; ranking happens client-side. */
export function primarySearchTerm(query: string): string {
  const tokens = tokenizeSearchQuery(query);
  return tokens[0] || query.trim();
}

function uniqueSearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const terms = new Set<string>([trimmed]);
  const primary = primarySearchTerm(trimmed);
  if (primary && primary !== trimmed) terms.add(primary);
  return Array.from(terms);
}

/** Fetch tracks from API using full query and primary token (deduped by id). */
export async function fetchSearchTracks(
  query: string
): Promise<Array<{ id: number; artist_name: string; artist_name_override?: string; album_title?: string }>> {
  const terms = uniqueSearchTerms(query);
  if (terms.length === 0) return [];

  const responses = await Promise.all(
    terms.map((term) =>
      fetch(`/api/music?search=${encodeURIComponent(term)}&approved_only=true`)
    )
  );

  const tracks: Array<{ id: number; artist_name: string; artist_name_override?: string; album_title?: string }> = [];
  const seen = new Set<number>();

  for (const res of responses) {
    if (!res.ok) continue;
    const data = await res.json();
    for (const track of data) {
      if (!seen.has(track.id)) {
        seen.add(track.id);
        tracks.push(track);
      }
    }
  }

  return tracks;
}

export function getTrackArtistName(track: {
  artist_name: string;
  artist_name_override?: string;
}): string {
  return (track.artist_name || track.artist_name_override || '').trim();
}

export function getTrackAlbumTitle(track: { album_title?: string }): string {
  return (track.album_title || '').trim();
}

export interface ArtistCandidate {
  name: string;
  trackCount: number;
}

export interface AlbumCandidate {
  title: string;
  trackCount: number;
  cover_art_url?: string;
  artist_name?: string;
}

/** Unique display artist names from track metadata. */
export function buildArtistCandidatesFromTracks(
  tracks: Array<{ artist_name: string; artist_name_override?: string }>
): ArtistCandidate[] {
  const trackCounts = new Map<string, number>();

  for (const track of tracks) {
    const name = getTrackArtistName(track);
    if (!name) continue;
    trackCounts.set(name, (trackCounts.get(name) ?? 0) + 1);
  }

  return Array.from(trackCounts.entries()).map(([name, trackCount]) => ({
    name,
    trackCount,
  }));
}

export function buildAlbumCandidatesFromTracks(
  tracks: Array<{ album_title?: string; cover_art_url?: string; artist_name: string; artist_name_override?: string }>
): AlbumCandidate[] {
  const albums = new Map<string, { trackCount: number; cover_art_url?: string; artist_name?: string }>();

  for (const track of tracks) {
    const title = getTrackAlbumTitle(track);
    if (!title) continue;
    const existing = albums.get(title);
    if (!existing) {
      albums.set(title, {
        trackCount: 1,
        cover_art_url: track.cover_art_url,
        artist_name: getTrackArtistName(track),
      });
    } else {
      existing.trackCount += 1;
      if (!existing.cover_art_url && track.cover_art_url) {
        existing.cover_art_url = track.cover_art_url;
      }
    }
  }

  return Array.from(albums.entries()).map(([title, info]) => ({
    title,
    trackCount: info.trackCount,
    cover_art_url: info.cover_art_url,
    artist_name: info.artist_name,
  }));
}

export function albumSearchFields(album: AlbumCandidate): SearchField[] {
  const fields: SearchField[] = [{ value: album.title, weight: 1.2 }];
  if (album.artist_name) fields.push({ value: album.artist_name, weight: 0.75 });
  return fields;
}

export function rankAlbumCandidates(
  candidates: AlbumCandidate[],
  query: string,
  options?: { limit?: number }
): RankedSearchResult<AlbumCandidate>[] {
  return rankSearchResults(candidates, query, albumSearchFields, options);
}

export function rankArtistCandidates(
  candidates: ArtistCandidate[],
  query: string,
  options?: { limit?: number }
): RankedSearchResult<ArtistCandidate>[] {
  return rankSearchResults(
    candidates,
    query,
    (candidate) => artistSearchFields(candidate.name),
    options
  );
}

export function trackBelongsToArtist(
  track: { artist_name: string; artist_name_override?: string },
  artistName: string
): boolean {
  const target = normalizeSearchText(artistName);
  if (!target) return false;
  const displayName = normalizeSearchText(getTrackArtistName(track));
  const metadataName = normalizeSearchText(track.artist_name || '');
  const overrideName = normalizeSearchText(track.artist_name_override || '');
  return displayName === target || metadataName === target || overrideName === target;
}

export function trackBelongsToAlbum(
  track: { album_title?: string },
  albumTitle: string
): boolean {
  const target = normalizeSearchText(albumTitle);
  if (!target) return false;
  return normalizeSearchText(getTrackAlbumTitle(track)) === target;
}

export function filterTracksByArtist<T extends { artist_name: string; artist_name_override?: string }>(
  tracks: T[],
  artistName: string
): T[] {
  return tracks.filter((track) => trackBelongsToArtist(track, artistName));
}

export function filterTracksByAlbum<T extends { album_title?: string }>(
  tracks: T[],
  albumTitle: string
): T[] {
  return tracks.filter((track) => trackBelongsToAlbum(track, albumTitle));
}
