import React, { useState, useEffect } from 'react';
import { 
  Play, Heart, Share2, Music, AlignLeft, Disc,
  MessageSquare
} from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { CommentThread } from '../components/shared/CommentThread';

interface MusicDetailsProps {
  track: Track | null;
  onNavigate: (tab: string) => void;
  onArtistClick?: (artistName: string) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function normalizeGenreTags(genres?: Array<string | { name?: string }> | null): string[] {
  if (!genres?.length) return [];
  return genres
    .map((g) => (typeof g === 'string' ? g : g?.name || ''))
    .map((g) => g.trim())
    .filter(Boolean);
}

function buildTrackMetadata(track: Track): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  const add = (label: string, value?: string | number | null) => {
    if (value === null || value === undefined) return;
    const text = typeof value === 'string' ? value.trim() : String(value);
    if (!text) return;
    rows.push({ label, value: text });
  };

  add('Album', track.album_title);
  add('Album Artist', track.album_artist);
  add('Track #', track.track_number);
  add('Year', track.year);
  add('Composer', track.composer);
  add('Lyricist', track.lyricist);
  add('Language', track.language);
  add('Copyright', track.copyright);
  add('Comment', track.comment);

  if (track.duration && track.duration > 0) {
    rows.push({ label: 'Duration', value: formatDuration(track.duration) });
  }

  return rows;
}

export const MusicDetails: React.FC<MusicDetailsProps> = ({ track, onNavigate, onArtistClick }) => {
  const { playTrack, favorites, toggleFavorite } = useAudio();
  const { token } = useAuth();

  const [resolvedTrack, setResolvedTrack] = useState<Track | null>(track);
  const [isLoadingTrack, setIsLoadingTrack] = useState(false);

  useEffect(() => {
    if (track) {
      setResolvedTrack(track);
      setIsLoadingTrack(false);
      return;
    }

    const savedId = sessionStorage.getItem('selectedDetailsTrackId');
    if (!savedId) {
      setResolvedTrack(null);
      setIsLoadingTrack(false);
      return;
    }

    let cancelled = false;
    setIsLoadingTrack(true);
    (async () => {
      try {
        const res = await fetch(`/api/music/${savedId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        if (!cancelled) setResolvedTrack(data);
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem('selectedDetailsTrackId');
          setResolvedTrack(null);
        }
      } finally {
        if (!cancelled) setIsLoadingTrack(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track, token]);

  useEffect(() => {
    if (isLoadingTrack) return;
    if (!resolvedTrack) {
      onNavigate('home');
    }
  }, [isLoadingTrack, resolvedTrack, onNavigate]);

  if (isLoadingTrack || !resolvedTrack) {
    return (
      <div className="text-center py-20">
        <Music className="w-12 h-12 text-slate-500 mx-auto mb-4 animate-pulse" />
        <h3 className="text-slate-355 font-bold text-sm">
          {isLoadingTrack ? 'Loading track…' : 'Returning to library…'}
        </h3>
      </div>
    );
  }

  const displayTrack = resolvedTrack;
  const genreTags = normalizeGenreTags(displayTrack.genres);
  const isFav = favorites.includes(displayTrack.id);

  const metadataRows = buildTrackMetadata(displayTrack);

  const detailCardClass =
    'bg-slate-900/20 border border-white/5 p-6 rounded-3xl h-full flex flex-col gap-4 min-h-[320px]';
  const detailCardHeaderClass =
    'text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 shrink-0';

  return (
    <div className="space-y-10 w-full overflow-x-hidden">
      
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
        <div className="w-48 h-48 sm:w-56 sm:h-56 bg-slate-900 border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0 relative group">
          <img src={displayTrack.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <button 
              onClick={() => playTrack(displayTrack)}
              className="w-12 h-12 bg-white text-slate-950 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition"
              title="Play"
            >
              <Play className="w-5 h-5 fill-current ml-0.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full text-center sm:text-left space-y-5">
          <div className="space-y-2">
            <h1 className="hidden md:block text-3xl sm:text-4xl md:text-5xl font-extrabold text-gradient-premium tracking-tight leading-tight">
              {displayTrack.title}
            </h1>
            <p className="text-sm text-slate-350 font-bold">
              Artist:{' '}
              <button
                type="button"
                onClick={() => onArtistClick?.(displayTrack.artist_name)}
                className="text-slate-100 hover:text-rose-400 transition underline-offset-2 hover:underline"
              >
                {displayTrack.artist_name}
              </button>
            </p>
            {displayTrack.album_title && (
              <p className="text-xs text-slate-450 font-semibold">Album: {displayTrack.album_title}</p>
            )}
            {genreTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center sm:justify-start pt-1">
                {genreTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 items-center justify-center sm:justify-start">
            <button
              onClick={() => playTrack(displayTrack)}
              className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition"
            >
              <Play className="w-4 h-4 fill-current" />
              Play
            </button>
            <button
              onClick={() => toggleFavorite(displayTrack.id)}
              className={`p-3 bg-slate-900 border border-white/5 rounded-xl transition ${
                isFav ? 'text-rose-500 hover:text-rose-455' : 'text-slate-400 hover:text-white'
              }`}
              title={isFav ? "Remove from Favorites" : "Add to Favorites"}
            >
              <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
            </button>
            <button
              className="p-3 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-white transition"
              title="Share Link"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch">
        <div className="lg:col-span-5 flex">
          <div className={`${detailCardClass} w-full`}>
            <h3 className={detailCardHeaderClass}>
              <Disc className="w-4 h-4" /> Track Info
            </h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs flex-1 content-start font-sans">
              {metadataRows.length > 0 ? (
                metadataRows.map(({ label, value }) => (
                  <div key={label} className="space-y-1">
                    <dt className="text-[10px] text-slate-500 font-bold uppercase">{label}</dt>
                    <dd className="font-semibold text-slate-200 truncate" title={value}>{value}</dd>
                  </div>
                ))
              ) : (
                <p className="col-span-2 text-xs text-slate-500 italic">
                  No additional track information available.
                </p>
              )}
            </dl>
          </div>
        </div>

        <div className="lg:col-span-7 flex">
          <div className={`${detailCardClass} w-full`}>
            <h3 className={detailCardHeaderClass}>
              <AlignLeft className="w-4 h-4" /> Lyrics
            </h3>
            <div className="flex-1 min-h-0 text-xs font-medium text-slate-350 leading-relaxed whitespace-pre-line overflow-y-auto">
              {displayTrack.lyrics ? displayTrack.lyrics : (
                <p className="text-slate-500 italic">Lyrics not available for this track.</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-900/15 border border-white/5 p-6 rounded-3xl space-y-6">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-rose-400" /> Comments
        </h3>
        <CommentThread trackId={displayTrack.id} />
      </section>

    </div>
  );
};
