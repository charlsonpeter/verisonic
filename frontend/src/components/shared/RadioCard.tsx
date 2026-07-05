import React from 'react';
import { Radio, Heart, Users, Play, Pause } from 'lucide-react';
import { useAudio, RadioStation } from '../../context/AudioContext';
import { showError } from '../../utils/swal';

interface RadioCardProps {
  station: RadioStation;
}

export const RadioCard: React.FC<RadioCardProps> = ({ station }) => {
  const { playRadioStation, activeRadioStation, isPlaying, togglePlay } = useAudio();

  const isCurrent = activeRadioStation?.id === station.id;
  const isCurrentlyPlaying = isCurrent && isPlaying;

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (station.is_online === false) {
      showError("Station Offline", "This radio station is currently offline.");
      return;
    }
    if (isCurrent) {
      togglePlay();
    } else {
      playRadioStation(station);
    }
  };

  return (
    <div 
      onClick={() => {
        if (station.is_online === false) {
          showError("Station Offline", "This radio station is currently offline.");
          return;
        }
        playRadioStation(station);
      }}
      className={`glass-card rounded-3xl p-5 border transition duration-300 relative overflow-hidden group cursor-pointer ${
        station.is_online === false
          ? 'opacity-60 hover:opacity-85 border-white/5 bg-slate-900/5'
          : isCurrent 
            ? 'border-rose-500/30 bg-slate-900/30 shadow-lg shadow-rose-500/5' 
            : 'border-white/5 bg-slate-900/10 hover:border-slate-800 hover:bg-slate-900/30'
      }`}
    >
      {/* Background ambient pulse */}
      {isCurrentlyPlaying && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl animate-pulse" />
      )}

      <div className="flex items-start gap-5 relative z-10">
        {/* Station Logo image with hover action overlay */}
        <div className="w-24 h-24 rounded-2xl overflow-hidden border border-white/5 shadow-md shadow-slate-950 flex-shrink-0 relative">
          <img 
            src={station.cover_art_url || 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?auto=format&fit=crop&q=80&w=200'} 
            alt="Logo" 
            className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
          />
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition duration-300">
            <button
              onClick={handlePlayClick}
              className="w-10 h-10 bg-rose-600 text-white rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition duration-300 hover:bg-rose-500 active:scale-95"
            >
              {isCurrentlyPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
          </div>
        </div>

        {/* Station Meta details */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start">
            <h3 className="text-base font-bold text-white mb-1 truncate group-hover:text-rose-400 transition">
              {station.name}
            </h3>
            {station.is_online === false ? (
              <span className="flex items-center gap-1 py-0.5 px-2 bg-slate-500/10 border border-slate-500/20 rounded-full text-[8px] text-slate-400 font-extrabold uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                Offline
              </span>
            ) : station.stream_url?.includes('/live') ? (
              <span className="flex items-center gap-1 py-0.5 px-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[8px] text-emerald-400 font-extrabold uppercase animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Live Broadcast
              </span>
            ) : (
              isCurrent && (
                <span className="flex items-center gap-1 py-0.5 px-2 bg-rose-500/10 border border-rose-500/20 rounded-full text-[8px] text-rose-400 font-extrabold uppercase animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Playing
                </span>
              )
            )}
          </div>
          <p className="text-xs text-slate-400 mb-3 line-clamp-1">{station.description}</p>
          
          {/* Current broadcast status block */}
          <div className="p-3 bg-slate-950/60 rounded-xl border border-white/3 shadow-inner">
            <div className="text-[8px] text-rose-400 font-extrabold uppercase tracking-widest mb-1 flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              On Air Now:
            </div>
            <div className="text-xs font-bold text-slate-200 truncate">
              {station.is_online === false ? 'Offline' : (station.current_track_title || 'Live Program')}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {station.is_online === false ? 'No active broadcast' : `By ${station.current_track_artist || 'Broadcaster'}`}
            </div>
          </div>
        </div>
      </div>

      {/* Footer stats block */}
      <div className="mt-4 pt-3.5 border-t border-white/3 flex items-center justify-between text-[10px] text-slate-500 font-bold">
        <div className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span>{station.is_online === false ? '0' : (station.listeners_count?.toLocaleString() || '1.2K')} tuning in</span>
        </div>
        <span className="bg-slate-900 border border-white/3 text-slate-400 font-bold px-2 py-0.5 rounded-md text-[8px] uppercase">
          {station.category || 'Pop'}
        </span>
      </div>
    </div>
  );
};
