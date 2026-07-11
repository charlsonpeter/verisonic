import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FolderHeart, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Track } from '../../context/AudioContext';
import { toastError, toastSuccess } from '../../utils/toast';

interface PlaylistOption {
  id: number;
  name: string;
  tracks: { id: number }[];
}

interface AddToPlaylistButtonProps {
  track: Track;
}

export const AddToPlaylistButton: React.FC<AddToPlaylistButtonProps> = ({ track }) => {
  const { token, canUsePlaylists } = useAuth();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const disabled = !canUsePlaylists;

  const authHeaders = (): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const loadPlaylists = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/playlist', { headers: authHeaders() });
      if (res.ok) {
        setPlaylists(await res.json());
      } else {
        setPlaylists([]);
      }
    } catch {
      setPlaylists([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPlaylists([]);
    setOpen(false);
  }, [token]);

  useEffect(() => {
    if (open && !disabled) {
      loadPlaylists();
    }
  }, [open, disabled, token]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

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
        setOpen(false);
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

  const createAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    try {
      const createRes = await fetch('/api/playlist', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, is_public: false }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        toastError(data.detail || 'Could not create playlist.');
        return;
      }
      const created = await createRes.json();
      setNewName('');
      await addToPlaylist(created.id);
      await loadPlaylists();
    } catch {
      toastError('Could not create playlist.');
    } finally {
      setIsCreating(false);
    }
  };

  const rect = buttonRef.current?.getBoundingClientRect();
  const menuStyle: React.CSSProperties = rect
    ? {
        position: 'fixed',
        top: Math.min(rect.bottom + 6, window.innerHeight - 280),
        left: Math.min(rect.right - 224, window.innerWidth - 240),
        width: 224,
        zIndex: 9999,
      }
    : {};

  if (disabled) {
    return null;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(v => !v);
        }}
        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition"
        title="Add to Playlist"
      >
        <FolderHeart className="w-3.5 h-3.5" />
      </button>

      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl p-3 space-y-2 font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">Add to playlist</p>

          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          ) : playlists.length === 0 ? (
            <p className="text-[11px] text-slate-500 px-1 py-2">No playlists yet. Create one below.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto space-y-1">
              {playlists.map((p) => {
                const alreadyIn = p.tracks?.some(t => t.id === track.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={alreadyIn || isAdding === p.id}
                    onClick={() => addToPlaylist(p.id)}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition truncate"
                  >
                    {isAdding === p.id ? 'Adding...' : alreadyIn ? `${p.name} (added)` : p.name}
                  </button>
                );
              })}
            </div>
          )}

          <form onSubmit={createAndAdd} className="flex gap-1.5 pt-1 border-t border-white/5">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New playlist name"
              className="flex-1 min-w-0 bg-slate-950 border border-white/5 rounded-lg px-2.5 py-2 text-[11px] text-slate-200 outline-none focus:border-rose-500/30"
            />
            <button
              type="submit"
              disabled={isCreating || !newName.trim()}
              className="p-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition"
              title="Create and add"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>,
        document.body
      )}
    </>
  );
};
