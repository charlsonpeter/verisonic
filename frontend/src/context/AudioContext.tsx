import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import Hls from 'hls.js';

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
  description: string;
  cover_art_url: string;
  stream_url: string;
  current_track_title?: string;
  current_track_artist?: string;
  listeners_count?: number;
  category?: string;
  owner_id?: number;
  stream_key?: string;
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

export const AudioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token, isPremium } = useAuth();
  
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
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const equalizerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Track speed state in ref to avoid stale closure in audio event handlers
  const playbackSpeedRef = useRef<number>(1.0);
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Keep latest state refs to avoid stale closures in audio event handlers
  const currentTrackRef = useRef(currentTrack);
  const isPremiumRef = useRef(isPremium);
  const activeRadioStationRef = useRef(activeRadioStation);
  const repeatModeRef = useRef(repeatMode);
  const playQueueRef = useRef(playQueue);
  const currentQueueIndexRef = useRef(currentQueueIndex);
  const isShuffleRef = useRef(isShuffle);
  const volumeRef = useRef(volume);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);
  useEffect(() => { activeRadioStationRef.current = activeRadioStation; }, [activeRadioStation]);
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
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
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
    };
  }, []);

  // Handle equalizer bar animations when playing
  useEffect(() => {
    if (isPlaying) {
      equalizerIntervalRef.current = setInterval(() => {
        setEqualizerBars(prev => prev.map(() => Math.floor(Math.random() * 20) + 4));
      }, 120);
    } else {
      if (equalizerIntervalRef.current) {
        clearInterval(equalizerIntervalRef.current);
      }
      setEqualizerBars(new Array(10).fill(4));
    }
    return () => {
      if (equalizerIntervalRef.current) {
        clearInterval(equalizerIntervalRef.current);
      }
    };
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
    
    // Clear live radio station status if playing normal track
    if (!isRadio) {
      setActiveRadioStation(null);
      setIsRadioSync(false);
    }

    let trackToPlay = track;
    try {
      const res = await fetch(`${API_URL}/music/${track.id}`);
      if (res.ok) {
        trackToPlay = await res.json();
      }
    } catch (e) {
      console.warn("Failed to fetch fresh metadata, playing with local cache:", e);
    }

    // Determine correct audio stream path (checking FLAC/Lossless settings)
    let streamUrl = trackToPlay.hls_playlist_path || trackToPlay.mp3_320_path || trackToPlay.stream_url;
    
    if (!streamUrl) {
      console.warn("No stream URL available for track:", trackToPlay.id);
      return;
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
    setActiveRadioStation(station);
    setIsRadioSync(true);
    setCurrentTrack(null);

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
        
        playTrack(virtualTrack, true);
        if (audioRef.current && data.offset && data.offset > 0.1) {
          audioRef.current.currentTime = data.offset;
        }
      } else {
        throw new Error();
      }
    } catch (e) {
      // Offline mock radio streaming
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
      audioRef.current.pause();
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
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
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
