import React from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, 
  Volume2, VolumeX, ListMusic, Heart, Monitor, AlignLeft,
  ChevronDown
} from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { Equalizer } from './Equalizer';
import { useAuth } from '../../context/AuthContext';

interface AudioPlayerProps {
  onToggleQueue: () => void;
  isQueueOpen: boolean;
  onToggleLyrics: () => void;
  isLyricsOpen: boolean;
  activeTab: string;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ 
  onToggleQueue, 
  isQueueOpen, 
  onToggleLyrics, 
  isLyricsOpen, 
  activeTab 
}) => {
  const { 
    currentTrack, activeRadioStation, isPlaying, duration, currentTime, 
    volume, isMuted, isRadioSync, playbackSpeed, repeatMode, isShuffle, 
    favorites, togglePlay, seek, adjustVolume, toggleMute, setPlaybackSpeed, 
    setRepeatMode, toggleShuffle, toggleFavorite, playNext, playPrevious,
    qualityLevelSetting
  } = useAudio();

  const [isMobileExpanded, setIsMobileExpanded] = React.useState(false);

  const { userMode, currentUser } = useAuth();
  const isAdminMode = !!(userMode === 'admin' && currentUser && ['radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role));
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

  // For 24h live clock display using client time and timezone
  const [secondsSinceMidnight, setSecondsSinceMidnight] = React.useState(0);

  React.useEffect(() => {
    if (!isRadioSync) return;
    
    const updateTime = () => {
      const now = new Date();
      setSecondsSinceMidnight(now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [isRadioSync]);

  const format24hTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const hStr = String(hours).padStart(2, '0');
    const mStr = String(minutes).padStart(2, '0');
    const sStr = String(seconds).padStart(2, '0');
    
    return `${hStr}:${mStr}:${sStr}`;
  };

  if (!currentTrack && !activeRadioStation) return null;

  const formatTime = (time: number) => {
    if (isNaN(time) || time === Infinity) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

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
    if (activeRadioStation) {
      if (isOffline) {
        return { text: "OFFLINE", style: "bg-slate-500/10 text-slate-400 border-slate-500/20" };
      }
      if (isPlaying) {
        return { text: "STREAMING", style: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
      }
      return { text: "PAUSED", style: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
    }
    return null;
  };

  const badge = getQualityBadge();

  return (
    <>
      <footer
        className={`z-30 transition-all duration-300
          max-md:relative max-md:flex-shrink-0 max-md:w-full max-md:flex-row max-md:items-center max-md:gap-2.5 max-md:py-2.5 max-md:px-3
          md:fixed md:flex md:items-center md:justify-between md:px-6
          md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-full md:max-w-6xl md:h-24 md:bottom-6
          bg-slate-950/98 border-t border-white/10 backdrop-blur-lg
          md:floating-deck md:rounded-3xl md:border md:bg-[rgba(6,8,20,0.72)]
        `}
      >
        {/* Background artwork blur effect */}
        {currentTrack?.cover_art_url && (
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-5 filter blur-3xl pointer-events-none -z-10 md:rounded-3xl" 
            style={{ backgroundImage: `url(${currentTrack.cover_art_url})` }}
          />
        )}

        {/* Meta Track details — desktop only */}
        <div 
          onClick={() => { if (window.innerWidth < 768) setIsMobileExpanded(true); }}
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
              {currentTrack && !isAdminMode && (
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
            onClick={() => setIsMobileExpanded(true)}
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
              onClick={() => setIsMobileExpanded(true)}
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
              type="range"
              min="0"
              max={isRadioSync ? 86400 : (duration || 100)}
              value={isRadioSync ? secondsSinceMidnight : currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
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
              disabled={isRadioSync || isAdminMode}
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
              disabled={isRadioSync || isAdminMode}
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
                disabled={isRadioSync || isAdminMode}
                className={`transition ${isShuffle ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-350'} disabled:opacity-30`}
                title="Shuffle Queue"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button 
                onClick={playPrevious} 
                disabled={isRadioSync || isAdminMode}
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
                disabled={isRadioSync || isAdminMode}
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
                disabled={isRadioSync || isAdminMode}
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
              <span className={`shrink-0 text-right tabular-nums ${isRadioSync ? 'w-11 text-[9px]' : 'w-9 text-[10px]'}`}>
                {isRadioSync ? format24hTime(secondsSinceMidnight) : formatTime(currentTime)}
              </span>
              <input 
                type="range" 
                min="0"
                max={isRadioSync ? 86400 : (duration || 100)}
                value={isRadioSync ? secondsSinceMidnight : currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
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

            {hasLyrics && !isAdminMode && (
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
          {/* Background Ambient Glow */}
          {currentTrack?.cover_art_url && (
            <div 
              className="absolute inset-0 bg-cover bg-center opacity-[0.08] filter blur-3xl pointer-events-none -z-10" 
              style={{ backgroundImage: `url(${currentTrack.cover_art_url})` }}
            />
          )}

          {/* Header */}
          <div className="flex items-center justify-between w-full">
            <button 
              onClick={() => setIsMobileExpanded(false)}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center text-slate-300 active:scale-95 transition"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
            <span className="text-[10px] font-bold text-slate-450 uppercase tracking-widest">Now Playing</span>
            <div className="w-10" />
          </div>

          {/* Album Cover Visual Center */}
          <div className="flex-1 flex flex-col items-center justify-center py-6">
            <div className="w-60 h-60 sm:w-72 sm:h-72 rounded-3xl bg-gradient-to-tr from-slate-900 to-rose-950 overflow-hidden border border-white/10 shadow-2xl relative">
              {currentTrack?.cover_art_url ? (
                <img src={currentTrack.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
              ) : (
                <Monitor className="w-14 h-14 text-slate-700" />
              )}
            </div>
            {badge && (
              <span className={`text-[8px] font-extrabold px-3 py-1 rounded-full border uppercase mt-5 tracking-wider ${badge.style}`}>
                {badge.text}
              </span>
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
              {currentTrack && !isAdminMode && (
                <button 
                  onClick={() => toggleFavorite(currentTrack.id)} 
                  className={`w-10 h-10 rounded-full bg-white/5 flex items-center justify-center transition active:scale-90 ${isFav ? 'text-rose-500 bg-rose-500/10' : 'text-slate-450'}`}
                >
                  <Heart className={`w-4.5 h-4.5 ${isFav ? 'fill-current' : ''}`} />
                </button>
              )}
            </div>

            {/* Interactive Progress Slider */}
            <div className="space-y-2">
              <input 
                type="range" 
                min="0"
                max={isRadioSync ? 86400 : (duration || 100)}
                value={isRadioSync ? secondsSinceMidnight : currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                disabled={isRadioSync}
                className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg outline-none cursor-pointer audio-knob"
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold font-sans">
                <span>
                  {isRadioSync ? format24hTime(secondsSinceMidnight) : formatTime(currentTime)}
                </span>
                <span>
                  {isRadioSync ? "24:00:00" : formatTime(duration)}
                </span>
              </div>
            </div>

            {/* Controls Tray */}
            <div className="flex items-center justify-between px-2">
              <button 
                onClick={toggleShuffle} 
                disabled={isRadioSync || isAdminMode}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition active:scale-95 ${isShuffle ? 'text-rose-400 bg-rose-500/5' : 'text-slate-550'} disabled:opacity-30`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button 
                onClick={playPrevious} 
                disabled={isRadioSync || isAdminMode}
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
                disabled={isRadioSync || isAdminMode}
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
                disabled={isRadioSync || isAdminMode}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition relative active:scale-95 ${repeatMode !== 'none' ? 'text-rose-400 bg-rose-500/5' : 'text-slate-550'} disabled:opacity-30`}
              >
                <Repeat className="w-4 h-4" />
                {repeatMode === 'one' && (
                  <span className="absolute top-0.5 right-0.5 text-[8px] bg-rose-500 text-white font-extrabold w-3 h-3 rounded-full flex items-center justify-center font-sans">1</span>
                )}
              </button>
            </div>

            {/* Bottom Volume & Utility Dock */}
            <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-5">
              <div className="flex items-center gap-2 flex-1">
                <button onClick={toggleMute} className="text-slate-450 active:scale-90 transition">
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input 
                  type="range" 
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => adjustVolume(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 h-1 bg-slate-800 rounded-lg outline-none audio-knob"
                />
              </div>

              <div className="flex items-center gap-2.5">
                {!isRadioSync && (
                  <select 
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                    className="bg-slate-900 border border-white/10 rounded-xl text-[9px] font-extrabold px-1.5 py-1 text-slate-300 outline-none cursor-pointer"
                  >
                    <option value="0.75">0.75x</option>
                    <option value="1">1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="2">2.0x</option>
                  </select>
                )}

                <button 
                  onClick={() => { setIsMobileExpanded(false); onToggleQueue(); }}
                  className={`p-1.5 rounded-lg border border-white/5 active:scale-95 transition ${isQueueOpen ? 'text-rose-400 bg-rose-500/10 border-rose-500/10' : 'text-slate-400'}`}
                >
                  <ListMusic className="w-3.5 h-3.5" />
                </button>
                {hasLyrics && !isAdminMode && (
                  <button 
                    onClick={() => { setIsMobileExpanded(false); onToggleLyrics(); }}
                    className={`p-1.5 rounded-lg border border-white/5 active:scale-95 transition ${isLyricsOpen ? 'text-rose-400 bg-rose-500/10 border-rose-500/10' : 'text-slate-400'}`}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
