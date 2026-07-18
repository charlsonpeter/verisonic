import type { RadioStation } from '../context/AudioContext';
import { patchRadioNowPlayingDom } from './radioDomPatch';

type RadioMetadataListener = (stations: RadioStation[]) => void;

const POLL_MS = 5000;

let pollToken: string | null = null;
let intervalId: ReturnType<typeof setInterval> | null = null;
let inflight = false;
let latestStations: RadioStation[] = [];
const listeners = new Set<RadioMetadataListener>();

async function pollTick() {
  if (!pollToken || inflight) return;
  inflight = true;
  try {
    const res = await fetch('/api/radio', {
      headers: { Authorization: `Bearer ${pollToken}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as RadioStation[];
    latestStations = data;
    patchRadioNowPlayingDom(data);
    listeners.forEach((listener) => listener(data));
  } catch {
    /* ignore transient network errors */
  } finally {
    inflight = false;
  }
}

function ensurePolling() {
  if (intervalId !== null) return;
  void pollTick();
  intervalId = setInterval(() => { void pollTick(); }, POLL_MS);
}

function stopPollingIfIdle() {
  if (listeners.size > 0 || intervalId === null) return;
  clearInterval(intervalId);
  intervalId = null;
}

/** One shared poll for Radio page + player — avoids duplicate /api/radio requests. */
export function subscribeRadioMetadataPoll(
  token: string | null,
  listener: RadioMetadataListener,
): () => void {
  pollToken = token;
  listeners.add(listener);
  ensurePolling();

  if (latestStations.length > 0) {
    listener(latestStations);
  }

  return () => {
    listeners.delete(listener);
    stopPollingIfIdle();
  };
}
