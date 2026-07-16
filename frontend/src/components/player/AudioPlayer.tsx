import React from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, 
  Volume2, VolumeX, ListMusic, Heart, Monitor, AlignLeft,
  ChevronDown, ChevronsLeft, ChevronsRight
} from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { Equalizer } from './Equalizer';
import { useAuth } from '../../context/AuthContext';
import { AddToPlaylistButton } from '../shared/AddToPlaylistButton';
import {
  isSynchronizedLyrics,
  lineIndexForTime,
  parseLyricsFromText,
} from '../../utils/lrc';

interface AudioPlayerProps {
  onToggleQueue: () => void;
  isQueueOpen: boolean;
  onToggleLyrics: () => void;
  isLyricsOpen: boolean;
  activeTab: string;
}

const SPEED_STEPS = [0.75, 1, 1.25, 1.5, 2] as const;

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  onToggleQueue, 
  isQueueOpen, 
  onToggleLyrics, 
  isLyricsOpen, 
  activeTab 
}) => {
  const { 
    currentTrack, activeRadioStation, isPlaying, duration, getCurrentTime, subscribeTime,
    volume, isMuted, isRadioSync, playbackSpeed, repeatMode, isShuffle, 
    favorites, togglePlay, seek, adjustVolume, toggleMute, setPlaybackSpeed, 
    setRepeatMode, toggleShuffle, toggleFavorite, playNext, playPrevious
  } = useAudio();

  const [isMobileExpanded, setIsMobileExpanded] = React.useState(false);
  const [mobileLyricsOpen, setMobileLyricsOpen] = React.useState(false);
  const [mobileActiveLineIndex, setMobileActiveLineIndex] = React.useState(-1);
  const mobilePlayerHistoryRef = React.useRef(false);
  const mobileLyricsScrollRef = React.useRef<HTMLDivElement | null>(null);
  const mobileActiveLineRef = React.useRef<HTMLParagraphElement | null>(null);

  const openMobileExpanded = React.useCallback(() => {
    setIsMobileExpanded(true);
    if (!mobilePlayerHistoryRef.current) {
      window.history.pushState(
        { verisonicMobilePlayer: true },
        '',
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      );
      mobilePlayerHistoryRef.current = true;
    }
  }, []);

  const closeMobileExpanded = React.useCallback(() => {
    if (mobilePlayerHistoryRef.current) {
      mobilePlayerHistoryRef.current = false;
      window.history.back();
      return;
    }
    setIsMobileExpanded(false);
    setMobileLyricsOpen(false);
  }, []);

  React.useEffect(() => {
    const onPopState = () => {
      mobilePlayerHistoryRef.current = false;
      setIsMobileExpanded(false);
      setMobileLyricsOpen(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  React.useEffect(() => {
    if (!isMobileExpanded) setMobileLyricsOpen(false);
  }, [isMobileExpanded]);

  const speedStepIndex = SPEED_STEPS.findIndex(
    step => Math.abs(step - playbackSpeed) < 0.01
  );
  const currentSpeedIndex = speedStepIndex >= 0 ? speedStepIndex : SPEED_STEPS.indexOf(1);

  const decreaseSpeed = () => {
    if (currentSpeedIndex > 0) {
      setPlaybackSpeed(SPEED_STEPS[currentSpeedIndex - 1]);
    }
  };

  const increaseSpeed = () => {
    if (currentSpeedIndex < SPEED_STEPS.length - 1) {
      setPlaybackSpeed(SPEED_STEPS[currentSpeedIndex + 1]);
    }
  };

  const resetSpeed = () => {
    setPlaybackSpeed(1);
  };

  const mobileParsedLyrics = React.useMemo(() => {
    if (!currentTrack?.lyrics) return [];
    return parseLyricsFromText(currentTrack.lyrics);
  }, [currentTrack?.lyrics]);

  const mobileLyricsSynced = React.useMemo(
    () => isSynchronizedLyrics(mobileParsedLyrics),
    [mobileParsedLyrics],
  );

  React.useEffect(() => {
    if (!mobileLyricsOpen || !mobileLyricsSynced) {
      setMobileActiveLineIndex(-1);
      return;
    }

    return subscribeTime((time) => {
      const next = lineIndexForTime(mobileParsedLyrics, time);
      setMobileActiveLineIndex((prev) => (prev === next ? prev : next));
    });
  }, [mobileLyricsOpen, mobileLyricsSynced, mobileParsedLyrics, subscribeTime]);

  React.useEffect(() => {
    if (mobileLyricsSynced && mobileActiveLineRef.current) {
      mobileActiveLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [mobileActiveLineIndex, mobileLyricsSynced]);

  const { userMode, currentUser } = useAuth();
  const isRadioAdminInAdminMode = !!(
    userMode === 'admin' &&
    currentUser &&
    (currentUser.real_role || currentUser.role) === 'radio_admin'
  );
  const isOffline = !!(activeRadioStation && (activeRadioStation.is_online === false || activeRadioStation.is_active === false));

  const getRadioDisplayInfo = () => {
    if (!activeRadioStation) return null;
    if (activeRadioStation.is_active === false) {
      return {
        title: activeRadioStation.name,
        subtitle: "Offline"
      };
    }
    return {
      title: activeRadioStation.name,
      subtitle: activeRadioStation.current_program_title || ""
    };
  };

  const format24hTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hStr = String(hours).padStart(2, '0');
    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  };

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const seekMax = isRadioSync ? 86400 : (duration || 100);
  const isRadioSyncRef = React.useRef(isRadioSync);
  isRadioSyncRef.current = isRadioSync;
  const seekMaxRef = React.useRef(seekMax);
  seekMaxRef.current = seekMax;

  const mobileMiniSliderRef = React.useRef<HTMLInputElement | null>(null);
  const desktopSliderRef = React.useRef<HTMLInputElement | null>(null);
  const expandedSliderRef = React.useRef<HTMLInputElement | null>(null);
  const desktopElapsedRef = React.useRef<HTMLSpanElement | null>(null);
  const expandedElapsedRef = React.useRef<HTMLSpanElement | null>(null);

  const isSeekingRef = React.useRef(false);
  const seekDraftRef = React.useRef(0);
  const [isSeeking, setIsSeeking] = React.useState(false);

  const paintSeekUi = React.useCallback((time: number, opts?: { forceSliders?: boolean }) => {
    const label = isRadioSyncRef.current ? format24hTime(time) : formatTime(time);
    if (desktopElapsedRef.current) desktopElapsedRef.current.textContent = label;
    if (expandedElapsedRef.current) expandedElapsedRef.current.textContent = label;

    if (opts?.forceSliders || !isSeekingRef.current) {
      const max = String(seekMaxRef.current);
      const value = String(time);
      for (const el of [mobileMiniSliderRef.current, desktopSliderRef.current, expandedSliderRef.current]) {
        if (!el) continue;
        el.max = max;
        el.value = value;
      }
    }
  }, []);

  const finishSeek = React.useCallback(() => {
    if (!isSeekingRef.current || isRadioSyncRef.current) return;
    isSeekingRef.current = false;
    setIsSeeking(false);
    seek(seekDraftRef.current);
  }, [seek]);

  React.useEffect(() => {
    if (isRadioSync) {
      const tick = () => {
        const now = new Date();
        const s = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        paintSeekUi(s, { forceSliders: true });
      };
      tick();
      const interval = setInterval(tick, 1000);
      return () => clearInterval(interval);
    }

    return subscribeTime((t) => {
      if (isSeekingRef.current) return;
      paintSeekUi(t);
    });
  }, [isRadioSync, subscribeTime, paintSeekUi]);

  React.useEffect(() => {
    seekMaxRef.current = seekMax;
    const max = String(seekMax);
    for (const el of [mobileMiniSliderRef.current, desktopSliderRef.current, expandedSliderRef.current]) {
      if (el) el.max = max;
    }
  }, [seekMax]);

  React.useEffect(() => {
    if (!isSeeking) return;
    const onPointerUp = () => { finishSeek(); };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, [isSeeking, finishSeek]);

  React.useEffect(() => {
    isSeekingRef.current = false;
    setIsSeeking(false);
    const t = getCurrentTime();
    seekDraftRef.current = t;
    paintSeekUi(t, { forceSliders: true });
  }, [currentTrack?.id, getCurrentTime, paintSeekUi]);

  const handleSeekPointerDown = () => {
    isSeekingRef.current = true;
    setIsSeeking(true);
  };

  const handleSeekChange = (value: number) => {
    seekDraftRef.current = value;
    paintSeekUi(value, { forceSliders: true });
  };

  const handleSeekKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      isSeekingRef.current = true;
      setIsSeeking(true);
    }
  };

  React.useLayoutEffect(() => {
    if (!currentTrack && !activeRadioStation) return;
    if (isRadioSync) {
      const now = new Date();
      paintSeekUi(
        now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds(),
        { forceSliders: true },
      );
    } else {
      paintSeekUi(getCurrentTime(), { forceSliders: true });
    }
  }, [
    currentTrack?.id,
    activeRadioStation?.id,
    isRadioSync,
    isMobileExpanded,
    getCurrentTime,
    paintSeekUi,
  ]);

  if (!currentTrack && !activeRadioStation) return null;

  const isFav = currentTrack ? favorites.includes(currentTrack.id) : false;
  const hasLyrics = !!(
    currentTrack && 
    currentTrack.lyrics && 
    currentTrack.lyrics.trim() !== "" && 
    currentTrack.lyrics !== "None" && 
    currentTrack.lyrics !== "null"
  );

  // Determine Badge colors based on track stats
  const getQualityBadge = () => {
    if (!activeRadioStation) return null;
    if (isOffline) {
      return { text: "OFFLINE", style: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
    }
    if (isPlaying) {
      return { text: "STREAMING", style: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
    }
    return { text: "PAUSED", style: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
  };

  const badge = getQualityBadge();

  return (
    <>
      <footer
        className={`z-30
          max-md:relative max-md:flex-shrink-0 max-md:w-full max-md:flex-row max-md:items-center max-md:gap-2.5 max-md:py-2.5 max-md:px-3 max-md:bg-slate-950
          md:fixed md:flex md:items-center md:justify-between md:px-6 md:transition-all md:duration-300
          md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-6xl md:h-24 md:bottom-6
          border-t border-white/10
          md:backdrop-blur-lg md:floating-deck md:rounded-3xl md:border md:bg-[rgba(6,8,20,0.72)]
        `}
      >
        {/* Background artwork blur effect */}
        {currentTrack?.cover_art_url && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-5 filter blur-3xl pointer-events-none -z-10 max-md:hidden md:rounded-3xl" 
            style={{ backgroundImage: `url(${currentTrack.cover_art_url})` }}
          />
        )}

        {/* Meta Track details — desktop only */}
        <div 
          onClick={() => { if (window.innerWidth < 768) openMobileExpanded(); }}
          className="hidden md:flex items-center gap-4 w-80 min-w-0 cursor-default flex-shrink-0"
        >
          <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-tr from-slate-900 to-rose-900 rounded-xl overflow-hidden flex items-center justify-center border border-white/5 shadow-md flex-shrink-0">
            {currentTrack?.cover_art_url ? (
              <img src={currentTrack.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <Monitor className="w-5 h-5 md:w-6 md:h-6 text-slate-500" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="font-bold text-white text-sm truncate max-w-[150px]">
                {activeRadioStation ? getRadioDisplayInfo()?.title : currentTrack?.title}
              </h4>
              {currentTrack && !isRadioAdminInAdminMode && (
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleFavorite(currentTrack.id); }} 
                  className={`flex-shrink-0 transition ${isFav ? 'text-rose-500 scale-110' : 'text-slate-500 hover:text-slate-350'}`}
                  title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                >
                  <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate max-w-[180px]">
              {activeRadioStation ? getRadioDisplayInfo()?.subtitle : currentTrack?.artist_name}
            </p>
            {badge && (
              <span className={`inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border mt-1 uppercase ${badge.style}`}>
                {badge.text}
              </span>
            )}
          </div>
        </div>

        {/* Mobile player: cover | metadata+seek | controls */}
        <div className="md:hidden w-full flex items-center gap-2.5 min-w-0">
          {/* Col 1 — cover art */}
          <button
            type="button"
            onClick={openMobileExpanded}
            className="w-10 h-10 bg-gradient-to-tr from-slate-900 to-rose-900 rounded-xl overflow-hidden flex items-center justify-center border border-white/5 shadow-md flex-shrink-0 active:scale-95 transition"
          >
            {currentTrack?.cover_art_url ? (
              <img src={currentTrack.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <Monitor className="w-5 h-5 text-slate-500" />
            )}
          </button>

          {/* Col 2 — metadata + seek bar */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <button
              type="button"
              onClick={openMobileExpanded}
              className="min-w-0 text-left active:opacity-80 transition"
            >
              <h4 className="font-bold text-white text-sm truncate leading-snug">
                {activeRadioStation ? getRadioDisplayInfo()?.title : currentTrack?.title}
              </h4>
              <p className="text-xs text-slate-400 truncate leading-snug mt-0.5">
                {activeRadioStation ? getRadioDisplayInfo()?.subtitle : currentTrack?.artist_name}
              </p>
            </button>
            <input
              ref={mobileMiniSliderRef}
              type="range"
              min="0"
              max={seekMax}
              defaultValue={0}
              onPointerDown={handleSeekPointerDown}
              onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
              onKeyDown={handleSeekKeyDown}
              onKeyUp={finishSeek}
              disabled={isRadioSync}
              onClick={(e) => e.stopPropagation()}
              className="w-full h-1 accent-rose-500 bg-white/10 rounded-full outline-none cursor-pointer audio-knob"
              aria-label="Seek"
            />
          </div>

          {/* Col 3 — playback controls */}
          <div className="flex items-center justify-center gap-6 flex-shrink-0 min-w-[6.5rem] pl-0.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); playPrevious(); }}
              disabled={isRadioSync || isRadioAdminInAdminMode}
              className="p-1 text-slate-400 active:text-white transition disabled:opacity-20"
              title="Previous"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              disabled={isOffline}
              className="w-9 h-9 bg-white hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none active:scale-95 rounded-full flex items-center justify-center text-slate-950 font-bold shadow-md transition"
              title={isOffline ? 'Station Offline' : isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-current text-slate-950" />
              ) : (
                <Play className="w-4 h-4 fill-current text-slate-950 ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); playNext(); }}
              disabled={isRadioSync || isRadioAdminInAdminMode}
              className="p-1 text-slate-400 active:text-white transition disabled:opacity-20"
              title="Next"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
          </div>
        </div>

        {/* Desktop: Primary media controls */}
        <div className="hidden md:flex flex-1 items-center justify-center min-w-0 px-4">
          <div className="inline-flex flex-col items-center gap-2.5">
            <div className="flex items-center justify-center gap-6">
              <button 
                onClick={toggleShuffle} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className={`transition ${isShuffle ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-350'} disabled:opacity-30`}
                title="Shuffle Queue"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button 
                onClick={playPrevious} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className="text-slate-400 hover:text-white transition disabled:opacity-30"
                title="Previous"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                disabled={isOffline}
                className="w-11 h-11 bg-white hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none active:scale-95 rounded-full flex items-center justify-center text-slate-950 font-bold shadow-md hover:shadow-rose-500/10 transition-all duration-300"
                title={isOffline ? "Station Offline" : isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current text-slate-950" /> : <Play className="w-5 h-5 fill-current text-slate-950 ml-0.5" />}
              </button>

              <button 
                onClick={playNext} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className="text-slate-400 hover:text-white transition disabled:opacity-30"
                title="Next"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>

              <button 
                onClick={() => {
                  if (repeatMode === 'none') setRepeatMode('all');
                  else if (repeatMode === 'all') setRepeatMode('one');
                  else setRepeatMode('none');
                }} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className={`transition relative ${repeatMode !== 'none' ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-350'} disabled:opacity-30`}
                title={`Repeat Mode: ${repeatMode}`}
              >
                <Repeat className="w-4 h-4" />
                {repeatMode === 'one' && (
                  <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-rose-500 text-white font-extrabold w-3 h-3 rounded-full flex items-center justify-center font-sans">1</span>
                )}
              </button>
            </div>

            <div className={`flex items-center gap-1.5 text-slate-500 font-bold font-sans ${isRadioSync ? 'w-[15rem]' : 'w-[13.5rem]'}`}>
              <span
                ref={desktopElapsedRef}
                className={`shrink-0 text-right tabular-nums ${isRadioSync ? 'w-11 text-[9px]' : 'w-9 text-[10px]'}`}
              >
                0:00
              </span>
              <input 
                ref={desktopSliderRef}
                type="range" 
                min="0"
                max={seekMax}
                defaultValue={0}
                onPointerDown={handleSeekPointerDown}
                onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
                onKeyDown={handleSeekKeyDown}
                onKeyUp={finishSeek}
                disabled={isRadioSync}
                className="flex-1 min-w-0 accent-rose-500 h-1 bg-slate-800 rounded-lg outline-none cursor-pointer audio-knob"
              />
              <span className={`shrink-0 text-left tabular-nums ${isRadioSync ? 'w-11 text-[9px]' : 'w-9 text-[10px]'}`}>
                {isRadioSync ? "24:00:00" : formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop: Volume / Auxiliary controls */}
        <div className="hidden md:flex items-center gap-5 justify-end flex-1 max-w-[420px]">
          <Equalizer />

          {!isRadioSync && (
            <select 
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="bg-transparent border border-white/5 rounded-lg text-[10px] font-extrabold px-1.5 py-1 text-slate-400 hover:text-white outline-none cursor-pointer font-sans"
              title="Playback Speed"
            >
              <option value="0.75" className="bg-slate-900">0.75x</option>
              <option value="1" className="bg-slate-900">1.0x</option>
              <option value="1.25" className="bg-slate-900">1.25x</option>
              <option value="1.5" className="bg-slate-900">1.5x</option>
              <option value="2" className="bg-slate-900">2.0x</option>
            </select>
          )}

          <div className="flex items-center gap-2">
            <button 
              onClick={toggleMute} 
              className="text-slate-400 hover:text-slate-200 transition"
              title={isMuted || volume === 0 ? "Unmute Volume" : "Mute Volume"}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-5 h-5 text-rose-455" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input 
              type="range" 
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => adjustVolume(parseFloat(e.target.value))}
              className="w-20 accent-rose-500 h-1 bg-slate-800 rounded-lg outline-none cursor-pointer audio-knob"
            />
          </div>

          <div className="flex flex-col gap-1.5 items-center justify-center border-l border-white/5 pl-4 ml-2">
            <button 
              onClick={onToggleQueue}
              className={`transition ${isQueueOpen ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-350'}`}
              title="Now Playing"
            >
              <ListMusic className="w-[18px] h-[18px]" />
            </button>

            {hasLyrics && !isRadioAdminInAdminMode && (
              <button 
                onClick={onToggleLyrics}
                className={`transition ${isLyricsOpen ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-350'}`}
                title="Lyrics"
              >
                <AlignLeft className="w-[18px] h-[18px]" />
              </button>
            )}
          </div>
        </div>

      </footer>

      {/* MOBILE FULL-SCREEN EXPANDED PLAYER DECK */}
      {isMobileExpanded && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-2xl z-[999] flex flex-col justify-between p-6 animate-slide-up select-none md:hidden">
          {/* Background Ambient Glow — hidden when lyrics are open for readability */}
          {currentTrack?.cover_art_url && (
            <div 
              className={`absolute inset-0 bg-cover bg-center filter blur-3xl pointer-events-none -z-10 transition-opacity duration-500 ${
                mobileLyricsOpen ? 'opacity-0' : 'opacity-[0.08]'
              }`}
              style={{ backgroundImage: `url(${currentTrack.cover_art_url})` }}
            />
          )}

          {/* Header */}
          <div className="flex items-center justify-between w-full">
            <button 
              onClick={closeMobileExpanded}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-slate-300 active:scale-95 transition"
              aria-label="Close player"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">Now Playing</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleQueue(); }}
              className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 transition ${
                isQueueOpen
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : 'bg-white/5 border-white/5 text-slate-300'
              }`}
              aria-label="Queue"
              title="Queue"
            >
              <ListMusic className="w-5 h-5" />
            </button>
          </div>

          {/* Album Cover Visual Center — parent holds cover + full-area lyrics overlay */}
          <div className="flex-1 flex flex-col items-center justify-center py-6 min-h-0 w-full relative">
            {/* Cover art — fades out when lyrics are shown */}
            <div
              className={`flex flex-col items-center flex-shrink-0 transition-all duration-500 ease-in-out ${
                mobileLyricsOpen
                  ? 'opacity-0 scale-95 pointer-events-none invisible'
                  : 'opacity-100 scale-100'
              }`}
              aria-hidden={mobileLyricsOpen}
            >
              <button
                type="button"
                onClick={() => {
                  if (hasLyrics && !isRadioAdminInAdminMode) {
                    setMobileLyricsOpen(true);
                  }
                }}
                className={`relative block p-0 w-60 h-60 sm:w-72 sm:h-72 rounded-3xl overflow-hidden border border-white/10 shadow-2xl transition-transform duration-300 active:scale-[0.98] ${
                  hasLyrics && !isRadioAdminInAdminMode ? 'cursor-pointer' : 'cursor-default'
                }`}
                aria-label={hasLyrics ? 'Show lyrics' : 'Album art'}
                tabIndex={mobileLyricsOpen ? -1 : 0}
              >
                <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 to-rose-950">
                  {currentTrack?.cover_art_url ? (
                    <img src={currentTrack.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Monitor className="w-14 h-14 text-slate-700" />
                    </div>
                  )}
                </div>
              </button>
              {badge && (
                <span className={`text-[8px] font-extrabold px-3 py-1 rounded-full border uppercase mt-5 tracking-wider ${badge.style}`}>
                  {badge.text}
                </span>
              )}
            </div>

            {/* Lyrics layer — transparent overlay, tap anywhere to close */}
            {hasLyrics && !isRadioAdminInAdminMode && (
              <button
                type="button"
                onClick={() => setMobileLyricsOpen(false)}
                className={`absolute z-10 inset-0 w-full flex flex-col overflow-hidden active:scale-[0.99] transition-all duration-500 ease-in-out ${
                  mobileLyricsOpen
                    ? 'opacity-100 pointer-events-auto'
                    : 'opacity-0 pointer-events-none'
                }`}
                aria-label="Hide lyrics"
                aria-hidden={!mobileLyricsOpen}
                tabIndex={mobileLyricsOpen ? 0 : -1}
              >
                <div
                  ref={mobileLyricsScrollRef}
                  className={`relative z-10 w-full h-full min-h-0 overflow-y-auto overscroll-y-contain px-6 py-6 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden scroll-smooth transition-all duration-500 ease-in-out ${
                    mobileLyricsOpen ? 'translate-y-0' : 'translate-y-3'
                  }`}
                >
                  <div className={`text-center ${mobileLyricsSynced ? 'space-y-6 py-[30vh]' : 'space-y-3 py-4'}`}>
                    {mobileParsedLyrics.length > 0 ? (
                      mobileParsedLyrics.map((line, idx) => {
                        const isActive = mobileLyricsSynced && idx === mobileActiveLineIndex;

                        return (
                          <p
                            key={idx}
                            ref={isActive ? mobileActiveLineRef : null}
                            className={`text-sm leading-relaxed transition-all duration-300 [text-shadow:0_2px_12px_rgba(0,0,0,0.85)] ${
                              isActive
                                ? 'text-rose-400 font-extrabold opacity-100'
                                : mobileLyricsSynced
                                  ? 'text-white/80 font-semibold opacity-90'
                                  : 'text-slate-100 font-semibold'
                            }`}
                          >
                            {line.text}
                          </p>
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-400">No lyrics available.</p>
                    )}
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Info, Progress & Controls */}
          <div className="space-y-6">
            <div className="flex items-center justify-between w-full">
              <div className="min-w-0 flex-1 pr-4">
                <h2 className="text-base font-black text-white truncate">
                  {activeRadioStation ? getRadioDisplayInfo()?.title : currentTrack?.title}
                </h2>
                <p className="text-xs text-slate-400 font-semibold truncate mt-1">
                  {activeRadioStation ? getRadioDisplayInfo()?.subtitle : currentTrack?.artist_name}
                </p>
              </div>
              {currentTrack && !isRadioAdminInAdminMode && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!activeRadioStation && (
                    <AddToPlaylistButton track={currentTrack} variant="round" />
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFavorite(currentTrack.id)}
                    className={`w-10 h-10 rounded-full bg-white/5 flex items-center justify-center transition active:scale-90 ${isFav ? 'text-rose-500 bg-rose-500/10' : 'text-slate-450'}`}
                    title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                    aria-label={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                    <Heart className={`w-4.5 h-4.5 ${isFav ? 'fill-current' : ''}`} />
                  </button>
                </div>
              )}
            </div>

            {/* Speed + seek bar */}
            <div className="space-y-2">
              {!isRadioSync && (
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={decreaseSpeed}
                    disabled={currentSpeedIndex <= 0}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 active:scale-95 active:text-white transition disabled:opacity-30"
                    aria-label="Decrease speed"
                    title="Slower"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetSpeed}
                    className="text-xs font-bold text-slate-300 tabular-nums min-w-[3rem] text-center active:scale-95 active:text-white transition"
                    aria-label="Reset speed to 1x"
                    title="Reset to 1x"
                  >
                    {playbackSpeed}x
                  </button>
                  <button
                    type="button"
                    onClick={increaseSpeed}
                    disabled={currentSpeedIndex >= SPEED_STEPS.length - 1}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 active:scale-95 active:text-white transition disabled:opacity-30"
                    aria-label="Increase speed"
                    title="Faster"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}

              <input
                ref={expandedSliderRef}
                type="range"
                min="0"
                max={seekMax}
                defaultValue={0}
                onPointerDown={handleSeekPointerDown}
                onChange={(e) => handleSeekChange(parseFloat(e.target.value))}
                onKeyDown={handleSeekKeyDown}
                onKeyUp={finishSeek}
                disabled={isRadioSync}
                className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg outline-none cursor-pointer audio-knob"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold font-sans">
                <span ref={expandedElapsedRef}>0:00</span>
                <span>
                  {isRadioSync ? "24:00:00" : formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Controls Tray */}
            <div className="flex items-center justify-between px-2">
              <button 
                onClick={toggleShuffle} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition active:scale-95 ${isShuffle ? 'text-rose-400 bg-rose-500/5' : 'text-slate-550'} disabled:opacity-30`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button 
                onClick={playPrevious} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className="w-11 h-11 flex items-center justify-center text-slate-350 active:scale-95 disabled:opacity-30"
              >
                <SkipBack className="w-5.5 h-5.5 fill-current" />
              </button>

              <button 
                onClick={togglePlay}
                disabled={isOffline}
                className="w-16 h-16 bg-white text-slate-950 hover:bg-rose-50 active:scale-90 rounded-full flex items-center justify-center shadow-lg transition-all duration-300"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current text-slate-950" /> : <Play className="w-6 h-6 fill-current text-slate-950 ml-0.5" />}
              </button>

              <button 
                onClick={playNext} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className="w-11 h-11 flex items-center justify-center text-slate-350 active:scale-95 disabled:opacity-30"
              >
                <SkipForward className="w-5.5 h-5.5 fill-current" />
              </button>

              <button 
                onClick={() => {
                  if (repeatMode === 'none') setRepeatMode('all');
                  else if (repeatMode === 'all') setRepeatMode('one');
                  else setRepeatMode('none');
                }} 
                disabled={isRadioSync || isRadioAdminInAdminMode}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition relative active:scale-95 ${repeatMode !== 'none' ? 'text-rose-400 bg-rose-500/5' : 'text-slate-550'} disabled:opacity-30`}
              >
                <Repeat className="w-4 h-4" />
                {repeatMode === 'one' && (
                  <span className="absolute top-0.5 right-0.5 text-[8px] bg-rose-500 text-white font-extrabold w-3 h-3 rounded-full flex items-center justify-center font-sans">1</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
