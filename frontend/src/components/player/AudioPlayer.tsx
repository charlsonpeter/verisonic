import React from 'react';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, 
  Volume2, VolumeX, ListMusic, Heart, CheckCircle2, Crown, Maximize2, Monitor, AlignLeft
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

  const { userMode, currentUser } = useAuth();
  const isAdminMode = userMode === 'admin' && currentUser && ['admin', 'radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role);
  const isOffline = activeRadioStation && activeRadioStation.is_active === false;

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
    if (activeRadioStation) return { text: "LIVE STREAM", style: "bg-rose-500/10 text-rose-400 border-rose-500/20" };
    return null;
  };

  const badge = getQualityBadge();

  return (
    <footer className={`fixed ${activeTab !== 'landing' ? 'bottom-[76px] md:bottom-6' : 'bottom-6'} left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:max-w-6xl h-20 md:h-24 floating-deck rounded-2xl md:rounded-3xl flex items-center justify-between px-4 md:px-6 z-30 transition-all duration-300`}>
      {/* Thin top progress line for mobile */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/5 rounded-t-2xl md:hidden overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-100" 
          style={{ width: isRadioSync ? `${(secondsSinceMidnight / 86400) * 100}%` : `${(currentTime / (duration || 1)) * 100}%` }}
        />
      </div>

      {/* Background artwork blur effect */}
      {currentTrack?.cover_art_url && (
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-5 filter blur-3xl pointer-events-none rounded-2xl md:rounded-3xl -z-10" 
          style={{ backgroundImage: `url(${currentTrack.cover_art_url})` }}
        />
      )}

      {/* Meta Track details */}
      <div className="flex items-center gap-3 md:gap-4 w-full md:w-80 min-w-0">
        <div className="w-12 h-12 md:w-14 md:h-14 bg-gradient-to-tr from-slate-900 to-rose-900 rounded-xl overflow-hidden flex items-center justify-center border border-white/5 shadow-md flex-shrink-0">
          {currentTrack?.cover_art_url ? (
            <img src={currentTrack.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <Monitor className="w-5 h-5 md:w-6 md:h-6 text-slate-500" />
          )}
        </div>
        <div className="min-w-0 flex-1 md:flex-none">
          <div className="flex items-center gap-1.5">
            <h4 className="font-bold text-white text-xs md:text-sm truncate max-w-[120px] md:max-w-[150px]">
              {activeRadioStation ? getRadioDisplayInfo()?.title : currentTrack?.title}
            </h4>
            {currentTrack && !isAdminMode && (
              <button 
                onClick={() => toggleFavorite(currentTrack.id)} 
                className={`flex-shrink-0 transition ${isFav ? 'text-rose-500 scale-110' : 'text-slate-500 hover:text-slate-350'}`}
                title={isFav ? "Remove from Favorites" : "Add to Favorites"}
              >
                <Heart className={`w-3.5 h-3.5 md:w-4 md:h-4 ${isFav ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
          <p className="text-[10px] md:text-xs text-slate-400 truncate max-w-[120px] md:max-w-[180px]">
            {activeRadioStation ? getRadioDisplayInfo()?.subtitle : currentTrack?.artist_name}
          </p>
          {badge && (
            <span className={`inline-block text-[8px] md:text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border mt-0.5 md:mt-1 uppercase ${badge.style}`}>
              {badge.text}
            </span>
          )}
        </div>
      </div>

      {/* Primary media controls */}
      <div className="hidden md:flex flex-col items-center gap-2.5 flex-1 max-w-2xl px-4">
        <div className="flex items-center gap-6">
          {/* Shuffle button */}
          <button 
            onClick={toggleShuffle} 
            disabled={isRadioSync || isAdminMode}
            className={`transition ${isShuffle ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-350'} disabled:opacity-30`}
            title="Shuffle Queue"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          {/* Previous song */}
          <button 
            onClick={playPrevious} 
            disabled={isRadioSync || isAdminMode}
            className="text-slate-400 hover:text-white transition disabled:opacity-30"
            title="Previous"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            disabled={isOffline}
            className="w-11 h-11 bg-white hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none active:scale-95 rounded-full flex items-center justify-center text-slate-950 font-bold shadow-md hover:shadow-rose-500/10 transition-all duration-305"
            title={isOffline ? "Station Offline" : isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current text-slate-950" /> : <Play className="w-5 h-5 fill-current text-slate-950 ml-0.5" />}
          </button>

          {/* Next song */}
          <button 
            onClick={playNext} 
            disabled={isRadioSync || isAdminMode}
            className="text-slate-400 hover:text-white transition disabled:opacity-30"
            title="Next"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          {/* Repeat mode toggler */}
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

        {/* Media progress bar */}
        <div className="w-full flex items-center gap-3 text-[10px] text-slate-500 font-bold font-sans">
          <span>{isRadioSync ? format24hTime(secondsSinceMidnight) : formatTime(currentTime)}</span>
          <input 
            type="range" 
            min="0"
            max={isRadioSync ? 86400 : (duration || 100)}
            value={isRadioSync ? secondsSinceMidnight : currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            disabled={isRadioSync}
            className="w-full accent-rose-500 h-1 bg-slate-800 rounded-lg outline-none cursor-pointer audio-knob"
          />
          <span>{isRadioSync ? "24:00:00" : formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume / Auxiliary layout controls */}
      <div className="hidden md:flex items-center gap-6 w-80 justify-end">
        {/* Equalizer animation */}
        <Equalizer />

        {/* Playback speed toggle */}
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

        {/* Volume controls */}
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

        {/* Toggle Stack (Now Playing top, Lyrics bottom) */}
        <div className="flex flex-col gap-1.5 items-center justify-center border-l border-white/5 pl-4 ml-2">
          {/* Right drawer toggle */}
          <button 
            onClick={onToggleQueue}
            className={`transition ${isQueueOpen ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
            title="Now Playing"
          >
            <ListMusic className="w-[18px] h-[18px]" />
          </button>

          {/* Lyrics toggle */}
          {hasLyrics && !isAdminMode && (
            <button 
              onClick={onToggleLyrics}
              className={`transition ${isLyricsOpen ? 'text-rose-400 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
              title="Lyrics"
            >
              <AlignLeft className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile controls (play/pause and toggle stack) */}
      <div className="flex md:hidden items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={isOffline}
          className="w-10 h-10 bg-white hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none active:scale-95 rounded-full flex items-center justify-center text-slate-950 font-bold shadow-md transition"
          title={isOffline ? "Station Offline" : isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-4 h-4 fill-current text-slate-950" /> : <Play className="w-4 h-4 fill-current text-slate-950 ml-0.5" />}
        </button>
        
        {/* Toggle Stack (Now Playing top, Lyrics bottom) */}
        <div className="flex flex-col gap-1 items-center justify-center bg-slate-900/40 border border-white/5 rounded-xl p-1">
          <button 
            onClick={onToggleQueue}
            className={`transition p-1 rounded-lg ${isQueueOpen ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'}`}
            title="Now Playing"
          >
            <ListMusic className="w-[18px] h-[18px]" />
          </button>
          {hasLyrics && !isAdminMode && (
            <button 
              onClick={onToggleLyrics}
              className={`transition p-1 rounded-lg ${isLyricsOpen ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'}`}
              title="Lyrics"
            >
              <AlignLeft className="w-[18px] h-[18px]" />
            </button>
          )}
        </div>
      </div>
    </footer>
  );
};
