import React, { useState, useEffect } from 'react';
import { 
  Play, Heart, Share2, Music, AlignLeft, Disc,
  MessageSquare, Send
} from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { formatLocalDateTime } from '../utils/dateTime';

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

function buildTrackMetadata(track: Track): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  const add = (label: string, value?: string | number | null) => {
    if (value === null || value === undefined) return;
    const text = typeof value === 'string' ? value.trim() : String(value);
    if (!text) return;
    rows.push({ label, value: text });
  };

  add('Album', track.album_title);
  add('Year', track.year);
  add('Composer', track.composer);
  add('Lyricist', track.lyricist);
  add('Language', track.language);

  if (track.duration && track.duration > 0) {
    rows.push({ label: 'Duration', value: formatDuration(track.duration) });
  }

  if (track.genres?.length) {
    rows.push({ label: 'Genres', value: track.genres.join(', ') });
  }

  return rows;
}

export const MusicDetails: React.FC<MusicDetailsProps> = ({ track, onNavigate, onArtistClick }) => {
  const { playTrack, favorites, toggleFavorite } = useAudio();
  const { currentUser, token } = useAuth();

  interface CommentItem {
    id: number;
    author_name?: string | null;
    body: string;
    created_at: string;
  }

  const [comments, setComments] = useState<CommentItem[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    if (!track?.id) {
      setComments([]);
      return;
    }
    const loadComments = async () => {
      setIsLoadingComments(true);
      try {
        const res = await fetch(`/api/music/${track.id}/comments`);
        if (res.ok) {
          setComments(await res.json());
        }
      } catch {
        setComments([]);
      } finally {
        setIsLoadingComments(false);
      }
    };
    void loadComments();
  }, [track?.id]);

  if (!track) {
    return (
      <div className="text-center py-20">
        <Music className="w-12 h-12 text-slate-500 mx-auto mb-4 animate-bounce" />
        <h3 className="text-slate-355 font-bold text-sm">No track selected</h3>
        <button onClick={() => onNavigate('home')} className="mt-4 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-xs font-bold rounded-xl transition">
          Return to Home
        </button>
      </div>
    );
  }

  const isFav = favorites.includes(track.id);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !token) return;
    setIsPostingComment(true);
    try {
      const res = await fetch(`/api/music/${track.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: newComment.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setComments((prev) => [created, ...prev]);
        setNewComment('');
      }
    } finally {
      setIsPostingComment(false);
    }
  };

  const formatCommentTime = (value: string) => formatLocalDateTime(value) || value;

  const metadataRows = buildTrackMetadata(track);

  const detailCardClass =
    'bg-slate-900/20 border border-white/5 p-6 rounded-3xl h-full flex flex-col gap-4 min-h-[320px]';
  const detailCardHeaderClass =
    'text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 shrink-0';

  return (
    <div className="space-y-10 w-full overflow-x-hidden">
      
      <section className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start">
        <div className="w-48 h-48 sm:w-56 sm:h-56 bg-slate-900 border border-white/5 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0 relative group">
          <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
            <button 
              onClick={() => playTrack(track)}
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
              {track.title}
            </h1>
            <p className="text-sm text-slate-350 font-bold">
              Artist:{' '}
              <button
                type="button"
                onClick={() => onArtistClick?.(track.artist_name)}
                className="text-slate-100 hover:text-rose-400 transition underline-offset-2 hover:underline"
              >
                {track.artist_name}
              </button>
            </p>
            {track.album_title && (
              <p className="text-xs text-slate-450 font-semibold">Album: {track.album_title}</p>
            )}
          </div>

          <div className="flex gap-3 items-center justify-center sm:justify-start">
            <button
              onClick={() => playTrack(track)}
              className="px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-rose-600/25 transition"
            >
              <Play className="w-4 h-4 fill-current" />
              Play
            </button>
            <button
              onClick={() => toggleFavorite(track.id)}
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
              {track.lyrics ? track.lyrics : (
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

        <form onSubmit={handleAddComment} className="flex gap-3 items-center bg-slate-950 border border-white/5 rounded-2xl p-2.5">
          <input
            type="text"
            placeholder={token ? 'Share your thoughts...' : 'Log in to comment'}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            disabled={!token || isPostingComment}
            className="bg-transparent text-xs text-slate-200 outline-none w-full px-3 placeholder-slate-500 disabled:opacity-50"
          />
          <button 
            type="submit"
            disabled={!token || isPostingComment}
            className="p-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl transition flex-shrink-0"
            title="Post Comment"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        <div className="space-y-3">
          {isLoadingComments ? (
            <p className="text-xs text-slate-500">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500">No comments yet. Be the first to share your thoughts.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="bg-slate-900/25 border border-white/5 rounded-2xl px-4 py-3 space-y-2">
                <div className="flex justify-between items-center gap-3 text-[10px] font-bold">
                  <span className="text-slate-200 truncate">{c.author_name || 'Listener'}</span>
                  <span className="text-slate-500 flex-shrink-0">{formatCommentTime(c.created_at)}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">{c.body}</p>
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
};
