import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import Hls from 'hls.js';
import {
  describeStreamPath,
  getEffectiveQuality,
  getStreamCandidatesForQuality,
  loadStoredQuality,
  saveStoredQuality,
  isStudioMasterQuality,
  QUALITY_LABELS,
  type QualityLevelSetting,
} from '../utils/streamQuality';
import { parseStoredStreamQuality } from '../utils/userSettings';
import { showError } from '../utils/swal';
import {
  applyAudioSinkId,
  enumerateAudioOutputDevices,
  loadStoredOutputDeviceId,
  saveStoredOutputDeviceId,
  supportsAudioOutputSelection,
  supportsSelectAudioOutput,
  type AudioOutputDeviceInfo,
} from '../utils/audioOutputDevices';

export interface Track {
  id: number;
  title: string;
  artist_name: string;
  artist_name_override?: string;
  album_title?: string;
  cover_art_url?: string;
  stream_url?: string;
  hls_playlist_path?: string;
  mp3_320_path?: string;
  aac_256_path?: string;
  aac_128_path?: string;
  original_file_path?: string;
  duration: number;
  sample_rate?: number;
  bit_depth?: number;
  quality_score?: number;
  quality_level?: string;
  file_format?: string;
  approved?: boolean;
  lyrics?: string;
  composer?: string;
  lyricist?: string;
  year?: number;
  language?: string;
  genres?: string[];
}

export interface RadioStation {
  id: number;
  name: string;
  description?: string;
  cover_art_url?: string;
  stream_url: string;
  current_track_title?: string;
  current_track_artist?: string;
  listeners_count?: number;
  category?: string;
  owner_id?: number;
  stream_key?: string;
  is_online?: boolean;
  is_active?: boolean;
  current_program_title?: string;
  rj_name?: string;
  licence?: string;
  street_address?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  broadcast_frequency?: string;
  languages?: string;
  social_twitter?: string;
  social_instagram?: string;
  programs_list?: string;
  timezone?: string;
}

type RepeatMode = 'none' | 'all' | 'one';

interface AudioContextType {
  currentTrack: Track | null;
  activeRadioStation: RadioStation | null;
  isPlaying: boolean;
  duration: number;
  currentTime: number;
  volume: number;
  isMuted: boolean;
  isRadioSync: boolean;
  playbackSpeed: number;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  favorites: number[];
  playQueue: Track[];
  currentQueueIndex: number;
  showPremiumModal: boolean;
  equalizerBars: number[];
  qualityLevelSetting: QualityLevelSetting;
  activeStreamLabel: string | null;
  analyser: AnalyserNode | null;
  outputDevices: AudioOutputDeviceInfo[];
  selectedOutputDeviceId: string;
  outputDeviceSupported: boolean;
  outputDevicesLoading: boolean;

  playTrack: (track: Track, isRadio?: boolean, autoPlay?: boolean) => void | Promise<void>;
  playRadioStation: (station: RadioStation) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  adjustVolume: (vol: number) => void;
  toggleMute: () => void;
  setPlaybackSpeed: (speed: number) => void;
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;
  toggleFavorite: (trackId: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (trackId: number) => void;
  clearQueue: () => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  setShowPremiumModal: (show: boolean) => void;
  setQualityLevelSetting: (quality: QualityLevelSetting) => void;
  updateTrackMetadata: (track: Track) => void;
  refreshOutputDevices: () => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  promptSelectOutputDevice: () => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

const API_URL = '/api';

export type { QualityLevelSetting } from '../utils/streamQuality';
export { QUALITY_LABELS } from '../utils/streamQuality';

const resolveStreamUrl = (url?: string): string => {
  if (!url) return "";
  if (url.startsWith("/api/")) return url;
  return url.replace("http://localhost/storage", `${window.location.protocol}//${window.location.host}/storage`);
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isPremium, canConfigureStreamQuality, userMode, currentUser, updateStreamQuality } = useAuth();

  // State variables
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [activeRadioStation, setActiveRadioStation] = useState<RadioStation | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isRadioSync, setIsRadioSync] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('none');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [playQueue, setPlayQueue] = useState<Track[]>([]);
  const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(-1);
  const [showPremiumModal, setShowPremiumModal] = useState<boolean>(false);
  const [qualityLevelSetting, setQualityLevelSettingState] = useState<QualityLevelSetting>(() => {
    return loadStoredQuality(null) ?? 'normal';
  });
  const [activeStreamLabel, setActiveStreamLabel] = useState<string | null>(null);
  const [outputDevices, setOutputDevices] = useState<AudioOutputDeviceInfo[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>(
    () => loadStoredOutputDeviceId(null) ?? '',
  );
  const [outputDeviceSupported] = useState(() => supportsAudioOutputSelection());
  const [outputDevicesLoading, setOutputDevicesLoading] = useState(false);
  const selectedOutputDeviceIdRef = useRef(selectedOutputDeviceId);
  const qualityLevelSettingRef = useRef<QualityLevelSetting>('normal');
  const pendingSeekRef = useRef<number | null>(null);
  const currentTimeRef = useRef(0);
  const applyQualityChangeRef = useRef<(quality: QualityLevelSetting) => void>(() => {});
  const playTrackRef = useRef<(track: Track, isRadio?: boolean, autoPlay?: boolean) => void | Promise<void>>(async () => {});
  const [equalizerBars, setEqualizerBars] = useState<number[]>(new Array(20).fill(0));
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // Refs for HTMLAudioElement & HLS
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const webrtcPCRef = useRef<RTCPeerConnection | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const previewTimerRef = useRef<any>(null);
  const equalizerIntervalRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const hasSyncedLiveHeadRef = useRef(false);
  const fadeIntervalRef = useRef<any>(null);

  // Track speed state in ref to avoid stale closure in audio event handlers
  const playbackSpeedRef = useRef<number>(1.0);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Keep latest state refs to avoid stale closures in audio event handlers
  const currentTrackRef = useRef(currentTrack);
  const isPremiumRef = useRef(isPremium);
  const canConfigureStreamQualityRef = useRef(canConfigureStreamQuality);
  const activeRadioStationRef = useRef(activeRadioStation);
  const isPlayingRef = useRef(isPlaying);
  const repeatModeRef = useRef(repeatMode);
  const playQueueRef = useRef(playQueue);
  const currentQueueIndexRef = useRef(currentQueueIndex);
  const isShuffleRef = useRef(isShuffle);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);
  // Tracks whether the user EXPLICITLY pressed pause (vs browser-initiated background pause)
  const userPausedRef = useRef(false);
  const playbackEpochRef = useRef(0);
  const ownedBlobUrlRef = useRef<string | null>(null);

  const resetAudioElementForNewSource = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();

    if (hlsRef.current) {
      hlsRef.current.stopLoad();
      hlsRef.current.detachMedia();
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (ownedBlobUrlRef.current) {
      URL.revokeObjectURL(ownedBlobUrlRef.current);
      ownedBlobUrlRef.current = null;
    }

    try {
      const src = audio.currentSrc || audio.src;
      if (src.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    } catch {
      // Blob may already be revoked by hls.js / MSE teardown.
    }

    audio.removeAttribute('src');
    audio.src = '';
    audio.srcObject = null;
    audio.load();
  };

  const stopAllPlayback = () => {
    playbackEpochRef.current += 1;
    userPausedRef.current = true;
    isPlayingRef.current = false;

    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    resetAudioElementForNewSource();
    if (webrtcPCRef.current) {
      webrtcPCRef.current.close();
      webrtcPCRef.current = null;
    }
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
      navigator.mediaSession.metadata = null;
    }

    setIsPlaying(false);
    setCurrentTrack(null);
    setActiveRadioStation(null);
    setIsRadioSync(false);
    setCurrentTime(0);
    setDuration(0);
    setPlayQueue([]);
    setCurrentQueueIndex(-1);
    setActiveStreamLabel(null);
  };

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);
  useEffect(() => { canConfigureStreamQualityRef.current = canConfigureStreamQuality; }, [canConfigureStreamQuality]);
  useEffect(() => { qualityLevelSettingRef.current = qualityLevelSetting; }, [qualityLevelSetting]);

  useEffect(() => {
    if (token && currentUser) {
      const fromDb = parseStoredStreamQuality(currentUser.stream_quality ?? null);
      if (fromDb) {
        setQualityLevelSettingState(fromDb);
        qualityLevelSettingRef.current = fromDb;
        return;
      }
      if (canConfigureStreamQuality && currentUser.stream_quality == null) {
        setQualityLevelSettingState('lossless');
        qualityLevelSettingRef.current = 'lossless';
        void updateStreamQuality('lossless');
        return;
      }
      setQualityLevelSettingState('normal');
      qualityLevelSettingRef.current = 'normal';
      return;
    }

    const stored = loadStoredQuality(null);
    if (stored) {
      setQualityLevelSettingState(stored);
      qualityLevelSettingRef.current = stored;
      return;
    }

    setQualityLevelSettingState('normal');
    qualityLevelSettingRef.current = 'normal';
  }, [token, currentUser?.id, currentUser?.stream_quality, canConfigureStreamQuality, updateStreamQuality]);

  const setQualityLevelSetting = (quality: QualityLevelSetting) => {
    applyQualityChangeRef.current(quality);
  };

  useEffect(() => {
    selectedOutputDeviceIdRef.current = selectedOutputDeviceId;
  }, [selectedOutputDeviceId]);

  useEffect(() => {
    const stored = loadStoredOutputDeviceId(currentUser?.id ?? null);
    if (stored !== null) {
      setSelectedOutputDeviceId(stored);
      selectedOutputDeviceIdRef.current = stored;
    }
  }, [currentUser?.id]);

  const applySelectedOutputDevice = useCallback(async (deviceId?: string) => {
    const audio = audioRef.current;
    if (!audio || !outputDeviceSupported) return false;
    return applyAudioSinkId(audio, deviceId ?? selectedOutputDeviceIdRef.current);
  }, [outputDeviceSupported]);

  const refreshOutputDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setOutputDevices([]);
      return;
    }

    setOutputDevicesLoading(true);
    try {
      const devices = await enumerateAudioOutputDevices();
      setOutputDevices(devices);
    } finally {
      setOutputDevicesLoading(false);
    }
  }, []);

  const setOutputDevice = useCallback(async (deviceId: string) => {
    if (!outputDeviceSupported) return;

    const applied = await applySelectedOutputDevice(deviceId);
    if (!applied) {
      showError('Output Device', 'Could not switch to that device. It may have been disconnected.');
      await refreshOutputDevices();
      return;
    }

    setSelectedOutputDeviceId(deviceId);
    selectedOutputDeviceIdRef.current = deviceId;
    saveStoredOutputDeviceId(deviceId, currentUser?.id ?? null);
  }, [applySelectedOutputDevice, currentUser?.id, outputDeviceSupported, refreshOutputDevices]);

  const promptSelectOutputDevice = useCallback(async () => {
    if (!supportsSelectAudioOutput()) return;

    try {
      const device = await (
        navigator.mediaDevices as MediaDevices & { selectAudioOutput: () => Promise<MediaDeviceInfo> }
      ).selectAudioOutput();
      await setOutputDevice(device.deviceId);
      await refreshOutputDevices();
    } catch {
      // User dismissed the browser picker.
    }
  }, [refreshOutputDevices, setOutputDevice]);

  useEffect(() => {
    if (!outputDeviceSupported) return;

    void refreshOutputDevices();

    const handleDeviceChange = () => {
      void refreshOutputDevices();
    };

    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
  }, [outputDeviceSupported, refreshOutputDevices]);

  useEffect(() => {
    if (!outputDeviceSupported) return;
    void applySelectedOutputDevice(selectedOutputDeviceId);
  }, [applySelectedOutputDevice, outputDeviceSupported, selectedOutputDeviceId]);

  useEffect(() => { activeRadioStationRef.current = activeRadioStation; }, [activeRadioStation]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { playQueueRef.current = playQueue; }, [playQueue]);
  useEffect(() => { currentQueueIndexRef.current = currentQueueIndex; }, [currentQueueIndex]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    setFavorites([]);
    if (!token) {
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${API_URL}/favorites`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const tracks = await res.json();
          setFavorites(tracks.map((t: Track) => t.id));
        }
      } catch (e) {
        console.warn('Failed to load favorites:', e);
      }
    })();
  }, [token]);

  const fadeVolume = (targetVolume: number, durationMs: number): Promise<void> => {
    return new Promise((resolve) => {
      if (!audioRef.current) {
        resolve();
        return;
      }

      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }

      const audio = audioRef.current;
      const startVolume = audio.volume;
      const volumeDiff = targetVolume - startVolume;
      if (Math.abs(volumeDiff) < 0.01) {
        audio.volume = targetVolume;
        resolve();
        return;
      }

      const stepTime = 16;
      const steps = durationMs / stepTime;
      const volumeStep = volumeDiff / steps;
      let currentStep = 0;

      fadeIntervalRef.current = setInterval(() => {
        currentStep++;
        const nextVolume = startVolume + (volumeStep * currentStep);
        audio.volume = Math.max(0, Math.min(1, nextVolume));

        if (currentStep >= steps || Math.abs(audio.volume - targetVolume) < 0.01) {
          audio.volume = targetVolume;
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = null;
          resolve();
        }
      }, stepTime);
    });
  };

  // Stop playback and reset audio states when user logs out
  useEffect(() => {
    if (!token) {
      stopAllPlayback();
    }
  }, [token]);

  // Stop library music/other stations playback when switching to Admin Mode
  useEffect(() => {
    if (userMode === 'admin' && currentUser && ['radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role)) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsPlaying(false);
      setCurrentTrack(null);
      setActiveRadioStation(null);
      setIsRadioSync(false);
    }
  }, [userMode, currentUser]);

  // Initialize Audio Object
  useEffect(() => {
    const audio = new Audio();
    // Required for iOS Safari to allow background audio playback
    audio.setAttribute('playsinline', 'true');
    (audio as any).playsInline = true;
    audioRef.current = audio;

    if (outputDeviceSupported) {
      void applyAudioSinkId(audio, selectedOutputDeviceIdRef.current);
    }

    const onPlay = () => {
      setIsPlaying(true);
      audio.playbackRate = playbackSpeedRef.current;
      const track = currentTrackRef.current;
      if (track && token && !activeRadioStationRef.current && track.id < 100000) {
        fetch(`${API_URL}/music/${track.id}/play`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => {});
      }
      // Tell Chrome Android this page is actively playing media — required for background audio
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    };
    const onPause = () => {
      // If the page is hidden (background/minimize/lock) AND the user did NOT explicitly pause,
      // Chrome is pausing our audio — immediately try to resume it
      if (document.hidden && !userPausedRef.current) {
        setTimeout(() => {
          if (audioRef.current?.paused && !userPausedRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }, 200);
        return; // Don't update isPlaying state — we intend to keep playing
      }
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    };
    const onTimeUpdate = () => {
      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);
      // Update Chrome's notification seek bar position
      if ('mediaSession' in navigator && !activeRadioStationRef.current && audio.duration && isFinite(audio.duration)) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime,
          });
        } catch (_) {}
      }

      // Eliminate browser buffering latency on live broadcasts by catching up to the live edge
      if (activeRadioStationRef.current && !audio.paused && audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);

        // Initial skip of the server-side history buffer to play the absolute live head instantly
        if (!hasSyncedLiveHeadRef.current) {
          hasSyncedLiveHeadRef.current = true;
          audio.currentTime = Math.max(0, bufferedEnd - 0.2);
          console.log("Synced initial playhead to live edge:", audio.currentTime);
          return;
        }
      }

      // Enforce guest limits here
      if (!isPremiumRef.current) {
        if (activeRadioStationRef.current && audio.currentTime >= 60) {
          // Live radio limit of 1 minute
          handleLimitReached();
        } else if (!activeRadioStationRef.current && audio.currentTime >= 30) {
          // Standard track limit of 30 seconds
          handleLimitReached();
        }
      }
    };
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onEnded = () => handleTrackEnded();
    const onRateChange = () => {
      if (audio.playbackRate !== playbackSpeedRef.current) {
        audio.playbackRate = playbackSpeedRef.current;
      }
    };
    const onError = () => {
      // Ignore errors if we are currently playing via WebRTC (srcObject is active)
      if (audioRef.current && audioRef.current.srcObject) {
        console.log("Ignoring audio error because WebRTC srcObject is active");
        return;
      }
      // Also ignore errors if we explicitly paused/stopped the stream (isPlaying is false)
      if (!isPlayingRef.current) {
        console.log("Ignoring audio error because stream was explicitly unloaded");
        return;
      }
      if (activeRadioStationRef.current) {
        setIsPlaying(false);
        setActiveRadioStation(null);
        setIsRadioSync(false);
      }
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('ratechange', onRateChange);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('ratechange', onRateChange);
      audio.removeEventListener('error', onError);
      audio.pause();
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      if (webrtcPCRef.current) {
        webrtcPCRef.current.close();
        webrtcPCRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
    };
  }, []);

  // Wire up MediaSession custom events to actual playPrevious / playNext functions
  useEffect(() => {
    const handlePrev = () => playPrevious();
    const handleNext = () => playNext();
    window.addEventListener('mediasession:previous', handlePrev);
    window.addEventListener('mediasession:next', handleNext);
    return () => {
      window.removeEventListener('mediasession:previous', handlePrev);
      window.removeEventListener('mediasession:next', handleNext);
    };
  }, []);

  // Auto-resume audio when user returns to page after browser suspends it in background
  useEffect(() => {
    let wasPlayingBeforeHide = false;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Record whether audio was actively playing when page went hidden
        wasPlayingBeforeHide = isPlayingRef.current && !audioRef.current?.paused;
      } else {
        // Page is visible again — if we were playing before, try to resume
        if (wasPlayingBeforeHide && audioRef.current?.paused) {
          audioRef.current.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Real VU meter — driven by Web Audio API AnalyserNode
  useEffect(() => {
    const NUM_BARS = 20;

    const stopAnalyser = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setEqualizerBars(new Array(NUM_BARS).fill(0));
    };

    if (!isPlaying) {
      stopAnalyser();
      return;
    }

    const audio = audioRef.current;
    if (!audio) { stopAnalyser(); return; }

    // Lazily create AudioContext + analyser once
    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported:', e);
        stopAnalyser();
        return;
      }
    }

    const ctx = audioCtxRef.current;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }

    // Create analyser only once per audio element
    if (!analyserRef.current) {
      try {
        const source = ctx.createMediaElementSource(audio);
        const analyserNode = ctx.createAnalyser();
        analyserNode.fftSize = 4096; // High resolution FFT Size
        analyserNode.smoothingTimeConstant = 0.85;
        analyserNode.minDecibels = -95;
        analyserNode.maxDecibels = -15;
        source.connect(analyserNode);
        analyserNode.connect(ctx.destination);
        analyserRef.current = analyserNode;
        setAnalyser(analyserNode);
      } catch (e) {
        // CORS or already-connected element — fall back to random
        console.warn('AnalyserNode setup failed (likely CORS on radio stream):', e);
        equalizerIntervalRef.current = setInterval(() => {
          setEqualizerBars(prev => prev.map(() => Math.floor(Math.random() * 80) + 10));
        }, 120);
        return () => {
          if (equalizerIntervalRef.current) clearInterval(equalizerIntervalRef.current);
          setEqualizerBars(new Array(NUM_BARS).fill(0));
        };
      }
    }

    const analyser = analyserRef.current;
    const dataArray = new Float32Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getFloatFrequencyData(dataArray);

      // Map frequency bins to 20 bands logarithmically like the broadcaster
      const maxBin = Math.min(150, dataArray.length);
      const logIndices = new Array(NUM_BARS + 1);
      const minLog = Math.log10(1);
      const maxLog = Math.log10(maxBin || 1);
      const logRange = maxLog - minLog;

      for (let i = 0; i <= NUM_BARS; i++) {
        logIndices[i] = Math.round(Math.pow(10, minLog + (i / NUM_BARS) * logRange));
      }

      const bars = new Array(NUM_BARS);
      for (let i = 0; i < NUM_BARS; i++) {
        const startIdx = logIndices[i];
        const endIdx = Math.max(startIdx + 1, logIndices[i + 1]);

        // Average the db value in the bin range
        let sum = 0;
        let count = 0;
        for (let j = startIdx; j < endIdx && j < dataArray.length; j++) {
          sum += dataArray[j];
          count++;
        }
        const avgDb = count > 0 ? sum / count : -100;

        // High frequency treble boost (boost = 1.0 + i/20 * 5.0)
        // Since db scale is logarithmic, amp * boost => db + 20 * log10(boost)
        const boost = 1.0 + (i / NUM_BARS) * 5.0;
        const boostedDb = avgDb + (20 * Math.log10(boost));

        // Map decibels (-50dB to -5dB) to level scale (0 to 100)
        // val = (boostedDb + 50) / 45 * 100
        const level = Math.max(0, Math.min(100, Math.round(((boostedDb + 50) / 45) * 100)));
        bars[i] = level;
      }

      setEqualizerBars(bars);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => { stopAnalyser(); };
  }, [isPlaying]);

  const handleLimitReached = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setShowPremiumModal(true);
  };

  const handleTrackEnded = () => {
    if (repeatModeRef.current === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => { });
      }
    } else {
      const queue = playQueueRef.current;
      if (queue.length === 0 || currentQueueIndexRef.current >= queue.length - 1) {
        setIsPlaying(false);
        if (activeRadioStationRef.current) {
          setActiveRadioStation(null);
          setIsRadioSync(false);
        }
      } else {
        playNext();
      }
    }
  };

  const playTrack = async (track: Track, isRadio = false, autoPlay = true) => {
    if (!audioRef.current) return;
    const epoch = playbackEpochRef.current;
    const resumePosition = pendingSeekRef.current;
    pendingSeekRef.current = null;

    if (isRadio) {
      hasSyncedLiveHeadRef.current = false;
    }

    if (currentUser && currentUser.role === 'radio_admin' && !isRadio) {
      console.warn("Radio admins cannot play standard library music tracks.");
      return;
    }

    if (webrtcPCRef.current) {
      webrtcPCRef.current.close();
      webrtcPCRef.current = null;
    }
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    resetAudioElementForNewSource();

    // Clear live radio station status if playing normal track
    if (!isRadio) {
      setActiveRadioStation(null);
      setIsRadioSync(false);
    }

    let trackToPlay = track;
    // Only re-fetch metadata for real music library tracks, not virtual live-radio tracks
    if (!isRadio) {
      try {
        const res = await fetch(`${API_URL}/music/${track.id}`);
        if (res.ok) {
          trackToPlay = await res.json();
        }
      } catch (e) {
        console.warn("Failed to fetch fresh metadata, playing with local cache:", e);
      }
    }

    if (epoch !== playbackEpochRef.current) return;

    // Determine stream candidates from quality preference and subscription tier
    const candidates = isRadio
      ? [trackToPlay.stream_url || trackToPlay.hls_playlist_path || ''].filter(Boolean)
      : getStreamCandidatesForQuality(
          trackToPlay,
          getEffectiveQuality(qualityLevelSettingRef.current, canConfigureStreamQualityRef.current),
          isPremiumRef.current,
          token,
        );

    if (!isRadio && candidates.length === 0) {
      const effectiveQuality = getEffectiveQuality(
        qualityLevelSettingRef.current,
        canConfigureStreamQualityRef.current,
      );
      if (isPremiumRef.current && isStudioMasterQuality(effectiveQuality)) {
        showError(
          'Studio Master Unavailable',
          token
            ? 'The original lossless file is not available for this track yet.'
            : 'Sign in to stream the original studio master file.',
        );
      } else {
        showError(
          'Stream Unavailable',
          isPremiumRef.current
            ? 'No audio file is available for the selected quality tier yet. The track may still be transcoding.'
            : 'Preview stream is not ready yet. Please try again shortly.',
        );
      }
      return;
    }

    const seekAfterLoad = resumePosition;
    let seekRestoreCleanup: (() => void) | null = null;
    const shouldRestorePosition =
      seekAfterLoad !== null && Number.isFinite(seekAfterLoad) && seekAfterLoad > 0.25;

    const beginPlayback = () => {
      if (epoch !== playbackEpochRef.current || !audioRef.current) return;
      audioRef.current.playbackRate = playbackSpeedRef.current;
      audioRef.current.volume = 0;
      audioRef.current
        .play()
        .then(() => {
          const target = isMutedRef.current ? 0 : volumeRef.current;
          fadeVolume(target, 300);
        })
        .catch((e) => console.log('Autoplay blocked: ', e));
      userPausedRef.current = false;
      setIsPlaying(true);
    };

    const restorePlaybackPosition = (isHls = false): Promise<void> => {
      return new Promise((resolve) => {
        seekRestoreCleanup?.();
        seekRestoreCleanup = null;

        if (!shouldRestorePosition || !audioRef.current) {
          resolve();
          return;
        }

        const audio = audioRef.current;
        const target = seekAfterLoad as number;
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          setCurrentTime(audio.currentTime);
          resolve();
        };

        const seekToTarget = (): boolean => {
          if (!audioRef.current) return true;
          const maxTime =
            audio.duration && Number.isFinite(audio.duration) ? audio.duration : target;
          const seekTo = Math.min(target, maxTime);
          if (Math.abs(audio.currentTime - seekTo) > 0.35) {
            try {
              audio.currentTime = seekTo;
            } catch {
              return false;
            }
          }
          return Math.abs(audio.currentTime - seekTo) <= 0.75;
        };

        const cleanup = () => {
          seekEvents.forEach((event) => audio.removeEventListener(event, onMediaEvent));
          hlsRef.current?.off(Hls.Events.FRAG_BUFFERED, onHlsBuffered);
          hlsRef.current?.off(Hls.Events.LEVEL_LOADED, onHlsBuffered);
          clearTimeout(timeoutId);
          if (seekRestoreCleanup === cleanup) {
            seekRestoreCleanup = null;
          }
        };

        const onMediaEvent = () => {
          if (seekToTarget()) finish();
        };

        const onHlsBuffered = () => {
          if (seekToTarget()) finish();
        };

        const seekEvents = ['loadedmetadata', 'canplay', 'canplaythrough', 'durationchange', 'seeked'] as const;
        seekEvents.forEach((event) => audio.addEventListener(event, onMediaEvent));

        if (isHls && hlsRef.current) {
          const hls = hlsRef.current;
          hls.on(Hls.Events.FRAG_BUFFERED, onHlsBuffered);
          hls.on(Hls.Events.LEVEL_LOADED, onHlsBuffered);
          hls.stopLoad();
          hls.startLoad(target);
        }

        const timeoutId = setTimeout(() => {
          if (isHls && hlsRef.current) {
            hlsRef.current.startLoad(target);
          }
          seekToTarget();
          finish();
        }, isHls ? 15000 : 3000);

        seekRestoreCleanup = cleanup;
        seekToTarget();
      });
    };

    const onStreamReady = (isHls = false) => {
      void restorePlaybackPosition(isHls).then(() => {
        if (shouldRestorePosition && audioRef.current) {
          const target = seekAfterLoad as number;
          if (Math.abs(audioRef.current.currentTime - target) > 1) {
            try {
              audioRef.current.currentTime = Math.min(
                target,
                audioRef.current.duration && Number.isFinite(audioRef.current.duration)
                  ? audioRef.current.duration
                  : target,
              );
              setCurrentTime(audioRef.current.currentTime);
            } catch {
              console.warn('Could not restore playback position after stream reload.');
            }
          }
        }
        if (autoPlay) {
          beginPlayback();
        } else if (audioRef.current) {
          audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
          userPausedRef.current = true;
          isPlayingRef.current = false;
          setIsPlaying(false);
        }
      });
    };

    const tryCandidate = (index: number) => {
      if (!audioRef.current) return;

      if (index >= candidates.length) {
        if (!isRadio) {
          showError('Playback Error', 'Could not load audio for the selected quality tier.');
        }
        return;
      }

      const streamPath = candidates[index];
      let streamUrl = resolveStreamUrl(streamPath);
      if (!streamUrl) {
        tryCandidate(index + 1);
        return;
      }

      if (isRadio) {
        const separator = streamUrl.includes('?') ? '&' : '?';
        streamUrl = `${streamUrl}${separator}nocache=${Date.now()}`;
      }

      setActiveStreamLabel(
        isRadio ? 'Live stream' : describeStreamPath(streamPath, trackToPlay),
      );
      console.log(`Loading stream candidate ${index + 1}/${candidates.length}:`, streamUrl);

      seekRestoreCleanup?.();
      seekRestoreCleanup = null;
      resetAudioElementForNewSource();

      if (streamUrl.includes('.m3u8')) {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(audioRef.current);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (shouldRestorePosition && seekAfterLoad !== null && hlsRef.current) {
              hlsRef.current.stopLoad();
              hlsRef.current.startLoad(seekAfterLoad);
            }
            onStreamReady(true);
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            console.warn('HLS fatal error, trying next quality candidate:', data);
            seekRestoreCleanup?.();
            seekRestoreCleanup = null;
            hls.destroy();
            hlsRef.current = null;
            tryCandidate(index + 1);
          });
        } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          const audio = audioRef.current;
          const onNativeError = () => {
            audio.removeEventListener('error', onNativeError);
            tryCandidate(index + 1);
          };
          audio.addEventListener('error', onNativeError);
          audio.src = streamUrl;
          audio.load();
          audio.addEventListener(
            'loadedmetadata',
            () => {
              audio.removeEventListener('error', onNativeError);
              onStreamReady(true);
            },
            { once: true }
          );
        } else {
          tryCandidate(index + 1);
        }
        return;
      }

      const audio = audioRef.current;
      const onDirectError = () => {
        audio.removeEventListener('error', onDirectError);
        console.warn('Direct stream failed, trying next quality candidate');
        tryCandidate(index + 1);
      };
      audio.addEventListener('error', onDirectError);
      audio.src = streamUrl;
      audio.load();
      audio.addEventListener(
        'loadedmetadata',
        () => {
          audio.removeEventListener('error', onDirectError);
          onStreamReady(false);
        },
        { once: true }
      );
    };

    // Reset details
    setCurrentTrack(trackToPlay);
    setCurrentTime(seekAfterLoad ?? 0);
    setDuration(trackToPlay.duration || 0);

    // Register MediaSession API for lock screen / notification media controls on mobile
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: trackToPlay.title || 'Unknown Track',
        artist: trackToPlay.artist_name || 'Unknown Artist',
        album: trackToPlay.album_title || '',
        artwork: trackToPlay.cover_art_url
          ? [{ src: trackToPlay.cover_art_url, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
      navigator.mediaSession.setActionHandler('play', () => {
        audioRef.current?.play();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        audioRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        window.dispatchEvent(new CustomEvent('mediasession:previous'));
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        window.dispatchEvent(new CustomEvent('mediasession:next'));
      });
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (audioRef.current && details.seekTime !== undefined) {
          audioRef.current.currentTime = details.seekTime;
        }
      });
    }

    tryCandidate(0);
  };

  playTrackRef.current = playTrack;

  applyQualityChangeRef.current = (quality: QualityLevelSetting) => {
    if (!canConfigureStreamQualityRef.current && quality !== 'normal') {
      return;
    }
    if (qualityLevelSettingRef.current === quality) {
      return;
    }

    const track = currentTrackRef.current;
    const wasPlaying = isPlayingRef.current && !(audioRef.current?.paused ?? true);
    const positionBeforeSave = Math.max(
      audioRef.current?.currentTime ?? 0,
      currentTimeRef.current,
    );

    void (async () => {
      if (token && currentUser) {
        const ok = await updateStreamQuality(quality);
        if (!ok) return;
      } else {
        saveStoredQuality(quality, null);
      }

      setQualityLevelSettingState(quality);
      qualityLevelSettingRef.current = quality;

      if (track && !activeRadioStationRef.current) {
        const positionAfterSave = Math.max(
          audioRef.current?.currentTime ?? 0,
          currentTimeRef.current,
          positionBeforeSave,
        );
        pendingSeekRef.current = positionAfterSave >= 0.25 ? positionAfterSave : null;
        void playTrackRef.current(track, false, wasPlaying);
      }
    })();
  };

  const playRadioStation = async (station: RadioStation, isResume = false) => {
    const epoch = playbackEpochRef.current;

    if (currentUser && currentUser.role === 'radio_admin' && station.owner_id !== currentUser.id) {
      console.warn("Radio admins cannot play other radio stations.");
      showError("Access Denied", "You are not authorized to tune in to this station.");
      return;
    }

    if (station.is_online === false) {
      showError("Station Offline", "This radio station is currently offline.");
      return;
    }

    setActiveRadioStation(station);
    setIsRadioSync(true);
    setCurrentTrack(null);

    // Register MediaSession for lock screen / notification controls on mobile
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: station.current_track_title || station.name || 'Live Radio',
        artist: station.current_track_artist || station.rj_name || '',
        album: station.name || '',
        artwork: station.cover_art_url
          ? [{ src: station.cover_art_url, sizes: '512x512', type: 'image/jpeg' }]
          : [],
      });
      navigator.mediaSession.setActionHandler('play', () => { audioRef.current?.play(); });
      navigator.mediaSession.setActionHandler('pause', () => { audioRef.current?.pause(); });
      navigator.mediaSession.setActionHandler('stop', () => { audioRef.current?.pause(); });
    }

    if (webrtcPCRef.current) {
      webrtcPCRef.current.close();
      webrtcPCRef.current = null;
    }
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }

    // Fetch synchronized live track metadata from backend radio syncer
    try {
      const res = await fetch(`${API_URL}/radio/${station.id}/stream`);
      if (res.ok) {
        const data = await res.json();

        const virtualTrack: Track = {
          id: data.track_id || (station.id * 100),
          title: data.title || data.track_title || station.current_track_title || "Synchronized Broadcast",
          artist_name: data.artist || station.current_track_artist || station.name,
          duration: data.duration !== null && data.duration !== undefined ? data.duration : 0,
          stream_url: data.stream_url || station.stream_url
        };

        if (data.is_websocket) {
          let fallbackTimeout: any = null;
          let isWsConnected = false;

          const startProgressiveFallback = () => {
            if (isWsConnected || epoch !== playbackEpochRef.current) return;
            console.log("WebSocket connection timed out or failed, falling back to progressive HTTP stream");
            playTrack(virtualTrack, true);
          };

          // If WS connection takes more than 800ms to open, fall back to progressive HTTP stream
          fallbackTimeout = setTimeout(startProgressiveFallback, 800);

          const upgradeToWebSocketStream = () => {
            try {
              const wsBase = API_URL.startsWith('https')
                ? API_URL.replace('https://', 'wss://')
                : API_URL.replace('http://', 'ws://');

              const wsUrl = `${wsBase}/radio/${station.id}/stream/ws/listener`;
              const ws = new WebSocket(wsUrl);
              websocketRef.current = ws;

              const mediaSource = new MediaSource();
              let sourceBuffer: SourceBuffer | null = null;
              let queue: Uint8Array[] = [];
              let hasStartedPlaying = false;

              const appendNext = () => {
                if (queue.length > 0 && sourceBuffer && !sourceBuffer.updating) {
                  const chunk = queue.shift();
                  if (chunk) {
                    try {
                      sourceBuffer.appendBuffer(chunk as any);
                    } catch (e) {
                      console.error('Error appending chunk to SourceBuffer:', e);
                    }
                  }
                }
              };

              mediaSource.addEventListener('sourceopen', () => {
                try {
                  sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
                  sourceBuffer.addEventListener('updateend', () => {
                    appendNext();

                    if (!hasStartedPlaying && sourceBuffer && sourceBuffer.buffered.length > 0) {
                      const start = sourceBuffer.buffered.start(0);
                      const end = sourceBuffer.buffered.end(0);
                      const bufferedDuration = end - start;
                      if (bufferedDuration >= 1.5) {
                        hasStartedPlaying = true;
                        if (audioRef.current && epoch === playbackEpochRef.current) {
                          // Seek to the live edge to skip the history buffer
                          try {
                            audioRef.current.currentTime = Math.max(0, end - 0.2);
                            console.log("WebSocket MSE synced to live edge:", audioRef.current.currentTime);
                          } catch (seekError) {
                            console.warn("Failed to seek MSE playhead, playing from start:", seekError);
                          }

                          audioRef.current.volume = 0; // Start at 0 for fade-in
                          audioRef.current.play()
                            .then(() => {
                              console.log('MSE Jitter buffer filled. Started playing.');
                              const target = isMutedRef.current ? 0 : volumeRef.current;
                              fadeVolume(target, 300);
                            })
                            .catch(err => console.error('WebSocket playback play error:', err));
                        }
                      }
                    }
                  });
                } catch (e) {
                  console.error('Failed to create SourceBuffer:', e);
                  ws.close();
                }
              });

              ws.binaryType = 'arraybuffer';
              ws.onopen = () => {
                isWsConnected = true;
                clearTimeout(fallbackTimeout);
                console.log('WebSocket listener connected to live stream');

                // Clear any existing source and bind the MediaSource
                if (audioRef.current) {
                  resetAudioElementForNewSource();
                  const blobUrl = URL.createObjectURL(mediaSource);
                  ownedBlobUrlRef.current = blobUrl;
                  audioRef.current.src = blobUrl;
                }
              };

              ws.onmessage = (event) => {
                if (websocketRef.current !== ws) {
                  ws.close();
                  return;
                }
                const chunk = new Uint8Array(event.data as ArrayBuffer);
                queue.push(chunk);
                appendNext();

                // Memory management: Prune old played ranges from the buffer once in a while
                if (audioRef.current && audioRef.current.currentTime > 30 && sourceBuffer && !sourceBuffer.updating) {
                  try {
                    // Remove data from start to 10 seconds behind current time
                    sourceBuffer.remove(0, audioRef.current.currentTime - 10);
                  } catch (e) {
                    // Ignore transient removal errors
                  }
                }
              };

              ws.onerror = (err) => {
                console.error('WebSocket streaming error, falling back:', err);
                ws.close();
              };

              ws.onclose = () => {
                console.warn('WebSocket streaming closed');
                clearTimeout(fallbackTimeout);
                if (websocketRef.current !== ws) return;
                websocketRef.current = null;
                if (epoch !== playbackEpochRef.current || !isPlayingRef.current) return;
                // If we were playing via WebSocket, fall back to progressive stream
                if (audioRef.current && audioRef.current.src.startsWith('blob:')) {
                    resetAudioElementForNewSource();
                    const fallbackUrl = resolveStreamUrl(virtualTrack.stream_url);
                    audioRef.current.src = fallbackUrl;
                    audioRef.current.load();
                    audioRef.current.play().catch(() => { });
                  } else {
                    startProgressiveFallback();
                  }
              };

            } catch (err) {
              console.warn('WebSocket MSE setup failed, falling back:', err);
              startProgressiveFallback();
            }
          };

          upgradeToWebSocketStream();
        } else {
          playTrack(virtualTrack, true);
          if (audioRef.current && data.offset && data.offset > 0.1) {
            audioRef.current.currentTime = data.offset;
          }
        }
      } else {
        if (res.status === 404) {
          showError("Station Offline", "This radio station is currently offline.");
          setActiveRadioStation(null);
          setIsRadioSync(false);
          return;
        }
        throw new Error();
      }
    } catch (e) {
      showError("Station Offline", "This radio station is currently offline.");
      setActiveRadioStation(null);
      setIsRadioSync(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      userPausedRef.current = true; // Mark as intentional user pause
      isPlayingRef.current = false; // Sync update to prevent onError from firing when unloading source
      setIsPlaying(false);


      // Fade out audio before pausing
      fadeVolume(0, 300).then(() => {
        // Double check isPlaying state hasn't been toggled back to true in the meantime
        if (isPlayingRef.current) return;

        if (activeRadioStationRef.current) {
          // Close WebSocket and WebRTC connections to stop incoming audio chunks
          if (websocketRef.current) {
            websocketRef.current.close();
            websocketRef.current = null;
          }
          if (webrtcPCRef.current) {
            webrtcPCRef.current.close();
            webrtcPCRef.current = null;
          }
          // Unload live audio source to stop buffering/downloading
          if (audioRef.current) {
            resetAudioElementForNewSource();
          }
        } else {
          if (audioRef.current) {
            audioRef.current.pause();
          }
        }

        // Restore volume for next play
        if (audioRef.current) {
          audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
        }
      });
    } else {
      // Trigger checkout modal if already blocked at guest threshold
      if (!isPremium) {
        if (activeRadioStation && currentTime >= 60) {
          setShowPremiumModal(true);
          return;
        } else if (!activeRadioStation && currentTime >= 30) {
          setShowPremiumModal(true);
          return;
        }
      }

      if (activeRadioStation) {
        console.log("Radio resumed. Force fully reloading the stream fresh from the live head.");
        playRadioStation(activeRadioStation, true);
      } else {
        console.log("Normal track resumed.");
        if (audioRef.current) {
          audioRef.current.volume = 0; // Start at 0 for fade-in
          audioRef.current.play().then(() => {
            const target = isMutedRef.current ? 0 : volumeRef.current;
            fadeVolume(target, 300);
          }).catch(() => { });
        }
        setIsPlaying(true);
      }
    }
  };

  const seek = (time: number) => {
    if (!audioRef.current || isRadioSync) return; // Prevent live stream seeking
    audioRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const adjustVolume = (vol: number) => {
    const level = Math.max(0, Math.min(1, vol));
    setVolume(level);
    if (audioRef.current) {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      audioRef.current.volume = isMuted ? 0 : level;
    }
    if (level > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      audioRef.current.volume = !isMuted ? 0 : volume;
    }
  };

  const setSpeed = (speed: number) => {
    playbackSpeedRef.current = speed;
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);

  const toggleFavorite = async (trackId: number) => {
    if (!token) return;
    const isFav = favorites.includes(trackId);
    setFavorites(prev =>
      isFav ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
    try {
      const res = await fetch(`${API_URL}/favorites/${trackId}`, {
        method: isFav ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        setFavorites(prev =>
          isFav ? [...prev, trackId] : prev.filter(id => id !== trackId)
        );
      }
    } catch (e) {
      setFavorites(prev =>
        isFav ? [...prev, trackId] : prev.filter(id => id !== trackId)
      );
      console.warn('Failed to sync favorite:', e);
    }
  };

  const addToQueue = (track: Track) => {
    setPlayQueue(prev => {
      if (prev.some(t => t.id === track.id)) return prev;
      if (prev.length === 0) {
        setCurrentQueueIndex(0);
        playTrack(track);
      }
      return [...prev, track];
    });
  };

  const removeFromQueue = (trackId: number) => {
    setPlayQueue(prev => prev.filter(t => t.id !== trackId));
  };

  const clearQueue = () => {
    setPlayQueue([]);
    setCurrentQueueIndex(-1);
    setCurrentTrack(null);
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.src = '';
  };

  const playNext = () => {
    const queue = playQueueRef.current;
    const index = currentQueueIndexRef.current;
    if (queue.length === 0) {
      if (repeatModeRef.current === 'all' && currentTrackRef.current) {
        playTrack(currentTrackRef.current);
      }
      return;
    }
    let nextIndex = index + 1;

    if (isShuffleRef.current) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (repeatModeRef.current === 'all') {
        nextIndex = 0;
      } else {
        return; // Playback finished
      }
    }

    setCurrentQueueIndex(nextIndex);
    playTrack(queue[nextIndex]);
  };

  const playPrevious = () => {
    const queue = playQueueRef.current;
    const index = currentQueueIndexRef.current;
    if (queue.length === 0) return;
    let prevIndex = index - 1;

    if (prevIndex < 0) {
      if (repeatModeRef.current === 'all') {
        prevIndex = queue.length - 1;
      } else {
        prevIndex = 0; // Lock to first track
      }
    }

    setCurrentQueueIndex(prevIndex);
    playTrack(queue[prevIndex]);
  };

  const reorderQueue = (startIndex: number, endIndex: number) => {
    const newQueue = [...playQueue];
    const [removed] = newQueue.splice(startIndex, 1);
    newQueue.splice(endIndex, 0, removed);

    let newIndex = currentQueueIndex;
    if (currentQueueIndex !== -1) {
      if (currentQueueIndex === startIndex) {
        newIndex = endIndex;
      } else if (currentQueueIndex > startIndex && currentQueueIndex <= endIndex) {
        newIndex = currentQueueIndex - 1;
      } else if (currentQueueIndex < startIndex && currentQueueIndex >= endIndex) {
        newIndex = currentQueueIndex + 1;
      }
    }

    setPlayQueue(newQueue);
    setCurrentQueueIndex(newIndex);
  };

  const updateTrackMetadata = (track: Track) => {
    setCurrentTrack(prev => prev && prev.id === track.id ? track : prev);
    setPlayQueue(prev => prev.map(t => t.id === track.id ? track : t));
  };

  const prevPremiumRef = useRef(isPremium);
  useEffect(() => {
    if (!token) {
      prevPremiumRef.current = isPremium;
      return;
    }
    if (prevPremiumRef.current && !isPremium && currentTrackRef.current && !activeRadioStationRef.current) {
      const savedPosition = Math.max(
        audioRef.current?.currentTime ?? 0,
        currentTimeRef.current,
      );
      pendingSeekRef.current = savedPosition >= 0.25 ? savedPosition : null;
      void playTrackRef.current(currentTrackRef.current, false);
    }
    prevPremiumRef.current = isPremium;
  }, [isPremium, token]);

  return (
    <AudioContext.Provider value={{
      currentTrack,
      activeRadioStation,
      isPlaying,
      duration,
      currentTime,
      volume,
      isMuted,
      isRadioSync,
      playbackSpeed,
      repeatMode,
      isShuffle,
      favorites,
      playQueue,
      currentQueueIndex,
      showPremiumModal,
      equalizerBars,
      qualityLevelSetting,
      activeStreamLabel,
      analyser,
      outputDevices,
      selectedOutputDeviceId,
      outputDeviceSupported,
      outputDevicesLoading,

      playTrack,
      playRadioStation,
      togglePlay,
      seek,
      adjustVolume,
      toggleMute,
      setPlaybackSpeed: setSpeed,
      setRepeatMode,
      toggleShuffle,
      toggleFavorite,
      addToQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      playNext,
      playPrevious,
      setShowPremiumModal,
      setQualityLevelSetting,
      updateTrackMetadata,
      refreshOutputDevices,
      setOutputDevice,
      promptSelectOutputDevice,
    }}>
      {children}
    </AudioContext.Provider>
  );
};

export const useAudio = () => {
  const context = useContext(AudioContext);
  if (context === undefined) {
    throw new Error('useAudio must be used within an AudioProvider');
  }
  return context;
};
