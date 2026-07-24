import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useAuth } from '@/context/AuthContext';
import {
  addFavorite,
  clearTrackReaction,
  endRadioListenSession,
  fetchFavorites,
  fetchTrackReactions,
  heartbeatRadioListenSession,
  removeFavorite,
  reportTrackListenProgress,
  setTrackReaction,
  startRadioListenSession,
  type ReactionValue,
} from '@/api/endpoints';
import { getDownload } from '@/services/downloads';
import {
  clearPlayerSession,
  loadPlayerSession,
  savePlayerSession,
} from '@/services/playerSession';
import type { QualityLevelSetting, RadioStation, Track } from '@/types/models';
import {
  FREE_RADIO_PREVIEW_SECONDS,
  FREE_TRACK_PREVIEW_SECONDS,
} from '@/utils/constants';
import { getStreamCandidates, radioLiveUrl } from '@/utils/streamQuality';

type PlayerMode = 'idle' | 'track' | 'radio';
export type RepeatMode = 'none' | 'all' | 'one';

const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

type PlayerContextValue = {
  mode: PlayerMode;
  currentTrack: Track | null;
  currentStation: RadioStation | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  positionMs: number;
  durationMs: number;
  quality: QualityLevelSetting;
  setQuality: (q: QualityLevelSetting) => void;
  isShuffle: boolean;
  repeatMode: RepeatMode;
  playbackSpeed: number;
  favoriteIds: Set<number>;
  reactions: Record<number, ReactionValue>;
  playTrack: (track: Track, queue?: Track[]) => Promise<void>;
  playRadio: (station: RadioStation) => Promise<void>;
  togglePlay: () => Promise<void>;
  seekTo: (ms: number) => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  stop: () => Promise<void>;
  clearQueue: () => void;
  removeFromQueue: (trackId: number) => void;
  removeFromQueueAt: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPlaybackSpeed: (speed: number) => Promise<void>;
  bumpSpeed: (dir: -1 | 1) => Promise<void>;
  resetSpeed: () => Promise<void>;
  toggleFavorite: (trackId: number) => Promise<void>;
  toggleReaction: (trackId: number, reaction: ReactionValue) => Promise<void>;
  refreshLibraryState: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const { canPlayFull, user, token } = useAuth();
  const soundRef = useRef<Audio.Sound | null>(null);
  const radioSessionRef = useRef<string | null>(null);
  const radioStationIdRef = useRef<number | null>(null);
  const listenReportedRef = useRef(false);
  const orderedQueueRef = useRef<Track[]>([]);
  const repeatModeRef = useRef<RepeatMode>('none');
  const isShuffleRef = useRef(false);
  const playbackSpeedRef = useRef(1);

  const [mode, setMode] = useState<PlayerMode>('idle');
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [quality, setQuality] = useState<QualityLevelSetting>('normal');
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [playbackSpeed, setPlaybackSpeedState] = useState(1);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [reactions, setReactions] = useState<Record<number, ReactionValue>>({});

  useEffect(() => {
    isShuffleRef.current = isShuffle;
  }, [isShuffle]);
  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setQuality(canPlayFull ? 'high' : 'normal');
  }, [canPlayFull]);

  const refreshLibraryState = useCallback(async () => {
    if (!token) {
      setFavoriteIds(new Set());
      setReactions({});
      return;
    }
    try {
      const [favs, reacts] = await Promise.all([
        fetchFavorites().catch(() => [] as Track[]),
        fetchTrackReactions().catch(() => ({}) as Record<string, ReactionValue>),
      ]);
      setFavoriteIds(new Set(favs.map((t) => t.id)));
      const mapped: Record<number, ReactionValue> = {};
      for (const [k, v] of Object.entries(reacts)) {
        const id = Number(k);
        if (!Number.isNaN(id) && (v === 'like' || v === 'dislike')) mapped[id] = v;
      }
      setReactions(mapped);
    } catch {
      // ignore
    }
  }, [token]);

  useEffect(() => {
    void refreshLibraryState();
  }, [refreshLibraryState]);

  const unloadSound = useCallback(async () => {
    const sound = soundRef.current;
    soundRef.current = null;
    if (sound) {
      try {
        await sound.stopAsync();
      } catch {
        // ignore
      }
      try {
        await sound.unloadAsync();
      } catch {
        // ignore
      }
    }
  }, []);

  const endRadioSession = useCallback(async () => {
    const stationId = radioStationIdRef.current;
    const session = radioSessionRef.current;
    radioSessionRef.current = null;
    radioStationIdRef.current = null;
    if (stationId && session) {
      try {
        await endRadioListenSession(stationId, session);
      } catch {
        // ignore
      }
    }
  }, []);

  const onStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        setIsPlaying(false);
        return;
      }
      setIsPlaying(status.isPlaying);
      setPositionMs(status.positionMillis || 0);
      setDurationMs(status.durationMillis || 0);

      const previewLimitMs = FREE_TRACK_PREVIEW_SECONDS * 1000;
      if (mode === 'track' && !canPlayFull && status.positionMillis >= previewLimitMs) {
        void soundRef.current?.pauseAsync();
        void soundRef.current?.setPositionAsync(previewLimitMs);
        return;
      }

      if (
        mode === 'radio' &&
        !canPlayFull &&
        status.positionMillis >= FREE_RADIO_PREVIEW_SECONDS * 1000
      ) {
        void soundRef.current?.pauseAsync();
        return;
      }

      if (
        mode === 'track' &&
        currentTrack &&
        canPlayFull &&
        !listenReportedRef.current &&
        status.positionMillis >= 30_000
      ) {
        listenReportedRef.current = true;
        void reportTrackListenProgress(currentTrack.id, status.positionMillis / 1000).catch(
          () => undefined,
        );
      }

      if (status.didJustFinish && mode === 'track') {
        void playNextRef.current?.(true);
      }
    },
    [canPlayFull, currentTrack, mode],
  );

  const loadUri = useCallback(
    async (uri: string, shouldPlay = true, startPositionMs = 0) => {
      await unloadSound();
      const { sound } = await Audio.Sound.createAsync(
        { uri },
        {
          shouldPlay: false,
          progressUpdateIntervalMillis: 400,
          rate: playbackSpeedRef.current,
          shouldCorrectPitch: true,
          positionMillis: Math.max(0, startPositionMs),
        },
        onStatus,
      );
      soundRef.current = sound;
      if (playbackSpeedRef.current !== 1) {
        await sound.setRateAsync(playbackSpeedRef.current, true).catch(() => undefined);
      }
      if (startPositionMs > 0) {
        await sound.setPositionAsync(startPositionMs).catch(() => undefined);
        setPositionMs(startPositionMs);
      }
      if (shouldPlay) {
        await sound.playAsync();
      } else {
        setIsPlaying(false);
      }
    },
    [onStatus, unloadSound],
  );

  const playTrackAt = useCallback(
    async (
      track: Track,
      q: Track[],
      index: number,
      opts?: { autoplay?: boolean; startMs?: number },
    ) => {
      const autoplay = opts?.autoplay !== false;
      const startMs = opts?.startMs ?? 0;
      await endRadioSession();
      listenReportedRef.current = false;
      setMode('track');
      setCurrentStation(null);
      setCurrentTrack(track);
      setQueue(q);
      setQueueIndex(index);
      orderedQueueRef.current = q.length ? q : [track];

      const downloaded = await getDownload(track.id);
      if (downloaded) {
        await loadUri(downloaded.localUri, autoplay, startMs);
        return;
      }

      const preferred = canPlayFull ? quality : 'normal';
      const candidates = getStreamCandidates(track, preferred);
      let lastError: unknown;
      for (const uri of candidates) {
        try {
          await loadUri(uri, autoplay, startMs);
          return;
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Unable to play track');
    },
    [canPlayFull, endRadioSession, loadUri, quality],
  );

  const playTrack = useCallback(
    async (track: Track, nextQueue?: Track[]) => {
      const base = nextQueue?.length ? nextQueue : [track];
      orderedQueueRef.current = base;
      const working = isShuffleRef.current ? shuffleArray(base) : base;
      const idx = working.findIndex((t) => t.id === track.id);
      await playTrackAt(track, working, idx >= 0 ? idx : 0);
    },
    [playTrackAt],
  );

  const playRadio = useCallback(
    async (station: RadioStation, opts?: { autoplay?: boolean }) => {
      const autoplay = opts?.autoplay !== false;
      await endRadioSession();
      listenReportedRef.current = false;
      setMode('radio');
      setCurrentTrack(null);
      setCurrentStation(station);
      setQueue([]);
      setQueueIndex(0);
      orderedQueueRef.current = [];
      setPositionMs(0);

      const live = station.stream_url?.startsWith('http')
        ? station.stream_url
        : radioLiveUrl(station.id);

      await loadUri(live, autoplay, 0);

      if (autoplay && canPlayFull && user) {
        try {
          const session = await startRadioListenSession(station.id);
          if (session.session_token) {
            radioSessionRef.current = session.session_token;
            radioStationIdRef.current = station.id;
          }
        } catch {
          // optional
        }
      }
    },
    [canPlayFull, endRadioSession, loadUri, user],
  );

  const playNext = useCallback(
    async (fromNaturalEnd = false) => {
      if (mode !== 'track' || queue.length === 0) return;

      if (fromNaturalEnd && repeatModeRef.current === 'one') {
        await soundRef.current?.setPositionAsync(0);
        await soundRef.current?.playAsync();
        return;
      }

      if (!fromNaturalEnd && repeatModeRef.current === 'one') {
        // Manual next still advances
      }

      const atEnd = queueIndex >= queue.length - 1;
      if (atEnd && repeatModeRef.current === 'none' && fromNaturalEnd) {
        await soundRef.current?.pauseAsync();
        return;
      }

      const next = atEnd ? 0 : queueIndex + 1;
      await playTrackAt(queue[next], queue, next);
    },
    [mode, playTrackAt, queue, queueIndex],
  );

  const playNextRef = useRef(playNext);
  playNextRef.current = playNext;

  const playTrackAtRef = useRef(playTrackAt);
  playTrackAtRef.current = playTrackAt;
  const playRadioRef = useRef(playRadio);
  playRadioRef.current = playRadio;

  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !token) return;
    let cancelled = false;
    (async () => {
      const session = await loadPlayerSession();
      if (!session || cancelled) return;
      restoredRef.current = true;
      try {
        if (session.mode === 'track' && session.track) {
          const q = session.queue?.length ? session.queue : [session.track];
          const idx = Math.min(Math.max(session.queueIndex || 0, 0), q.length - 1);
          orderedQueueRef.current = q;
          await playTrackAtRef.current(session.track, q, idx, {
            autoplay: false,
            startMs: session.positionMs || 0,
          });
        } else if (session.mode === 'radio' && session.station) {
          await playRadioRef.current(session.station, { autoplay: false });
        }
      } catch {
        restoredRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Persist now-playing so the mini player can resume after relaunch.
  useEffect(() => {
    if (mode === 'idle' || (!currentTrack && !currentStation)) return;
    const handle = setTimeout(() => {
      void savePlayerSession({
        mode: mode === 'radio' ? 'radio' : 'track',
        track: currentTrack,
        station: currentStation,
        queue,
        queueIndex,
        positionMs,
        updatedAt: new Date().toISOString(),
      });
    }, 800);
    return () => clearTimeout(handle);
  }, [mode, currentTrack, currentStation, queue, queueIndex, positionMs]);

  const playPrevious = useCallback(async () => {
    if (mode !== 'track' || queue.length === 0) return;
    if (positionMs > 3000) {
      await soundRef.current?.setPositionAsync(0);
      return;
    }
    const prev = (queueIndex - 1 + queue.length) % queue.length;
    await playTrackAt(queue[prev], queue, prev);
  }, [mode, playTrackAt, positionMs, queue, queueIndex]);

  const ensureLoaded = useCallback(async () => {
    if (soundRef.current) {
      const status = await soundRef.current.getStatusAsync();
      if (status.isLoaded) return true;
    }
    if (mode === 'track' && currentTrack) {
      await playTrackAt(currentTrack, queue.length ? queue : [currentTrack], queueIndex, {
        autoplay: false,
        startMs: positionMs,
      });
      return true;
    }
    if (mode === 'radio' && currentStation) {
      await playRadio(currentStation, { autoplay: false });
      return true;
    }
    return false;
  }, [currentStation, currentTrack, mode, playRadio, playTrackAt, positionMs, queue, queueIndex]);

  const togglePlay = useCallback(async () => {
    const ready = await ensureLoaded();
    if (!ready) return;
    const sound = soundRef.current;
    if (!sound) return;
    const status = await sound.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await sound.pauseAsync();
    } else {
      if (
        mode === 'track' &&
        !canPlayFull &&
        status.positionMillis >= FREE_TRACK_PREVIEW_SECONDS * 1000
      ) {
        await sound.setPositionAsync(0);
      }
      await sound.playAsync();
    }
  }, [canPlayFull, ensureLoaded, mode]);

  const seekTo = useCallback(
    async (ms: number) => {
      if (mode !== 'track') return;
      const max = canPlayFull ? durationMs : FREE_TRACK_PREVIEW_SECONDS * 1000;
      const clamped = Math.max(0, Math.min(ms, max || ms));
      await ensureLoaded();
      await soundRef.current?.setPositionAsync(clamped);
      setPositionMs(clamped);
    },
    [canPlayFull, durationMs, ensureLoaded, mode],
  );

  const stop = useCallback(async () => {
    await endRadioSession();
    await unloadSound();
    setMode('idle');
    setCurrentTrack(null);
    setCurrentStation(null);
    setQueue([]);
    setQueueIndex(0);
    orderedQueueRef.current = [];
    setIsPlaying(false);
    setPositionMs(0);
    setDurationMs(0);
    void clearPlayerSession();
  }, [endRadioSession, unloadSound]);

  const clearQueue = useCallback(() => {
    if (currentTrack) {
      orderedQueueRef.current = [currentTrack];
      setQueue([currentTrack]);
      setQueueIndex(0);
    } else {
      orderedQueueRef.current = [];
      setQueue([]);
      setQueueIndex(0);
    }
  }, [currentTrack]);

  const removeFromQueue = useCallback(
    (trackId: number) => {
      if (mode !== 'track') return;
      const idx = queue.findIndex((t) => t.id === trackId);
      if (idx < 0) return;
      removeFromQueueAtRef.current?.(idx);
    },
    [mode, queue],
  );

  const removeFromQueueAt = useCallback(
    (index: number) => {
      if (mode !== 'track' || index < 0 || index >= queue.length) return;
      const next = queue.filter((_, i) => i !== index);
      if (!next.length) {
        // Keep playing current if it was the only item — don't empty the session.
        if (currentTrack) {
          orderedQueueRef.current = [currentTrack];
          setQueue([currentTrack]);
          setQueueIndex(0);
        } else {
          orderedQueueRef.current = [];
          setQueue([]);
          setQueueIndex(0);
        }
        return;
      }
      const currentId = currentTrack?.id;
      orderedQueueRef.current = next;
      setQueue(next);
      const idx = next.findIndex((t) => t.id === currentId);
      setQueueIndex(idx >= 0 ? idx : Math.min(index, next.length - 1));
    },
    [currentTrack, mode, queue],
  );

  const removeFromQueueAtRef = useRef(removeFromQueueAt);
  removeFromQueueAtRef.current = removeFromQueueAt;

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (mode !== 'track' || fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= queue.length || toIndex >= queue.length) return;
      const next = queue.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      orderedQueueRef.current = next;
      setQueue(next);
      const currentId = currentTrack?.id;
      const idx = next.findIndex((t) => t.id === currentId);
      setQueueIndex(idx >= 0 ? idx : 0);
    },
    [currentTrack?.id, mode, queue],
  );

  const toggleShuffle = useCallback(() => {
    setIsShuffle((prev) => {
      const next = !prev;
      isShuffleRef.current = next;
      if (mode !== 'track' || orderedQueueRef.current.length === 0) return next;
      const currentId = currentTrack?.id;
      const base = orderedQueueRef.current;
      const working = next ? shuffleArray(base) : base;
      setQueue(working);
      const idx = working.findIndex((t) => t.id === currentId);
      setQueueIndex(idx >= 0 ? idx : 0);
      return next;
    });
  }, [currentTrack?.id, mode]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      const next = prev === 'none' ? 'all' : prev === 'all' ? 'one' : 'none';
      repeatModeRef.current = next;
      return next;
    });
  }, []);

  const applySpeed = useCallback(async (speed: number) => {
    playbackSpeedRef.current = speed;
    setPlaybackSpeedState(speed);
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await sound.setRateAsync(speed, true);
    } catch {
      // ignore unsupported rates
    }
  }, []);

  const bumpSpeed = useCallback(
    async (dir: -1 | 1) => {
      const idx = SPEED_STEPS.indexOf(playbackSpeedRef.current as (typeof SPEED_STEPS)[number]);
      const cur = idx >= 0 ? idx : SPEED_STEPS.indexOf(1);
      const next = Math.max(0, Math.min(SPEED_STEPS.length - 1, cur + dir));
      await applySpeed(SPEED_STEPS[next]);
    },
    [applySpeed],
  );

  const resetSpeed = useCallback(async () => {
    await applySpeed(1);
  }, [applySpeed]);

  const toggleFavorite = useCallback(
    async (trackId: number) => {
      const isFav = favoriteIds.has(trackId);
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(trackId);
        else next.add(trackId);
        return next;
      });
      try {
        if (isFav) await removeFavorite(trackId);
        else await addFavorite(trackId);
      } catch {
        await refreshLibraryState();
      }
    },
    [favoriteIds, refreshLibraryState],
  );

  const toggleReaction = useCallback(
    async (trackId: number, reaction: ReactionValue) => {
      const current = reactions[trackId];
      const nextValue = current === reaction ? null : reaction;
      setReactions((prev) => {
        const next = { ...prev };
        if (!nextValue) delete next[trackId];
        else next[trackId] = nextValue;
        return next;
      });
      try {
        if (!nextValue) await clearTrackReaction(trackId);
        else await setTrackReaction(trackId, nextValue);
      } catch {
        await refreshLibraryState();
      }
    },
    [reactions, refreshLibraryState],
  );

  useEffect(() => {
    if (mode !== 'radio' || !radioSessionRef.current || !radioStationIdRef.current) return;
    const stationId = radioStationIdRef.current;
    const timer = setInterval(() => {
      const session = radioSessionRef.current;
      if (!session) return;
      void heartbeatRadioListenSession(stationId, session).catch(() => undefined);
    }, 30_000);
    return () => clearInterval(timer);
  }, [mode, currentStation?.id]);

  useEffect(() => {
    return () => {
      void endRadioSession();
      void unloadSound();
    };
  }, [endRadioSession, unloadSound]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      mode,
      currentTrack,
      currentStation,
      queue,
      queueIndex,
      isPlaying,
      positionMs,
      durationMs,
      quality,
      setQuality,
      isShuffle,
      repeatMode,
      playbackSpeed,
      favoriteIds,
      reactions,
      playTrack,
      playRadio,
      togglePlay,
      seekTo,
      playNext: () => playNext(false),
      playPrevious,
      stop,
      clearQueue,
      removeFromQueue,
      removeFromQueueAt,
      reorderQueue,
      toggleShuffle,
      cycleRepeat,
      setPlaybackSpeed: applySpeed,
      bumpSpeed,
      resetSpeed,
      toggleFavorite,
      toggleReaction,
      refreshLibraryState,
    }),
    [
      mode,
      currentTrack,
      currentStation,
      queue,
      queueIndex,
      isPlaying,
      positionMs,
      durationMs,
      quality,
      isShuffle,
      repeatMode,
      playbackSpeed,
      favoriteIds,
      reactions,
      playTrack,
      playRadio,
      togglePlay,
      seekTo,
      playNext,
      playPrevious,
      stop,
      clearQueue,
      removeFromQueue,
      removeFromQueueAt,
      reorderQueue,
      toggleShuffle,
      cycleRepeat,
      applySpeed,
      bumpSpeed,
      resetSpeed,
      toggleFavorite,
      toggleReaction,
      refreshLibraryState,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
