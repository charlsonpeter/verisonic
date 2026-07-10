import React, { useCallback, useEffect, useState } from 'react';
import { Play, Disc, Plus, Trash2, FolderHeart, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';
import { showConfirm, showError, showSuccess } from '../utils/swal';

interface PlaylistData {
  id: number;
  name: string;
  user_id: number;
  is_public: boolean;
  tracks: Track[];
}

interface PlaylistProps {
  onViewReport?: (track: Track) => void;
  onViewDetails: (track: Track) => void;
}

export const Playlist: React.FC<PlaylistProps> = ({ onViewReport, onViewDetails }) => {
  const { token, canUsePlaylists, isStaffInAdminMode } = useAuth();
  const { playTrack, addToQueue } = useAudio();

  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const authHeaders = useCallback((): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const fetchPlaylists = useCallback(async () => {
    if (!token) {
      setPlaylists([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/playlist', { headers: authHeaders() });
      if (res.ok) {
        const data: PlaylistData[] = await res.json();
        setPlaylists(data);
        setSelectedId(prev => {
          if (prev && data.some(p => p.id === prev)) return prev;
          return data.length > 0 ? data[0].id : null;
        });
      } else {
        setPlaylists([]);
        setSelectedId(null);
      }
    } catch {
      setPlaylists([]);
      setSelectedId(null);
    } finally {
      setIsLoading(false);
    }
  }, [token, authHeaders]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  const selected = playlists.find(p => p.id === selectedId) || null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name || !token) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, is_public: true }),
      });
      if (res.ok) {
        const created: PlaylistData = await res.json();
        setNewPlaylistName('');
        await fetchPlaylists();
        setSelectedId(created.id);
        showSuccess('Playlist created', `"${created.name}" is ready.`);
      } else {
        const data = await res.json().catch(() => ({}));
        showError('Create failed', data.detail || 'Could not create playlist.');
      }
    } catch {
      showError('Create failed', 'Network error.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!selected || !token) return;
    const confirmed = await showConfirm(
      'Delete playlist?',
      `Remove "${selected.name}" and all its tracks from your library?`,
      'Delete'
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/playlist/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        showSuccess('Playlist deleted');
        await fetchPlaylists();
      } else {
        showError('Delete failed', 'Could not delete playlist.');
      }
    } catch {
      showError('Delete failed', 'Network error.');
    }
  };

  const handleRemoveTrack = async (trackId: number) => {
    if (!selected || !token) return;
    try {
      const res = await fetch(`/api/playlist/${selected.id}/track/${trackId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        const updated: PlaylistData = await res.json();
        setPlaylists(prev => prev.map(p => (p.id === updated.id ? updated : p)));
      } else {
        showError('Remove failed', 'Could not remove track from playlist.');
      }
    } catch {
      showError('Remove failed', 'Network error.');
    }
  };

  const handlePlayAll = () => {
    if (!selected || selected.tracks.length === 0) return;
    selected.tracks.forEach(track => addToQueue(track));
    playTrack(selected.tracks[0]);
  };

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    return `${mins} min`;
  };

  if (isStaffInAdminMode) {
    return (
      <div className="text-center py-20 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-8 max-w-xl mx-auto">
        <FolderHeart className="w-12 h-12 text-slate-650 mx-auto mb-4" />
        <h4 className="text-sm font-bold text-slate-350">Switch to Listen mode</h4>
        <p className="text-xs text-slate-500 mt-1">Playlists are available in Listen mode, not while managing your station or studio.</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="text-center py-20 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-8 max-w-xl mx-auto">
        <Disc className="w-12 h-12 text-slate-650 mx-auto mb-4" />
        <h4 className="text-sm font-bold text-slate-350">Sign in required</h4>
        <p className="text-xs text-slate-500 mt-1">Log in to create and manage playlists.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
          <FolderHeart className="w-6 h-6 text-rose-400" /> Playlists
        </h2>
        <p className="text-xs text-slate-400 mt-1">Create collections and add tracks from the library using the folder icon on any track.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Playlist list */}
        <div className="lg:col-span-4 space-y-4">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              placeholder="New playlist name"
              className="flex-1 min-w-0 bg-slate-950 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-slate-200 outline-none focus:border-rose-500/30"
            />
            <button
              type="submit"
              disabled={isCreating || !newPlaylistName.trim()}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
            >
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create
            </button>
          </form>

          <div className="bg-slate-900/20 border border-white/5 rounded-2xl overflow-hidden">
            {isLoading ? (
              <p className="text-xs text-slate-500 text-center py-8">Loading playlists...</p>
            ) : playlists.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8 px-4">No playlists yet. Create one above.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {playlists.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full text-left px-4 py-3 transition ${
                        selectedId === p.id
                          ? 'bg-rose-600/10 text-rose-300'
                          : 'text-slate-300 hover:bg-slate-900/40'
                      }`}
                    >
                      <span className="text-xs font-bold block truncate">{p.name}</span>
                      <span className="text-[10px] text-slate-500">{p.tracks.length} tracks</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Selected playlist */}
        <div className="lg:col-span-8">
          {!selected ? (
            <div className="text-center py-16 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl">
              <FolderHeart className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-xs text-slate-500">Select or create a playlist to view its tracks.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-widest">Playlist</span>
                  <h1 className="text-2xl md:text-3xl font-extrabold text-white mt-1">{selected.name}</h1>
                  <p className="text-xs text-slate-400 font-bold mt-2">
                    {selected.tracks.length} songs
                    {selected.tracks.length > 0 && (
                      <> · {formatDuration(selected.tracks.reduce((a, t) => a + (t.duration || 0), 0))}</>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePlayAll}
                    disabled={selected.tracks.length === 0}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
                  >
                    <Play className="w-4 h-4 fill-current" /> Play All
                  </button>
                  <button
                    type="button"
                    onClick={handleDeletePlaylist}
                    className="p-2.5 bg-slate-900 hover:bg-rose-950/40 border border-white/5 text-slate-400 hover:text-rose-400 rounded-xl transition"
                    title="Delete playlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selected.tracks.length === 0 ? (
                <div className="text-center py-12 bg-slate-900/10 border border-dashed border-white/5 rounded-2xl">
                  <p className="text-xs text-slate-500">No tracks yet. Use the folder icon on any track to add it here.</p>
                </div>
              ) : (
                <div className="space-y-2 bg-slate-900/10 border border-white/3 p-4 rounded-3xl">
                  {selected.tracks.map((track, idx) => (
                    <div key={track.id} className="relative group/row">
                      <TrackRow
                        track={track}
                        index={idx}
                        onViewReport={onViewReport}
                        onViewDetails={onViewDetails}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveTrack(track.id)}
                        className="absolute right-14 top-1/2 -translate-y-1/2 p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 bg-slate-900 border border-white/5 text-slate-500 hover:text-rose-400 transition z-10"
                        title="Remove from playlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
