import React from 'react';
import { Play, Heart, Users, Trash2, ShieldCheck, Disc, Plus } from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';

interface PlaylistProps {
  onViewReport?: (track: Track) => void;
  onViewDetails: (track: Track) => void;
}

export const Playlist: React.FC<PlaylistProps> = ({ onViewReport, onViewDetails }) => {
  const { playTrack, favorites, playQueue, addToQueue } = useAudio();

  const [playlist, setPlaylist] = React.useState<{
    title: string;
    description: string;
    creator: string;
    cover: string;
    tracks: Track[];
  } | null>(null);

  React.useEffect(() => {
    const fetchFirstPlaylist = async () => {
      try {
        const res = await fetch('/api/playlist');
        if (res.ok) {
          const playlists = await res.json();
          if (playlists.length > 0) {
            const first = playlists[0];
            setPlaylist({
              title: first.name,
              description: "Custom playlist synchronized with the backend database.",
              creator: `User ID: ${first.user_id}`,
              cover: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=300",
              tracks: first.tracks
            });
          }
        }
      } catch (e) {
        console.error("Failed to load playlist:", e);
      }
    };
    fetchFirstPlaylist();
  }, []);

  const handlePlayAll = () => {
    if (playlist && playlist.tracks.length > 0) {
      // Load all playlist tracks to play queue
      playlist.tracks.forEach(track => addToQueue(track));
      playTrack(playlist.tracks[0]);
    }
  };

  if (!playlist) {
    return (
      <div className="text-center py-20 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-8 max-w-xl mx-auto">
        <Disc className="w-12 h-12 text-slate-650 mx-auto mb-4" />
        <h4 className="text-sm font-bold text-slate-350">No playlists available</h4>
        <p className="text-xs text-slate-500 mt-1">Please create a playlist from your dashboard or log in to see custom playlists.</p>
      </div>
    );
  }

  const totalDuration = playlist.tracks.reduce((acc, t) => acc + t.duration, 0);
  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    return `${mins} min`;
  };

  return (
    <div className="space-y-10 w-full">
      {/* 1. PLAYLIST HEADER */}
      <section className="flex flex-col md:flex-row gap-6 items-center md:items-end">
        <div className="w-48 h-48 bg-slate-900 border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0">
          <img src={playlist.cover} alt="Cover" className="w-full h-full object-cover" />
        </div>
        <div className="text-center md:text-left space-y-3 flex-1 min-w-0">
          <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-widest">
            Editorial Playlist
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-gradient-premium tracking-tight leading-tight">
            {playlist.title}
          </h1>
          <p className="text-xs text-slate-400 font-medium leading-relaxed max-w-2xl">
            {playlist.description}
          </p>
          <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-slate-400 font-bold">
            <span className="text-slate-300">{playlist.creator}</span>
            <span>•</span>
            <span>{playlist.tracks.length} Songs</span>
            <span>•</span>
            <span>{formatDuration(totalDuration)} total time</span>
          </div>
        </div>
      </section>

      {/* 2. PLAYLIST ACTIONS */}
      <section className="flex gap-4 items-center">
        <button
          onClick={handlePlayAll}
          className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/10 transition"
        >
          <Play className="w-4 h-4 fill-current" />
          Play Collection
        </button>
        <button
          className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-slate-400 hover:text-white transition"
          title="Save Playlist"
        >
          <Heart className="w-4 h-4" />
        </button>
      </section>

      {/* 3. TRACKLIST TABLE */}
      <section className="space-y-4">
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-bold uppercase tracking-wider px-3 pb-2 border-b border-white/3">
          <div className="flex items-center gap-4 flex-1">
            <span># Title</span>
          </div>
          <div className="hidden md:block flex-1 px-4">Album</div>
          <div className="hidden sm:block px-4">Specs</div>
          <div>Duration</div>
        </div>

        <div className="space-y-2">
          {playlist.tracks.map((track, idx) => (
            <TrackRow 
              key={track.id} 
              track={track} 
              index={idx}
              onViewReport={onViewReport}
              onViewDetails={onViewDetails}
            />
          ))}
        </div>
      </section>

    </div>
  );
};
