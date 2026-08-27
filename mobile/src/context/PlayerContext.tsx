import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import TrackPlayer, { Event, State } from 'react-native-track-player';
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
import { playbackRemote } from '@/services/playbackRemote';
import {
  clearPlayerSession,
  loadPlayerSession,
  savePlayerSession,
} from '@/services/playerSession';
import { ensureTrackPlayer, loadMedia, unloadMedia } from '@/services/trackPlayer';
import type { QualityLevelSetting, RadioStation, Track } from '@/types/models';
import {
  FREE_RADIO_PREVIEW_SECONDS,
  FREE_TRACK_PREVIEW_SECONDS,
} from '@/utils/constants';
import { coverUri } from '@/utils/mediaUrl';
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
  showPremiumModal: boolean;
  setShowPremiumModal: (open: boolean) => void;
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
  const radioSessionRef = useRef<string | null>(null);
  const radioStationIdRef = useRef<number | null>(null);
  const listenReportedRef = useRef(false);
  const orderedQueueRef = useRef<Track[]>([]);
  const repeatModeRef = useRef<RepeatMode>('none');
  const isShuffleRef = useRef(false);
  const playbackSpeedRef = useRef(1);
  const modeRef = useRef<PlayerMode>('idle');
  const canPlayFullRef = useRef(canPlayFull);
  const currentTrackRef = useRef<Track | null>(null);
  const previewPromptedRef = useRef(false);

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
  const [showPremiumModal, setShowPremiumModal] = useState(false);

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
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    canPlayFullRef.current = canPlayFull;
    if (canPlayFull) {
      previewPromptedRef.current = false;
      setShowPremiumModal(false);
    }
  }, [canPlayFull]);
  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    void ensureTrackPlayer().catch(() => undefined);
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

  const handleProgress = useCallback(async (positionSec: number, durationSec: number) => {
    const posMs = Math.max(0, positionSec * 1000);
    const durMs = Math.max(0, durationSec * 1000);
    setPositionMs(posMs);
    if (durMs > 0) setDurationMs(durMs);

    const modeNow = modeRef.current;
    const full = canPlayFullRef.current;
    const track = currentTrackRef.current;

    if (modeNow === 'track' && !full && posMs >= FREE_TRACK_PREVIEW_SECONDS * 1000) {
      await TrackPlayer.pause();
      await TrackPlayer.seekTo(FREE_TRACK_PREVIEW_SECONDS).catch(() => undefined);
      if (!previewPromptedRef.current) {
        previewPromptedRef.current = true;
        setShowPremiumModal(true);
      }
      return;
    }

    if (modeNow === 'radio' && !full && posMs >= FREE_RADIO_PREVIEW_SECONDS * 1000) {
      await TrackPlayer.pause();
      if (!previewPromptedRef.current) {
        previewPromptedRef.current = true;
        setShowPremiumModal(true);
      }
      return;
    }

    if (modeNow === 'track' && track && full && !listenReportedRef.current && posMs >= 30_000) {
      listenReportedRef.current = true;
      void reportTrackListenProgress(track.id, positionSec).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const subState = TrackPlayer.addEventListener(Event.PlaybackState, (e) => {
      const state = e.state;
      setIsPlaying(state === State.Playing || state === State.Buffering);
      if (state === State.Ended) {
        void playNextRef.current?.(true);
      }
    });
    const subProgress = TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (e) => {
      void handleProgress(e.position, e.duration);
    });
    const subQueueEnded = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      void playNextRef.current?.(true);
    });
    return () => {
      subState.remove();
      subProgress.remove();
      subQueueEnded.remove();
    };
  }, [handleProgress]);

  const loadUri = useCallback(
    async (
      uri: string,
      meta: { title: string; artist: string; artwork?: string; isLive?: boolean },
      shouldPlay = true,
      startPositionMs = 0,
    ) => {
      await loadMedia({
        url: uri,
        title: meta.title,
        artist: meta.artist,
        artwork: meta.artwork,
        isLive: meta.isLive,
        shouldPlay,
        startPositionMs,
        rate: playbackSpeedRef.current,
      });
      if (!shouldPlay) setIsPlaying(false);
    },
    [],
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
      previewPromptedRef.current = false;
      setMode('track');
      setCurrentStation(null);
      setCurrentTrack(track);
      setQueue(q);
      setQueueIndex(index);
      orderedQueueRef.current = q.length ? q : [track];

      const meta = {
        title: track.title || 'Track',
        artist: track.artist_name_override || track.artist_name || 'Unknown artist',
        artwork: coverUri(track.cover_art_url),
        isLive: false as const,
      };

      const downloaded = await getDownload(track.id);
      if (downloaded) {
        await loadUri(downloaded.localUri, meta, autoplay, startMs);
        return;
      }

      const preferred = canPlayFull ? quality : 'normal';
      const candidates = getStreamCandidates(track, preferred);
      let lastError: unknown;
      for (const uri of candidates) {
        try {
          await loadUri(uri, meta, autoplay, startMs);
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
      previewPromptedRef.current = false;
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

      await loadUri(
        live,
        {
          title: station.name || 'Live radio',
          artist: station.current_program_title || station.current_track_artist || 'VeriSonic Radio',
          artwork: coverUri(station.cover_art_url),
          isLive: true,
        },
        autoplay,
        0,
      );

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
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
        return;
      }

      const atEnd = queueIndex >= queue.length - 1;
      if (atEnd && repeatModeRef.current === 'none' && fromNaturalEnd) {
        await TrackPlayer.pause();
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

  const playPrevious = useCallback(async () => {
    if (mode !== 'track' || queue.length === 0) return;
    if (positionMs > 3000) {
      await TrackPlayer.seekTo(0);
      return;
    }
    const prev = (queueIndex - 1 + queue.length) % queue.length;
    await playTrackAt(queue[prev], queue, prev);
  }, [mode, playTrackAt, positionMs, queue, queueIndex]);

  const playPreviousRef = useRef(playPrevious);
  playPreviousRef.current = playPrevious;

  useEffect(() => {
    const offNext = playbackRemote.on('next', () => {
      void playNextRef.current?.(false);
    });
    const offPrev = playbackRemote.on('previous', () => {
      void playPreviousRef.current?.();
    });
    const offStop = playbackRemote.on('stop', () => {
      void stopRef.current?.();
    });
    return () => {
      offNext();
      offPrev();
      offStop();
    };
  }, []);

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

  const ensureLoaded = useCallback(async () => {
    try {
      await ensureTrackPlayer();
      const active = await TrackPlayer.getActiveTrack();
      if (active) return true;
    } catch {
      // fall through and reload
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
    const state = await TrackPlayer.getPlaybackState();
    const playing = state.state === State.Playing || state.state === State.Buffering;
    if (playing) {
      await TrackPlayer.pause();
    } else {
      if (mode === 'track' && !canPlayFull && positionMs >= FREE_TRACK_PREVIEW_SECONDS * 1000) {
        setShowPremiumModal(true);
        return;
      }
      if (mode === 'radio' && !canPlayFull && positionMs >= FREE_RADIO_PREVIEW_SECONDS * 1000) {
        setShowPremiumModal(true);
        return;
      }
      await TrackPlayer.play();
    }
  }, [canPlayFull, ensureLoaded, mode, positionMs]);

  const seekTo = useCallback(
    async (ms: number) => {
      if (mode !== 'track') return;
      const max = canPlayFull ? durationMs : FREE_TRACK_PREVIEW_SECONDS * 1000;
      const clamped = Math.max(0, Math.min(ms, max || ms));
      await ensureLoaded();
      await TrackPlayer.seekTo(clamped / 1000);
      setPositionMs(clamped);
    },
    [canPlayFull, durationMs, ensureLoaded, mode],
  );

  const stop = useCallback(async () => {
    await endRadioSession();
    await unloadMedia();
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
  }, [endRadioSession]);

  const stopRef = useRef(stop);
  stopRef.current = stop;

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
    try {
      await ensureTrackPlayer();
      await TrackPlayer.setRate(speed);
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
      void unloadMedia();
    };
  }, [endRadioSession]);

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
      showPremiumModal,
      setShowPremiumModal,
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
      showPremiumModal,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
}
