import * as FileSystem from 'expo-file-system';
import type { DownloadedTrackMeta, Track } from '@/types/models';
import { mediaUri } from '@/utils/mediaUrl';
import { getDownloadUrl } from '@/utils/streamQuality';

function downloadsRoot(): string {
  const base = FileSystem.documentDirectory;
  if (!base) {
    throw new Error('Local storage is unavailable on this device.');
  }
  return `${base}downloads/`;
}

function indexUri(): string {
  return `${downloadsRoot()}index.json`;
}

async function ensureDir(): Promise<void> {
  const dir = downloadsRoot();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readIndex(): Promise<DownloadedTrackMeta[]> {
  try {
    const info = await FileSystem.getInfoAsync(indexUri());
    if (!info.exists) return [];
    const raw = await FileSystem.readAsStringAsync(indexUri());
    return JSON.parse(raw) as DownloadedTrackMeta[];
  } catch {
    return [];
  }
}

async function writeIndex(items: DownloadedTrackMeta[]): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(indexUri(), JSON.stringify(items));
}

export async function listDownloads(): Promise<DownloadedTrackMeta[]> {
  return readIndex();
}

export async function getDownload(trackId: number): Promise<DownloadedTrackMeta | null> {
  const items = await readIndex();
  return items.find((d) => d.trackId === trackId) ?? null;
}

export async function isDownloaded(trackId: number): Promise<boolean> {
  const item = await getDownload(trackId);
  if (!item) return false;
  const info = await FileSystem.getInfoAsync(item.localUri);
  return info.exists;
}

export async function downloadTrack(
  track: Track,
  premium: boolean,
  onProgress?: (ratio: number) => void,
): Promise<DownloadedTrackMeta> {
  const source = getDownloadUrl(track, premium);
  if (!source) {
    throw new Error('No downloadable progressive file for this track. Stream online instead.');
  }

  await ensureDir();
  const ext = source.quality === 'mp3_320' ? 'mp3' : 'm4a';
  const localUri = `${downloadsRoot()}${track.id}.${ext}`;

  const existing = await getDownload(track.id);
  if (existing) {
    const info = await FileSystem.getInfoAsync(existing.localUri);
    if (info.exists) return existing;
  }

  const result = await FileSystem.createDownloadResumable(
    source.url,
    localUri,
    {},
    (progress) => {
      if (!onProgress || !progress.totalBytesExpectedToWrite) return;
      onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
    },
  ).downloadAsync();

  if (!result?.uri) {
    throw new Error('Download failed.');
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  const meta: DownloadedTrackMeta = {
    trackId: track.id,
    title: track.title,
    artistName: track.artist_name_override || track.artist_name,
    coverArtUrl: mediaUri(track.cover_art_url) || track.cover_art_url,
    localUri: result.uri,
    quality: source.quality,
    downloadedAt: new Date().toISOString(),
    byteSize: info.exists && 'size' in info ? Number(info.size || 0) : 0,
  };

  const items = (await readIndex()).filter((d) => d.trackId !== track.id);
  items.unshift(meta);
  await writeIndex(items);
  return meta;
}

export async function removeDownload(trackId: number): Promise<void> {
  const items = await readIndex();
  const target = items.find((d) => d.trackId === trackId);
  if (target) {
    try {
      await FileSystem.deleteAsync(target.localUri, { idempotent: true });
    } catch {
      // ignore
    }
  }
  await writeIndex(items.filter((d) => d.trackId !== trackId));
}
