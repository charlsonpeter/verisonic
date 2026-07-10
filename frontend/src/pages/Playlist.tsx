import React, { useCallback, useEffect, useState } from 'react';
import { Play, Disc, Plus, Trash2, FolderHeart, Loader2, GripVertical, ChevronLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';
import { toastError, toastSuccess } from '../utils/toast';

interface PlaylistData {
  id: number;
  name: string;
  user_id: number;
  is_public: boolean;
  tracks: Track[];
}

interface PlaylistProps {
  onViewDetails: (track: Track) => void;
}

export const Playlist: React.FC<PlaylistProps> = ({ onViewDetails }) => {
  const { token, canUsePlaylists, isStaffInAdminMode } = useAuth();
  const { playTrack, addToQueue } = useAudio();

  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileTracksOpen, setMobileTracksOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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

  useEffect(() => {
    setPlaylists([]);
    setSelectedId(null);
    setMobileTracksOpen(false);
  }, [token]);

  useEffect(() => {
    if (mobileTracksOpen) {
      document.querySelector('main')?.scrollTo({ top: 0 });
    }
  }, [mobileTracksOpen]);

  const selected = playlists.find(p => p.id === selectedId) || null;

  const updatePlaylistTracks = (playlistId: number, tracks: Track[]) => {
    setPlaylists(prev => prev.map(p => (p.id === playlistId ? { ...p, tracks } : p)));
  };

  const handleSelectPlaylist = (id: number) => {
    setSelectedId(id);
    setMobileTracksOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name || !token) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name, is_public: false }),
      });
      if (res.ok) {
        const created: PlaylistData = await res.json();
        setNewPlaylistName('');
        await fetchPlaylists();
        setSelectedId(created.id);
        setMobileTracksOpen(true);
        toastSuccess(`"${created.name}" created`);
      } else {
        const data = await res.json().catch(() => ({}));
        toastError(data.detail || 'Could not create playlist.');
      }
    } catch {
      toastError('Could not create playlist.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlaylist = async () => {
    if (!selected || !token) return;
    const name = selected.name;
    try {
      const res = await fetch(`/api/playlist/${selected.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (res.ok) {
        toastSuccess(`"${name}" deleted`);
        setMobileTracksOpen(false);
        await fetchPlaylists();
      } else {
        toastError('Could not delete playlist.');
      }
    } catch {
      toastError('Could not delete playlist.');
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
        updatePlaylistTracks(updated.id, updated.tracks);
        toastSuccess('Track removed');
      } else {
        toastError('Could not remove track.');
      }
    } catch {
      toastError('Could not remove track.');
    }
  };

  const handleReorderTracks = async (startIndex: number, endIndex: number) => {
    if (!selected || startIndex === endIndex) return;
    const reordered = [...selected.tracks];
    const [moved] = reordered.splice(startIndex, 1);
    reordered.splice(endIndex, 0, moved);
    updatePlaylistTracks(selected.id, reordered);

    try {
      const res = await fetch(`/api/playlist/${selected.id}/tracks/reorder`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ track_ids: reordered.map(t => t.id) }),
      });
      if (res.ok) {
        const updated: PlaylistData = await res.json();
        updatePlaylistTracks(updated.id, updated.tracks);
      } else {
        toastError('Could not reorder tracks.');
        await fetchPlaylists();
      }
    } catch {
      toastError('Could not reorder tracks.');
      await fetchPlaylists();
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (index: number) => {
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === targetIndex) return;
    handleReorderTracks(draggedIndex, targetIndex);
    setDraggedIndex(null);
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

  const totalDuration = selected
    ? formatDuration(selected.tracks.reduce((a, t) => a + (t.duration || 0), 0))
    : '';

  const renderSelectedTracks = () => {
    if (!selected) return null;

    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-400 font-bold min-w-0">
            {selected.tracks.length} songs
            {selected.tracks.length > 0 && <> · {totalDuration}</>}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handlePlayAll}
              disabled={selected.tracks.length === 0}
              className="p-2.5 lg:px-5 lg:py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition"
              aria-label="Play all"
              title="Play all"
            >
              <Play className="w-4 h-4 fill-current" />
              <span className="hidden lg:inline">Play All</span>
            </button>
            <button
              type="button"
              onClick={handleDeletePlaylist}
              className="p-2.5 bg-slate-900 hover:bg-rose-950/40 border border-white/5 text-slate-400 hover:text-rose-400 rounded-xl transition"
              title="Delete playlist"
              aria-label="Delete playlist"
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
          <div className="space-y-2">
            {selected.tracks.map((track, idx) => (
              <div
                key={track.id}
                onDragOver={handleDragOver}
                onDragEnter={() => handleDragEnter(idx)}
                onDragLeave={() => setDragOverIndex(null)}
                onDrop={(e) => handleDrop(e, idx)}
                className={`flex items-stretch gap-1 rounded-2xl transition-colors ${
                  dragOverIndex === idx ? 'bg-rose-600/5 ring-1 ring-rose-500/30' : ''
                }`}
              >
                <div className="flex-1 min-w-0">
                  <TrackRow
                    track={track}
                    index={idx}
                    onViewDetails={onViewDetails}
                    onRemove={() => handleRemoveTrack(track.id)}
                  />
                </div>
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className="flex items-center px-1 text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing flex-shrink-0 self-center"
                  title="Drag to reorder"
                  onClick={(e) => e.stopPropagation()}
                >
                  <GripVertical className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </>
    );
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

  const showTracksOnMobile = selected && mobileTracksOpen;

  return (
    <div className="w-full">
      {/* Mobile track screen — no hidden playlist header sibling */}
      {showTracksOnMobile && selected && (
        <div className="lg:hidden space-y-4">
          <div className="sticky top-0 z-20 -mx-6 px-6 py-3 bg-slate-950/95 backdrop-blur-md border-b border-white/5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileTracksOpen(false)}
              className="p-2 rounded-xl bg-slate-900 border border-white/5 text-slate-300 hover:text-white transition flex-shrink-0"
              aria-label="Back to playlists"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-base font-extrabold text-white truncate flex-1">{selected.name}</h1>
          </div>
          <div className="space-y-4 px-0">
            {renderSelectedTracks()}
          </div>
        </div>
      )}

      {/* Playlist list (mobile) + side-by-side layout (desktop) */}
      <div
        className={`space-y-4 md:space-y-6 ${
          showTracksOnMobile ? 'max-md:hidden' : ''
        }`}
      >
        <div>
          <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <FolderHeart className="w-6 h-6 text-rose-400" /> Playlists
          </h2>
          <p className="text-xs text-slate-400 mt-1">Create collections and add tracks from the library using the folder icon on any track.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
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
                      onClick={() => handleSelectPlaylist(p.id)}
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

        {/* Selected playlist tracks (desktop only) */}
        <div className="hidden lg:block lg:col-span-8">
          {!selected ? (
            <div className="text-center py-16 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl">
              <FolderHeart className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-xs text-slate-500">Select or create a playlist to view its tracks.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {renderSelectedTracks()}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
};
