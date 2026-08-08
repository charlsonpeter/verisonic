import * as FileSystem from 'expo-file-system';
import type { RadioStation, Track } from '@/types/models';

export type PersistedPlayerSession = {
  mode: 'track' | 'radio';
  track: Track | null;
  station: RadioStation | null;
  queue: Track[];
  queueIndex: number;
  positionMs: number;
  updatedAt: string;
};

function sessionUri(): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('No document directory');
  return `${base}player-session.json`;
}

export async function loadPlayerSession(): Promise<PersistedPlayerSession | null> {
  try {
    const uri = sessionUri();
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    const raw = await FileSystem.readAsStringAsync(uri);
    const parsed = JSON.parse(raw) as PersistedPlayerSession;
    if (parsed.mode !== 'track' && parsed.mode !== 'radio') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePlayerSession(session: PersistedPlayerSession): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(sessionUri(), JSON.stringify(session));
  } catch {
    // ignore persistence failures
  }
}

export async function clearPlayerSession(): Promise<void> {
  try {
    const uri = sessionUri();
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore
  }
}
