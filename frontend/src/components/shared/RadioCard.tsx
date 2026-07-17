import React from 'react';
import { Radio, Play, Pause, MapPin } from 'lucide-react';
import { useAudio, RadioStation } from '../../context/AudioContext';
import { showError } from '../../utils/swal';

interface RadioCardProps {
  station: RadioStation;
}

const handleStationPlay = (
  station: RadioStation,
  isCurrent: boolean,
  playRadioStation: (s: RadioStation) => void,
  togglePlay: () => void,
) => {
  if (station.is_online === false) {
    showError('Station Offline', 'This radio station is currently offline.');
    return;
  }
  if (isCurrent) {
    togglePlay();
  } else {
    playRadioStation(station);
  }
};

const formatStationLocation = (station: RadioStation) => {
  if (station.city) {
    return `${station.city}${station.country ? `, ${station.country}` : ''}`;
  }
  return null;
};

export const RadioTile: React.FC<RadioCardProps> = ({ station }) => {
  const { playRadioStation, activeRadioStation, isPlaying, togglePlay } = useAudio();

  const isCurrent = activeRadioStation?.id === station.id;
  const isCurrentlyPlaying = isCurrent && isPlaying;
  const isLive = station.is_online !== false && !!station.stream_url?.includes('/live');
  const isOffline = station.is_online === false;
  const location = formatStationLocation(station);

  return (
    <button
      type="button"
      onClick={() => handleStationPlay(station, isCurrent, playRadioStation, togglePlay)}
      className={`text-left group active:scale-[0.98] transition flex-shrink-0 w-[6.75rem] flex flex-col ${
        isOffline ? 'opacity-60' : ''
      }`}
    >
      <div
        className={`relative w-full aspect-square rounded-xl overflow-hidden bg-slate-800 mb-1.5 flex-shrink-0 ${
          isCurrent ? 'ring-2 ring-rose-500/50' : ''
        }`}
      >
        <img
          src={
            station.cover_art_url ||
            'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?auto=format&fit=crop&q=80&w=200'
          }
          alt=""
          className="w-full h-full object-cover"
        />
        {isOffline ? (
          <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
            <span className="text-[8px] font-bold uppercase text-slate-400">Offline</span>
          </div>
        ) : (
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-active:opacity-100 flex items-center justify-center transition">
            {isCurrentlyPlaying ? (
              <Pause className="w-5 h-5 text-white fill-current" />
            ) : (
              <Play className="w-5 h-5 text-white fill-current ml-0.5" />
            )}
          </div>
        )}
        {isLive && (
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse ring-2 ring-slate-950/80" />
        )}
      </div>
      <div className="w-full min-w-0">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1 w-full h-[14px] min-w-0">
          <span
            className="text-[10px] font-bold text-slate-200 truncate leading-none min-w-0"
            title={station.name}
          >
            {station.name}
          </span>
          {station.broadcast_frequency && (
            <span
              className="text-[9px] text-slate-500 font-semibold tabular-nums leading-none text-right max-w-[2.25rem] truncate shrink-0"
              title={station.broadcast_frequency}
            >
              {station.broadcast_frequency}
            </span>
          )}
        </div>
        <p
          className="text-[9px] text-slate-400 truncate h-[13px] leading-[13px] mt-0.5 w-full min-w-0"
          title={location || undefined}
        >
          {location || '\u00A0'}
        </p>
      </div>
    </button>
  );
};

export const RadioCard: React.FC<RadioCardProps> = ({ station }) => {
  const { playRadioStation, activeRadioStation, isPlaying, togglePlay } = useAudio();

  const isCurrent = activeRadioStation?.id === station.id;
  const isCurrentlyPlaying = isCurrent && isPlaying;
  const isLive = station.is_online !== false && !!station.stream_url?.includes('/live');

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleStationPlay(station, isCurrent, playRadioStation, togglePlay);
  };

  return (
    <div 
      onClick={() => handleStationPlay(station, isCurrent, playRadioStation, togglePlay)}
      className={`md:glass-card max-md:bg-slate-900 rounded-3xl p-5 border transition duration-300 relative overflow-hidden group cursor-pointer ${
        station.is_online === false
          ? 'opacity-60 hover:opacity-85 border-white/5 bg-slate-900/5'
          : isCurrent 
            ? 'border-rose-500/30 bg-slate-900/30 shadow-lg shadow-rose-500/5' 
            : 'border-white/5 bg-slate-900/10 hover:border-slate-800 hover:bg-slate-900/30'
      }`}
    >
      {/* Background ambient pulse — desktop only; blur animates poorly on mobile */}
      {isCurrentlyPlaying && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl animate-pulse max-md:hidden" />
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
          
          {isLive && (
            <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 shadow-inner">
              <div className="text-[8px] text-rose-400 font-extrabold uppercase tracking-widest mb-1 flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                On Air Now:
              </div>
              <div className="text-xs font-bold text-slate-200 truncate">
                {station.current_track_title || 'Live Program'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                By {station.current_track_artist || 'Broadcaster'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 mt-4 pt-3.5 border-t border-white/5 flex items-center justify-between gap-3 text-[10px] text-slate-500 font-bold">
        <div className="flex items-center gap-1.5 min-w-0 text-slate-400 font-semibold">
          <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          <span className="truncate">
            {formatStationLocation(station) || 'No location set'}
          </span>
        </div>
        {station.broadcast_frequency && (
          <span className="bg-slate-900 border border-white/5 text-slate-400 font-bold px-2 py-0.5 rounded-md text-[8px] uppercase flex-shrink-0">
            {station.broadcast_frequency}
          </span>
        )}
      </div>
    </div>
  );
};

export const RadioSearchRow: React.FC<RadioCardProps> = ({ station }) => {
  const { playRadioStation, activeRadioStation, isPlaying, togglePlay } = useAudio();

  const isCurrent = activeRadioStation?.id === station.id;
  const isCurrentlyPlaying = isCurrent && isPlaying;
  const location = formatStationLocation(station);
  const subtitle = [station.broadcast_frequency, location].filter(Boolean).join(' · ') || 'Radio station';

  const onPlay = () => {
    handleStationPlay(station, isCurrent, playRadioStation, togglePlay);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPlay}
        className="flex-1 flex items-center gap-4 p-3 rounded-xl hover:bg-slate-900/40 transition text-left min-w-0"
      >
        {station.cover_art_url ? (
          <img
            src={station.cover_art_url}
            alt=""
            className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-rose-400" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-bold text-slate-200 truncate">{station.name}</h4>
          <p className="text-[10px] text-slate-500 truncate mt-0.5">{subtitle}</p>
        </div>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onPlay();
        }}
        title={isCurrentlyPlaying ? 'Pause' : 'Play station'}
        aria-label={isCurrentlyPlaying ? 'Pause station' : 'Play station'}
        className="p-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 transition flex-shrink-0"
      >
        {isCurrentlyPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current" />
        )}
      </button>
    </div>
  );
};
