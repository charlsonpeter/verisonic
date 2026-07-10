import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Play,
  Plus,
  Heart,
  HelpCircle,
  Disc,
  Trash2,
  MoreVertical,
  FolderHeart,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio, Track } from '../../context/AudioContext';
import { AddToPlaylistButton } from './AddToPlaylistButton';
import { toastError, toastSuccess } from '../../utils/toast';

interface TrackRowProps {
  track: Track;
  index: number;
  onViewDetails?: (track: Track) => void;
  onRemove?: () => void;
}

interface PlaylistOption {
  id: number;
  name: string;
  tracks: { id: number }[];
}

interface MobileTrackMenuProps {
  track: Track;
  isFav: boolean;
  isInQueue: boolean;
  onViewDetails?: (track: Track) => void;
  onRemove?: () => void;
  onToggleFavorite: () => void;
  onAddToQueue: () => void;
}

const MobileTrackMenu: React.FC<MobileTrackMenuProps> = ({
  track,
  isFav,
  isInQueue,
  onViewDetails,
  onRemove,
  onToggleFavorite,
  onAddToQueue,
}) => {
  const { token, canUsePlaylists } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [isAdding, setIsAdding] = useState<number | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const authHeaders = (): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const loadPlaylists = async () => {
    if (!token) return;
    setIsLoadingPlaylists(true);
    try {
      const res = await fetch('/api/playlist', { headers: authHeaders() });
      setPlaylists(res.ok ? await res.json() : []);
    } catch {
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  useEffect(() => {
    setOpen(false);
    setView('main');
    setPlaylists([]);
  }, [token]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setView('main');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    setView('main');
  };

  const addToPlaylist = async (playlistId: number) => {
    setIsAdding(playlistId);
    try {
      const res = await fetch(`/api/playlist/${playlistId}/track`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ track_id: track.id }),
      });
      if (res.ok) {
        const updated = await res.json();
        setPlaylists(prev => prev.map(p => (p.id === playlistId ? updated : p)));
        toastSuccess(`Added to "${updated.name}"`);
        closeMenu();
      } else {
        const data = await res.json().catch(() => ({}));
        toastError(data.detail || 'Could not add track.');
      }
    } catch {
      toastError('Could not add track.');
    } finally {
      setIsAdding(null);
    }
  };

  const openPlaylists = () => {
    setView('playlists');
    loadPlaylists();
  };

  const rect = buttonRef.current?.getBoundingClientRect();
  const menuStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.min(rect.bottom + 6, window.innerHeight - 320),
        right: Math.max(12, window.innerWidth - rect.right),
        width: 220,
        zIndex: 9999,
      }
    : {};

  const menuItemClass =
    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition text-left';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
          if (open) setView('main');
        }}
        className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition flex-shrink-0"
        aria-label="Track options"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-2 font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {view === 'main' ? (
            <div className="space-y-0.5">
              <button type="button" className={menuItemClass} onClick={() => { onToggleFavorite(); closeMenu(); }}>
                <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
                {isFav ? 'Remove from favorites' : 'Add to favorites'}
              </button>
              <button
                type="button"
                className={menuItemClass}
                disabled={isInQueue}
                onClick={() => { if (!isInQueue) { onAddToQueue(); closeMenu(); } }}
              >
                <Plus className="w-3.5 h-3.5" />
                {isInQueue ? 'Already in queue' : 'Add to queue'}
              </button>
              {canUsePlaylists && (
                <button type="button" className={menuItemClass} onClick={openPlaylists}>
                  <FolderHeart className="w-3.5 h-3.5 text-rose-400" /> Add to playlist
                </button>
              )}
              {onViewDetails && (
                <button
                  type="button"
                  className={menuItemClass}
                  onClick={() => { onViewDetails(track); closeMenu(); }}
                >
                  <HelpCircle className="w-3.5 h-3.5" /> Track details
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  className={`${menuItemClass} text-rose-400 hover:text-rose-300`}
                  onClick={() => { onRemove(); closeMenu(); }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove from playlist
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <button
                type="button"
                className={`${menuItemClass} text-slate-400`}
                onClick={() => setView('main')}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 pt-1">
                Add to playlist
              </p>
              {isLoadingPlaylists ? (
                <div className="flex justify-center py-6 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : playlists.length === 0 ? (
                <p className="text-[11px] text-slate-500 px-3 py-3">No playlists yet.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {playlists.map((p) => {
                    const alreadyIn = p.tracks?.some(t => t.id === track.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={alreadyIn || isAdding === p.id}
                        className={menuItemClass}
                        onClick={() => addToPlaylist(p.id)}
                      >
                        <span className="truncate">
                          {isAdding === p.id ? 'Adding...' : alreadyIn ? `${p.name} (added)` : p.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
};

export const TrackRow: React.FC<TrackRowProps> = ({ track, index, onViewDetails, onRemove }) => {
  const { playTrack, addToQueue, toggleFavorite, favorites, currentTrack, playQueue } = useAudio();

  const isCurrent = currentTrack?.id === track.id;
  const isFav = favorites.includes(track.id);
  const isInQueue = playQueue.some(t => t.id === track.id);

  const formatDuration = (secs: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className={`group flex items-center gap-2 p-3 rounded-2xl border transition duration-200 cursor-pointer ${
        isCurrent
          ? 'bg-rose-600/10 border-rose-500/20'
          : 'bg-slate-900/15 border-white/3 hover:border-slate-800 hover:bg-slate-900/40'
      }`}
      onClick={() => playTrack(track)}
    >
      {/* Index, artwork, title */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="w-5 md:w-6 flex-shrink-0 text-center text-xs font-bold text-slate-500 md:group-hover:hidden">
          {index + 1}
        </span>
        <button
          type="button"
          className="w-6 hidden md:group-hover:flex items-center justify-center text-rose-400 flex-shrink-0"
          title="Play Track"
        >
          <Play className="w-4 h-4 fill-current" />
        </button>

        <div className="w-10 h-10 bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center text-slate-500 border border-white/5 flex-shrink-0">
          {track.cover_art_url ? (
            <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
          ) : (
            <Disc className="w-5 h-5 text-slate-600" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-rose-400' : 'text-slate-200'}`}>
            {track.title}
          </h4>
          <p className="text-[10px] text-slate-400 truncate mt-0.5">{track.artist_name}</p>
        </div>
      </div>

      {/* Album — desktop only */}
      <div className="hidden md:block flex-1 px-4 truncate text-xs text-slate-400 min-w-0">
        {track.album_title || 'Single'}
      </div>

      {/* Mobile: duration + overflow menu */}
      <div className="flex md:hidden items-center gap-1 flex-shrink-0">
        <span className="text-[10px] text-slate-500 font-bold tabular-nums whitespace-nowrap">
          {formatDuration(track.duration)}
        </span>
        <MobileTrackMenu
          track={track}
          isFav={isFav}
          isInQueue={isInQueue}
          onViewDetails={onViewDetails}
          onRemove={onRemove}
          onToggleFavorite={() => toggleFavorite(track.id)}
          onAddToQueue={() => addToQueue(track)}
        />
      </div>

      {/* Desktop: duration + hover actions */}
      <div className="hidden md:flex items-center gap-4 flex-shrink-0">
        <span className="text-[10px] text-slate-500 font-bold tabular-nums">
          {formatDuration(track.duration)}
        </span>

        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(track.id);
            }}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-500 transition"
            title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
          >
            <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isInQueue) addToQueue(track);
            }}
            disabled={isInQueue}
            className={`p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition ${
              isInQueue ? 'opacity-40 cursor-default hover:text-slate-500' : ''
            }`}
            title={isInQueue ? 'Already in queue' : 'Add to Queue'}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <div onClick={(e) => e.stopPropagation()}>
            {!onRemove && <AddToPlaylistButton track={track} />}
          </div>

          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition"
              title="Remove from playlist"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {onViewDetails && (
            <button
              type="button"
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
