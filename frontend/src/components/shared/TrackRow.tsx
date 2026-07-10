import React from 'react';
import { Play, Plus, Heart, HelpCircle, ShieldCheck, Disc } from 'lucide-react';
import { useAudio, Track } from '../../context/AudioContext';
import { AddToPlaylistButton } from './AddToPlaylistButton';

interface TrackRowProps {
  track: Track;
  index: number;
  onViewReport?: (track: Track) => void;
  onViewDetails?: (track: Track) => void;
}

export const TrackRow: React.FC<TrackRowProps> = ({ track, index, onViewReport, onViewDetails }) => {
  const { playTrack, addToQueue, toggleFavorite, favorites, currentTrack, isPlaying } = useAudio();

  const isCurrent = currentTrack?.id === track.id;
  const isFav = favorites.includes(track.id);

  const formatDuration = (secs: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div 
      className={`group flex items-center justify-between p-3 rounded-2xl border transition duration-200 cursor-pointer ${
        isCurrent 
          ? 'bg-rose-600/10 border-rose-500/20' 
          : 'bg-slate-900/15 border-white/3 hover:border-slate-800 hover:bg-slate-900/40'
      }`}
      onClick={() => playTrack(track)}
    >
      {/* Index and Artwork and Title */}
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <span className="w-6 text-center text-xs font-bold text-slate-500 group-hover:hidden">
          {index + 1}
        </span>
        <button className="w-6 hidden group-hover:flex items-center justify-center text-rose-400" title="Play Track">
          <Play className="w-4 h-4 fill-current" />
        </button>

        {/* Artwork */}
        <div className="w-10 h-10 bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center text-slate-500 border border-white/5 flex-shrink-0">
          {track.cover_art_url ? (
            <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <Disc className="w-5 h-5 text-slate-600" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0">
          <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-rose-400' : 'text-slate-200'}`}>
            {track.title}
          </h4>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{track.artist_name}</p>
        </div>
      </div>

      {/* Album block */}
      <div className="hidden md:block flex-1 px-4 truncate text-xs text-slate-400">
        {track.album_title || 'Single'}
      </div>

      {/* Duration and quick settings */}
      <div className="flex items-center gap-4">
        <span className="text-[10px] text-slate-500 font-bold">
          {formatDuration(track.duration)}
        </span>

        {/* Interactive icons on hover */}
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(track.id);
            }}
            className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-500 transition`}
            title={isFav ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
          
          <button
            onClick={(e) => {
              e.stopPropagation();
              addToQueue(track);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition"
            title="Add to Queue"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <div onClick={(e) => e.stopPropagation()}>
            <AddToPlaylistButton track={track} />
          </div>

          {onViewReport && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewReport(track);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-emerald-400 transition"
              title="Acoustic Report"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
            </button>
          )}

          {onViewDetails && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(track);
              }}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-white transition"
              title="Track Details"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
