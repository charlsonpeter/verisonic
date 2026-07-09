import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import Hls from 'hls.js';
import { showError } from '../utils/swal';

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
  qualityLevelSetting: 'normal' | 'high' | 'hires' | 'lossless';
  
  playTrack: (track: Track, isRadio?: boolean) => void | Promise<void>;
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
  setQualityLevelSetting: (quality: 'normal' | 'high' | 'hires' | 'lossless') => void;
  updateTrackMetadata: (track: Track) => void;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

const API_URL = '/api';

const resolveStreamUrl = (url?: string): string => {
  if (!url) return "";
  return url.replace("http://localhost/storage", `${window.location.protocol}//${window.location.host}/storage`);
};

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isPremium, userMode, currentUser } = useAuth();
  
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
  const [qualityLevelSetting, setQualityLevelSetting] = useState<'normal' | 'high' | 'hires' | 'lossless'>('lossless');
  const [equalizerBars, setEqualizerBars] = useState<number[]>(new Array(10).fill(4));

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

  // Track speed state in ref to avoid stale closure in audio event handlers
  const playbackSpeedRef = useRef<number>(1.0);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Keep latest state refs to avoid stale closures in audio event handlers
  const currentTrackRef = useRef(currentTrack);
  const isPremiumRef = useRef(isPremium);
  const activeRadioStationRef = useRef(activeRadioStation);
  const isPlayingRef = useRef(isPlaying);
  const repeatModeRef = useRef(repeatMode);
  const playQueueRef = useRef(playQueue);
  const currentQueueIndexRef = useRef(currentQueueIndex);
  const isShuffleRef = useRef(isShuffle);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);
  useEffect(() => { activeRadioStationRef.current = activeRadioStation; }, [activeRadioStation]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { repeatModeRef.current = repeatMode; }, [repeatMode]);
  useEffect(() => { playQueueRef.current = playQueue; }, [playQueue]);
  useEffect(() => { currentQueueIndexRef.current = currentQueueIndex; }, [currentQueueIndex]);
  useEffect(() => { isShuffleRef.current = isShuffle; }, [isShuffle]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  // Stop playback and reset audio states when user logs out
  useEffect(() => {
    if (!token) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.srcObject = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (webrtcPCRef.current) {
        webrtcPCRef.current.close();
        webrtcPCRef.current = null;
      }
      if (websocketRef.current) {
        websocketRef.current.close();
        websocketRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTrack(null);
      setActiveRadioStation(null);
      setIsRadioSync(false);
      setCurrentTime(0);
      setDuration(0);
      setPlayQueue([]);
      setCurrentQueueIndex(-1);
    }
  }, [token]);

  // Stop library music/other stations playback when switching to Admin Mode for Radio Admins
  // Pre-load station or stop other feeds when switching to Admin Mode
  useEffect(() => {
    if (userMode === 'admin' && currentUser && ['admin', 'radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role)) {
      // Instantly pause and reset any running playback to prevent leakage
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setIsPlaying(false);
      setCurrentTrack(null);
      setActiveRadioStation(null);
      setIsRadioSync(false);

      // If we are a radio_admin, pre-load their own station in a paused state so the player is always visible
      if ((currentUser.real_role || currentUser.role) === 'radio_admin') {
        const loadBroadcasterStation = async () => {
          try {
            const res = await fetch('/api/radio');
            if (res.ok) {
              const data = await res.json();
              const myStation = data.find((s: any) => s.owner_id === currentUser.id);
              if (myStation) {
                setActiveRadioStation(myStation);
                setIsRadioSync(true);
                const virtualTrack: Track = {
                  id: myStation.id * 100,
                  title: myStation.current_track_title || "Standby Broadcast",
                  artist_name: myStation.current_track_artist || myStation.name,
                  duration: 0,
                  stream_url: myStation.stream_url
                };
                setCurrentTrack(virtualTrack);
                if (audioRef.current && myStation.stream_url) {
                  audioRef.current.src = resolveStreamUrl(myStation.stream_url);
                  audioRef.current.pause();
                }
                setIsPlaying(false);
              }
            }
          } catch (e) {
            console.warn("Failed to load radio admin station on admin mode enter. Using mock fallback.");
            const mockStation = {
              id: 1,
              name: "Mock Broadcaster FM",
              description: "Virtual broadcast stream for offline testing.",
              owner_id: currentUser.id,
              stream_url: "https://pub1.freefm.lk/1.aac",
              is_active: true
            };
            setActiveRadioStation(mockStation);
            setIsRadioSync(true);
            const virtualTrack: Track = {
              id: mockStation.id * 100,
              title: "Standby Broadcast",
              artist_name: mockStation.name,
              duration: 0,
              stream_url: mockStation.stream_url
            };
            setCurrentTrack(virtualTrack);
            if (audioRef.current && mockStation.stream_url) {
              audioRef.current.src = resolveStreamUrl(mockStation.stream_url);
              audioRef.current.pause();
            }
            setIsPlaying(false);
          }
        };
        loadBroadcasterStation();
      }
    }
  }, [userMode, currentUser]);

  // Initialize Audio Object
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    const onPlay = () => {
      setIsPlaying(true);
      audio.playbackRate = playbackSpeedRef.current;
    };
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      
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

        const latency = bufferedEnd - audio.currentTime;
        if (latency > 3.5) {
          audio.currentTime = Math.max(0, bufferedEnd - 1.5);
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

  // Real VU meter — driven by Web Audio API AnalyserNode
  useEffect(() => {
    const NUM_BARS = 10;

    const stopAnalyser = () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      setEqualizerBars(new Array(NUM_BARS).fill(4));
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
      ctx.resume().catch(() => {});
    }

    // Create analyser only once per audio element
    if (!analyserRef.current) {
      try {
        const source = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64; // 32 frequency bins
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        analyser.connect(ctx.destination);
        analyserRef.current = analyser;
      } catch (e) {
        // CORS or already-connected element — fall back to random
        console.warn('AnalyserNode setup failed (likely CORS on radio stream):', e);
        equalizerIntervalRef.current = setInterval(() => {
          setEqualizerBars(prev => prev.map(() => Math.floor(Math.random() * 20) + 4));
        }, 120);
        return () => {
          if (equalizerIntervalRef.current) clearInterval(equalizerIntervalRef.current);
          setEqualizerBars(new Array(NUM_BARS).fill(4));
        };
      }
    }

    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      // Map the frequency bins to NUM_BARS evenly spaced bars (4–24px)
      const step = Math.floor(dataArray.length / NUM_BARS);
      const bars = Array.from({ length: NUM_BARS }, (_, i) => {
        const bin = dataArray[i * step] ?? 0;
        return Math.max(4, Math.round((bin / 255) * 24));
      });
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
        audioRef.current.play().catch(() => {});
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

  const playTrack = async (track: Track, isRadio = false) => {
    if (!audioRef.current) return;

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
    audioRef.current.srcObject = null;
    
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

    // Determine correct audio stream path (checking FLAC/Lossless settings)
    let streamUrl = resolveStreamUrl(trackToPlay.hls_playlist_path || trackToPlay.mp3_320_path || trackToPlay.stream_url);
    
    if (!streamUrl) {
      console.warn("No stream URL available for track:", trackToPlay.id);
      return;
    }

    if (isRadio) {
      // Append cache buster to force browsers to bypass cache and pull live head from the network
      const separator = streamUrl.includes('?') ? '&' : '?';
      streamUrl = `${streamUrl}${separator}nocache=${Date.now()}`;
      console.log("Loading live radio stream URL with cache buster:", streamUrl);
    } else {
      console.log("Loading standard music library track URL:", streamUrl);
    }

    // Reset details
    setCurrentTrack(trackToPlay);
    setCurrentTime(0);
    setDuration(trackToPlay.duration || 0);

    // Destroy existing Hls sessions
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Set src and load
    if (streamUrl.includes('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(audioRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (audioRef.current) {
            audioRef.current.playbackRate = playbackSpeedRef.current;
          }
          audioRef.current?.play().catch(e => console.log("Autoplay blocked: ", e));
        });
      } else if (audioRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        audioRef.current.src = streamUrl;
        audioRef.current.playbackRate = playbackSpeedRef.current;
        audioRef.current.load();
        audioRef.current.play().catch(e => console.log("Autoplay blocked: ", e));
      }
    } else {
      audioRef.current.src = streamUrl;
      audioRef.current.playbackRate = playbackSpeedRef.current;
      audioRef.current.volume = isMutedRef.current ? 0 : volumeRef.current;
      audioRef.current.load();
      audioRef.current.play().catch(e => console.log("Autoplay blocked: ", e));
    }

    setIsPlaying(true);
  };

  const playRadioStation = async (station: RadioStation) => {
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
          // Start playing progressive HTTP stream immediately for guaranteed audio
          playTrack(virtualTrack, true);
          if (audioRef.current && data.offset && data.offset > 0.1) {
            audioRef.current.currentTime = data.offset;
          }

          // Then attempt WebSocket MSE upgrade in background for lower latency
          const upgradeToWebSocketStream = () => {
            try {
              // Convert HTTP/HTTPS API URL to WS/WSS URL
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
                    
                    // Buffer at least 1.5 seconds of audio before starting playback
                    if (!hasStartedPlaying && sourceBuffer && sourceBuffer.buffered.length > 0) {
                      const start = sourceBuffer.buffered.start(0);
                      const end = sourceBuffer.buffered.end(0);
                      const bufferedDuration = end - start;
                      if (bufferedDuration >= 1.5) {
                        hasStartedPlaying = true;
                        if (audioRef.current) {
                          audioRef.current.play()
                            .then(() => console.log('MSE Jitter buffer filled (1.5s). Started playing.'))
                            .catch(err => console.error('WebSocket playback play error:', err));
                        }
                      }
                    }
                  });
                } catch (e) {
                  console.error('Failed to create SourceBuffer for audio/mpeg:', e);
                  ws.close();
                }
              });

              ws.binaryType = 'arraybuffer';
              ws.onopen = () => {
                console.log('WebSocket listener connected to live stream');
                if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current.srcObject = null;
                  audioRef.current.src = URL.createObjectURL(mediaSource);
                  console.log('Switched to WebSocket MSE source. Buffering...');
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
                console.warn('WebSocket streaming closed, fallback if needed');
                if (websocketRef.current === ws) {
                  websocketRef.current = null;
                  // If we were playing via websocket, fall back to progressive stream
                  if (audioRef.current && audioRef.current.src.startsWith('blob:')) {
                    const fallbackUrl = resolveStreamUrl(virtualTrack.stream_url);
                    audioRef.current.src = fallbackUrl;
                    audioRef.current.load();
                    audioRef.current.play().catch(() => {});
                  }
                }
              };

            } catch (err) {
              console.warn('WebSocket MSE upgrade failed, keeping progressive stream:', err);
            }
          };

          // Run WebSocket upgrade attempt without blocking
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
      // Offline mock radio streaming fallback
      const fallbackUrl = station.stream_url || 'https://pub1.freefm.lk/1.aac';
      const virtualTrack: Track = {
        id: station.id * 100,
        title: station.current_track_title || "Live stream broadcast",
        artist_name: station.current_track_artist || station.name,
        duration: 0,
        stream_url: fallbackUrl
      };
      playTrack(virtualTrack, true);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      isPlayingRef.current = false; // Sync update to prevent onError from firing when unloading source
      if (activeRadioStation) {
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
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current.load();
      } else {
        audioRef.current.pause();
      }
      setIsPlaying(false);
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
        playRadioStation(activeRadioStation);
      } else {
        console.log("Normal track resumed.");
        audioRef.current.play().catch(() => {});
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
      audioRef.current.volume = isMuted ? 0 : level;
    }
    if (level > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (audioRef.current) {
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

  const toggleFavorite = (trackId: number) => {
    setFavorites(prev => 
      prev.includes(trackId) ? prev.filter(id => id !== trackId) : [...prev, trackId]
    );
  };

  const addToQueue = (track: Track) => {
    setPlayQueue(prev => [...prev, track]);
    if (playQueue.length === 0) {
      setCurrentQueueIndex(0);
      playTrack(track);
    }
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
      updateTrackMetadata
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
