import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Music, Trash2, CheckCircle2, XCircle, RefreshCw, Star, Play, Ban, Check, Edit3, X, UploadCloud, AlertTriangle, ShieldCheck, Camera, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { AppModal } from '../components/shared/AppModal';
import { showError, showConfirm } from '../utils/swal';
import { toastError, toastSuccess } from '../utils/toast';
import { trackHasPlayableStream } from '../utils/streamQuality';
import { createAuthenticatedWebSocket } from '../utils/authTokens';
import { TableSkeleton, TrackCardSkeleton } from '../components/shared/skeleton';
import { useLazyList, DEFAULT_LAZY_PAGE_SIZE } from '../hooks/useLazyList';
import { LazyListSentinel } from '../components/shared/LazyListSentinel';
import { ListSearchInput } from '../components/shared/ListSearchInput';

interface UploadQueueItem {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'analyzing' | 'transcoding' | 'completed' | 'rejected' | 'failed' | 'cancelled';
  progress: number;
  message: string;
}

type TrackStatusFilter = 'all' | 'analyzing' | 'transcoding' | 'ready' | 'rejected';

interface TracksManagementProps {
  onViewReport?: (track: any) => void;
}

const KEEP_SAME = '__KEEP_SAME__';
const KEEP_SAME_LABEL = '<Keep Same>';

const formatTrackOwnerName = (track: { owner_name?: string | null; owner_email?: string | null }) =>
  track.owner_name || track.owner_email?.split('@')[0] || 'Unknown Owner';

const genreNamesFromTrack = (track: any) =>
  Array.isArray(track?.genres)
    ? track.genres.map((g: string | { name: string }) => (typeof g === 'string' ? g : g.name)).join(', ')
    : '';

const uniqueFieldValues = (tracks: any[], getter: (t: any) => string): string[] => {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const t of tracks) {
    const v = String(getter(t) ?? '').trim();
    if (!seen.has(v)) {
      seen.add(v);
      values.push(v);
    }
  }
  return values;
};

const consensusOrKeep = (values: string[]) =>
  values.length === 1 ? values[0] : KEEP_SAME;

const optionLabel = (value: string, max = 72) => {
  if (value === '') return '(empty)';
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
};

type BulkTagFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  multiline?: boolean;
  type?: string;
  list?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  rows?: number;
  className?: string;
  hideLabel?: boolean;
  onExpand?: () => void;
};

const BulkTagField: React.FC<BulkTagFieldProps> = ({
  label,
  value,
  onChange,
  options,
  multiline = false,
  type = 'text',
  list,
  required,
  placeholder,
  min,
  rows = 4,
  className = '',
  hideLabel = false,
  onExpand,
}) => {
  const mixed = options.length > 1;
  // After bulk apply, options may collapse to one value while state is still KEEP_SAME.
  const safeValue = !mixed && value === KEEP_SAME ? (options[0] ?? '') : value;
  const isKeep = value === KEEP_SAME && mixed;
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldClass =
    'w-full bg-slate-950 border border-white/5 p-2.5 rounded-xl text-xs outline-none focus:border-rose-500 text-slate-200';

  useEffect(() => {
    if (!mixed && value === KEEP_SAME) {
      onChange(options[0] ?? '');
    }
  }, [mixed, value, options, onChange]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [menuOpen]);

  const rightPad = mixed && onExpand ? 'pr-16' : mixed || onExpand ? 'pr-9' : '';
  const displayValue = isKeep ? KEEP_SAME_LABEL : safeValue;

  const matchesOption = (text: string) =>
    options.some((opt) => opt.toLowerCase().includes(text.toLowerCase()));

  const handleMixedChange = (next: string) => {
    if (next === KEEP_SAME_LABEL) {
      onChange(KEEP_SAME);
      return;
    }
    onChange(next);
    if (next === '' || matchesOption(next)) {
      setMenuOpen(true);
    } else {
      setMenuOpen(false);
    }
  };

  const handleMixedKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!isKeep) return;
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      onChange('');
      setMenuOpen(false);
      return;
    }
    // Printable character while Keep Same is selected → replace with that character
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      onChange(e.key);
      setMenuOpen(false);
    }
  };

  return (
    <div className={`space-y-1 ${className}`} ref={rootRef}>
      {!hideLabel && (
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</label>
      )}
      {mixed ? (
        <div className="relative group">
          {multiline ? (
            <textarea
              value={displayValue}
              onChange={(e) => handleMixedChange(e.target.value)}
              onKeyDown={handleMixedKeyDown}
              onFocus={(e) => {
                setMenuOpen(true);
                if (isKeep) e.currentTarget.select();
              }}
              rows={rows}
              className={`${fieldClass} font-sans leading-relaxed resize-none ${rightPad}`}
              placeholder={placeholder}
            />
          ) : (
            <input
              type={type === 'number' ? 'text' : type}
              value={displayValue}
              onChange={(e) => handleMixedChange(e.target.value)}
              onKeyDown={handleMixedKeyDown}
              onFocus={(e) => {
                setMenuOpen(true);
                if (isKeep) e.currentTarget.select();
              }}
              min={min}
              className={`${fieldClass} ${rightPad}`}
              placeholder={placeholder}
              autoComplete="off"
            />
          )}
          <div className="absolute top-2 right-2 flex items-center gap-0.5">
            {onExpand && !isKeep && (
              <button
                type="button"
                onClick={onExpand}
                title="Edit in large mode"
                aria-label="Edit in large mode"
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70 transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition"
              aria-label={`Show ${label || 'field'} options`}
              tabIndex={-1}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition ${menuOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {menuOpen && (
            <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  onChange(KEEP_SAME);
                  setMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs font-semibold transition ${
                  isKeep ? 'bg-rose-600/15 text-rose-300' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {KEEP_SAME_LABEL}
              </button>
              {options.map((opt) => (
                <button
                  type="button"
                  key={`${label}-${opt || '__empty'}`}
                  onClick={() => {
                    onChange(opt);
                    setMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs transition ${
                    !isKeep && value === opt ? 'bg-rose-600/15 text-rose-300' : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {optionLabel(opt)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : multiline ? (
        <div className="relative group">
          <textarea
            value={safeValue}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            required={required}
            className={`${fieldClass} font-sans leading-relaxed resize-none ${onExpand ? 'pr-9' : ''}`}
            placeholder={placeholder}
          />
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              title="Edit in large mode"
              aria-label="Edit in large mode"
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/55 text-white border border-white/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-70 transition-opacity"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ) : (
        <input
          type={type}
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          list={list}
          required={required}
          min={min}
          className={fieldClass}
          placeholder={placeholder}
        />
      )}
    </div>
  );
};

export const TracksManagement: React.FC<TracksManagementProps> = ({ onViewReport }) => {
  const { token, currentUser, fetchCurrentUser, isStaffInAdminMode } = useAuth();
  const { playTrack, currentTrack, isPlaying, updateTrackMetadata } = useAudio();
  
  const isPlatformAdmin = currentUser?.role === 'admin';
  const isStudioAdmin = currentUser?.role === 'studio_admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TrackStatusFilter>('all');

  const tracksList = useLazyList<any>({
    fetchPage: useCallback(async (offset, limit) => {
      if (!token) return { items: [], hasMore: false };
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/music/manage?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (offset === 0) {
          const errorData = await res.json().catch(() => ({}));
          toastError(errorData.detail || 'Failed to fetch tracks.');
        }
        return { items: [], hasMore: false };
      }
      const data = await res.json();
      return { items: data.items, hasMore: data.has_more };
    }, [token, searchQuery, statusFilter]),
    resetKey: token && (isStaffInAdminMode || isPlatformAdmin) ? `tracks-${searchQuery}-${statusFilter}` : null,
    enabled: !!(token && (isStaffInAdminMode || isPlatformAdmin)),
    pageSize: DEFAULT_LAZY_PAGE_SIZE,
  });

  const tracks = tracksList.items;
  const isLoading = tracksList.loading;
  const fetchTracks = (_silent = false) => { void tracksList.reload(); };

  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Studio registration states (for studio_admin post-approval setup)
  const [registerStageName, setRegisterStageName] = useState(currentUser?.artist_profile?.stage_name || currentUser?.full_name || '');
  const [registerBio, setRegisterBio] = useState(currentUser?.artist_profile?.bio || '');
  const [isRegisteringStudio, setIsRegisteringStudio] = useState(false);

  const handleStudioRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerStageName.trim() || !registerBio.trim()) return;
    setIsRegisteringStudio(true);
    try {
      const res = await fetch('/api/auth/request-artist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stage_name: registerStageName.trim(),
          bio: registerBio.trim()
        })
      });
      if (res.ok) {
        toastSuccess('Studio profile registered successfully!');
        if (fetchCurrentUser) await fetchCurrentUser();
      } else {
        const errorData = await res.json();
        toastError(errorData.detail || 'Failed to register studio.');
      }
    } catch {
      toastError('Connection failed.');
    } finally {
      setIsRegisteringStudio(false);
    }
  };

  // Upload states
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isQueueUploading, setIsQueueUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const activeUploadXhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadStopRequestedRef = useRef(false);

  const [suggestions, setSuggestions] = useState<{
    artists: string[];
    albums: Record<string, string>;
    composers: string[];
    lyricists: string[];
    languages: string[];
  }>({
    artists: [],
    albums: {},
    composers: [],
    lyricists: [],
    languages: []
  });

  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/music/autocomplete-suggestions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestions(data);
      }
    } catch (e) {
      console.error("Failed to fetch autocomplete suggestions", e);
    }
  };

  const handleFilesSelected = (files: FileList | null) => {
    if (!files) return;
    const newItems: UploadQueueItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newItems.push({
        id: Math.random().toString(36).substring(7),
        file,
        status: 'pending',
        progress: 0,
        message: '',
      });
    }
    setUploadQueue(prev => [...prev, ...newItems]);
    setUploadMessage(null);
  };

  const uploadSingleQueueItem = (item: UploadQueueItem): Promise<void> => {
    return new Promise((resolve) => {
      if (uploadStopRequestedRef.current) {
        setUploadQueue(prev => prev.map(q => q.id === item.id ? {
          ...q,
          status: 'cancelled',
          message: 'Cancelled',
          progress: 0,
        } : q));
        resolve();
        return;
      }

      setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', progress: 0, message: 'Uploading...' } : q));
      
      const formData = new FormData();
      formData.append('file', item.file);
      
      const xhr = new XMLHttpRequest();
      activeUploadXhrRef.current = xhr;
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, progress: percent } : q));
        }
      };
      
      xhr.onload = () => {
        if (activeUploadXhrRef.current === xhr) activeUploadXhrRef.current = null;
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            const trackId = data.track_id;
            if (!trackId) throw new Error("Missing track ID");
            
            setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'completed', message: 'Success', progress: 100 } : q));
            fetchTracks(true);
            resolve();
          } catch {
            setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'failed', message: 'Failed to read response.' } : q));
            resolve();
          }
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'failed', message: data.detail || 'Upload failed.' } : q));
          } catch {
            setUploadQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'failed', message: 'Upload failed.' } : q));
          }
          resolve();
        }
      };
      
      xhr.onerror = () => {
        if (activeUploadXhrRef.current === xhr) activeUploadXhrRef.current = null;
        setUploadQueue(prev => prev.map(q => q.id === item.id ? { 
          ...q, 
          status: 'failed', 
          message: 'Upload failed.',
        } : q));
        resolve();
      };

      xhr.onabort = () => {
        if (activeUploadXhrRef.current === xhr) activeUploadXhrRef.current = null;
        setUploadQueue(prev => prev.map(q => q.id === item.id ? {
          ...q,
          status: 'cancelled',
          message: 'Stopped',
          progress: 0,
        } : q));
        resolve();
      };
      
      xhr.open('POST', `/api/music/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);
    });
  };

  const handleStopUploadQueue = () => {
    uploadStopRequestedRef.current = true;
    const xhr = activeUploadXhrRef.current;
    if (xhr) {
      xhr.abort();
      activeUploadXhrRef.current = null;
    }
    setUploadQueue(prev => prev.map(q =>
      q.status === 'pending'
        ? { ...q, status: 'cancelled', message: 'Cancelled', progress: 0 }
        : q
    ));
    setUploadMessage({ type: 'error', text: 'Upload stopped. Remaining files were cancelled.' });
  };

  const handleUploadQueue = async () => {
    if (uploadQueue.length === 0 || isQueueUploading) return;
    uploadStopRequestedRef.current = false;
    setIsQueueUploading(true);
    setUploadMessage(null);
    
    const itemsToUpload = [...uploadQueue];
    for (const item of itemsToUpload) {
      if (uploadStopRequestedRef.current) break;
      if (item.status === 'completed' || item.status === 'rejected' || item.status === 'failed' || item.status === 'cancelled') continue;
      await uploadSingleQueueItem(item);
    }
    
    setIsQueueUploading(false);
    activeUploadXhrRef.current = null;
    fetchSuggestions();
    fetchTracks(true);
  };

  useEffect(() => {
    if (token && (isStaffInAdminMode || isPlatformAdmin)) {
      fetchSuggestions();
    }
  }, [token, isStaffInAdminMode, isPlatformAdmin]);

  useEffect(() => {
    setSelectedTrackIds((prev) => prev.filter((id) => tracks.some((t) => t.id === id)));
  }, [tracks]);

  useEffect(() => {
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/music/ws/tracks/status`;
    const socket = createAuthenticatedWebSocket(wsUrl, token);
    if (!socket) return;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'status_updates') {
          const updates = data.tracks as Array<{
            track_id: number;
            status: string;
            quality_score: number | null;
            quality_level: string | null;
            approved: boolean;
            has_hls?: boolean;
          }>;

          const applyUpdate = <T extends {
            id: number;
            quality_score?: number | null;
            quality_level?: string | null;
            approved?: boolean;
            hls_playlist_path?: string | null;
          }>(track: T, update: (typeof updates)[number]): T => {
            const next: T = {
              ...track,
              quality_score: update.quality_score,
              quality_level: update.quality_level,
              approved: update.approved,
            };
            if (update.status === 'completed' || update.has_hls) {
              next.hls_playlist_path = track.hls_playlist_path || 'ready';
            }
            return next;
          };

          tracksList.setItems((prevTracks) => {
            const hasNewTracks = updates.some((u) =>
              !prevTracks.some((t: any) => t.id === u.track_id)
            );
            if (hasNewTracks) {
              setTimeout(() => tracksList.reload(), 0);
            }
            return prevTracks.map((track) => {
              const update = updates.find((u) => u.track_id === track.id);
              return update ? applyUpdate(track, update) : track;
            });
          });

          setEditingTrack((prev: any | null) => {
            if (!prev) return prev;
            const update = updates.find((u) => u.track_id === prev.id);
            return update ? applyUpdate(prev, update) : prev;
          });

          const hasTerminalUpdate = updates.some((u) =>
            u.status === 'completed' || u.status === 'rejected' || u.status === 'failed'
          );
          if (hasTerminalUpdate) {
            tracksList.reload();
            fetchSuggestions();
          }
        }
      } catch (err) {
        console.error("Failed to parse status update:", err);
      }
    };

    socket.onerror = (err) => {
      console.error("Tracks status WebSocket error:", err);
    };

    return () => {
      socket.close();
    };
  }, [token]);

  const handleDelete = async (trackId: number) => {
    const confirmed = await showConfirm(
      "Permanently Delete Track?",
      "Are you sure you want to permanently delete this track? This will remove all audio transcode masters.",
      "Yes, delete it"
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/music/${trackId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toastSuccess('Track deleted successfully.');
        setSelectedTrackIds((prev) => prev.filter((id) => id !== trackId));
        fetchTracks();
      } else {
        const data = await res.json();
        toastError(data.detail || 'Failed to delete track.');
      }
    } catch {
      toastError('Connection failed.');
    }
  };

  const allTracksSelected = tracks.length > 0 && selectedTrackIds.length === tracks.length;

  const toggleSelectAll = () => {
    if (allTracksSelected) {
      setSelectedTrackIds([]);
    } else {
      setSelectedTrackIds(tracks.map((t) => t.id));
    }
  };

  const toggleTrackSelection = (trackId: number) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  };

  const handleBulkDelete = async () => {
    if (selectedTrackIds.length === 0 || isBulkDeleting) return;

    const count = selectedTrackIds.length;
    const confirmed = await showConfirm(
      `Delete ${count} Track${count === 1 ? '' : 's'}?`,
      `Are you sure you want to permanently delete ${count} selected track${count === 1 ? '' : 's'}? This will remove all audio transcode masters.`,
      `Yes, delete ${count}`
    );
    if (!confirmed) return;
    setIsBulkDeleting(true);
    try {
      const results = await Promise.allSettled(
        selectedTrackIds.map((trackId) =>
          fetch(`/api/music/${trackId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          })
        )
      );

      const failed = results.filter(
        (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
      ).length;
      const deleted = count - failed;

      setSelectedTrackIds([]);
      fetchTracks(true);

      if (failed === 0) {
        toastSuccess(`${deleted} track${deleted === 1 ? '' : 's'} deleted successfully.`);
      } else if (deleted > 0) {
        toastError(`${deleted} deleted, ${failed} failed. Refresh and try again for remaining tracks.`);
      } else {
        toastError('Failed to delete selected tracks.');
      }
    } catch {
      toastError('Connection failed.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleApproveToggle = async (trackId: number, approve: boolean) => {
    try {
      const res = await fetch(`/api/music/${trackId}/approve?approved=${approve}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toastSuccess(`Track has been ${approve ? 'approved for streaming' : 'rejected and disabled'}.`);
        fetchTracks();
      } else {
        const data = await res.json();
        toastError(data.detail || 'Failed to update track approval.');
      }
    } catch {
      toastError('Connection failed.');
    }
  };

  const getStatusDetails = (t: any) => {
    if (t.quality_score === null) {
      return { label: 'Analyzing', style: 'bg-amber-500/10 border-amber-500/20 text-amber-400', desc: 'Running spectral checks...' };
    }
    if (t.approved && !t.hls_playlist_path) {
      return { label: 'Transcoding', style: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', desc: 'Generating adaptive streaming files...' };
    }
    if (t.approved && t.hls_playlist_path) {
      return { label: 'Ready', style: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', desc: 'lossless FLAC master ready' };
    }
    return { label: 'Rejected', style: 'bg-rose-500/10 border-rose-500/20 text-rose-455', desc: 'Failed spectral cutoff checks' };
  };

  // Edit Track State
  const [editingTrack, setEditingTrack] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editAlbum, setEditAlbum] = useState('');
  const [editComposer, setEditComposer] = useState('');
  const [editLyricist, setEditLyricist] = useState('');
  const [editYear, setEditYear] = useState('');
  const [editTrackNumber, setEditTrackNumber] = useState('');
  const [editAlbumArtist, setEditAlbumArtist] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editCopyright, setEditCopyright] = useState('');
  const [editGenres, setEditGenres] = useState('');
  const [editLyrics, setEditLyrics] = useState('');
  const [editLanguage, setEditLanguage] = useState('');
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string>('');
  const editCoverInputRef = useRef<HTMLInputElement>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isLyricsModalOpen, setIsLyricsModalOpen] = useState(false);
  const [lyricsDraft, setLyricsDraft] = useState('');

  const isMultiEdit = selectedTrackIds.length > 1;
  const isSingleEdit = selectedTrackIds.length === 1;
  const hasEditorTarget = selectedTrackIds.length > 0;

  const selectedTracks = selectedTrackIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter(Boolean) as any[];

  const multiOptions = {
    title: uniqueFieldValues(selectedTracks, (t) => t.title || ''),
    artist: uniqueFieldValues(selectedTracks, (t) => t.artist_name || ''),
    album: uniqueFieldValues(selectedTracks, (t) => t.album_title || ''),
    albumArtist: uniqueFieldValues(selectedTracks, (t) => t.album_artist || ''),
    composer: uniqueFieldValues(selectedTracks, (t) => t.composer || ''),
    lyricist: uniqueFieldValues(selectedTracks, (t) => t.lyricist || ''),
    year: uniqueFieldValues(selectedTracks, (t) => (t.year != null ? String(t.year) : '')),
    trackNumber: uniqueFieldValues(selectedTracks, (t) => (t.track_number != null ? String(t.track_number) : '')),
    language: uniqueFieldValues(selectedTracks, (t) => t.language || ''),
    genres: uniqueFieldValues(selectedTracks, (t) => genreNamesFromTrack(t)),
    comment: uniqueFieldValues(selectedTracks, (t) => t.comment || ''),
    copyright: uniqueFieldValues(selectedTracks, (t) => t.copyright || ''),
    lyrics: uniqueFieldValues(selectedTracks, (t) => t.lyrics || ''),
    cover: uniqueFieldValues(selectedTracks, (t) => t.cover_art_url || ''),
  };

  const clearTagEditor = () => {
    setEditingTrack(null);
    setEditTitle('');
    setEditArtist('');
    setEditAlbum('');
    setEditComposer('');
    setEditLyricist('');
    setEditYear('');
    setEditTrackNumber('');
    setEditAlbumArtist('');
    setEditComment('');
    setEditCopyright('');
    setEditGenres('');
    setEditLyrics('');
    setEditLanguage('');
    setEditCoverFile(null);
    setEditCoverPreview('');
    setEditError(null);
  };

  const populateTagEditor = (track: any) => {
    setEditingTrack(track);
    setEditTitle(track.title || '');
    setEditArtist(track.artist_name || '');
    setEditAlbum(track.album_title || '');
    setEditComposer(track.composer || '');
    setEditLyricist(track.lyricist || '');
    setEditYear(track.year ? String(track.year) : '');
    setEditTrackNumber(track.track_number ? String(track.track_number) : '');
    setEditAlbumArtist(track.album_artist || '');
    setEditComment(track.comment || '');
    setEditCopyright(track.copyright || '');
    setEditLanguage(track.language || '');
    setEditGenres(genreNamesFromTrack(track));
    setEditLyrics(track.lyrics || '');
    setEditCoverFile(null);
    setEditCoverPreview(track.cover_art_url || '');
    setEditError(null);
  };

  const populateMultiTagEditor = (selected: any[]) => {
    setEditingTrack(null);
    setEditTitle(consensusOrKeep(uniqueFieldValues(selected, (t) => t.title || '')));
    setEditArtist(consensusOrKeep(uniqueFieldValues(selected, (t) => t.artist_name || '')));
    setEditAlbum(consensusOrKeep(uniqueFieldValues(selected, (t) => t.album_title || '')));
    setEditComposer(consensusOrKeep(uniqueFieldValues(selected, (t) => t.composer || '')));
    setEditLyricist(consensusOrKeep(uniqueFieldValues(selected, (t) => t.lyricist || '')));
    setEditYear(consensusOrKeep(uniqueFieldValues(selected, (t) => (t.year != null ? String(t.year) : ''))));
    setEditTrackNumber(consensusOrKeep(uniqueFieldValues(selected, (t) => (t.track_number != null ? String(t.track_number) : ''))));
    setEditAlbumArtist(consensusOrKeep(uniqueFieldValues(selected, (t) => t.album_artist || '')));
    setEditComment(consensusOrKeep(uniqueFieldValues(selected, (t) => t.comment || '')));
    setEditCopyright(consensusOrKeep(uniqueFieldValues(selected, (t) => t.copyright || '')));
    setEditLanguage(consensusOrKeep(uniqueFieldValues(selected, (t) => t.language || '')));
    setEditGenres(consensusOrKeep(uniqueFieldValues(selected, (t) => genreNamesFromTrack(t))));
    setEditLyrics(consensusOrKeep(uniqueFieldValues(selected, (t) => t.lyrics || '')));
    setEditCoverFile(null);
    const covers = uniqueFieldValues(selected, (t) => t.cover_art_url || '');
    setEditCoverPreview(covers.length === 1 ? covers[0] : '');
    setEditError(null);
  };

  useEffect(() => {
    if (selectedTrackIds.length === 0) {
      clearTagEditor();
      return;
    }
    const selected = selectedTrackIds
      .map((id) => tracks.find((t) => t.id === id))
      .filter(Boolean) as any[];
    if (selected.length === 0) {
      clearTagEditor();
      return;
    }
    if (selected.length === 1) {
      populateTagEditor(selected[0]);
      return;
    }
    populateMultiTagEditor(selected);
    // Selection-driven only — avoid wiping in-progress edits on track list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrackIds.join(',')]);

  const handleTranscribeAI = async () => {
    if (!isSingleEdit || !editingTrack) return;
    setIsTranscribing(true);
    try {
      const response = await fetch(`/api/music/${editingTrack.id}/transcribe`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const lyrics = data.lyrics || '';
        setEditLyrics(lyrics);
        setLyricsDraft(lyrics);
      } else {
        showError("Transcription Failed", "Failed to transcribe. Make sure the original audio is uploaded and analyzed.");
      }
    } catch (err) {
      console.error(err);
      showError("Transcription Error", "Error triggering AI transcription.");
    } finally {
      setIsTranscribing(false);
    }
  };

  const openLyricsModal = () => {
    setLyricsDraft(editLyrics === KEEP_SAME ? '' : editLyrics);
    setIsLyricsModalOpen(true);
  };

  const applyLyricsDraft = () => {
    setEditLyrics(lyricsDraft);
    setIsLyricsModalOpen(false);
  };

  const handleEditClick = (track: any) => {
    setSelectedTrackIds([track.id]);
  };

  const buildSingleEditFormData = () => {
    const formData = new FormData();
    formData.append('title', editTitle);
    formData.append('artist_name', editArtist);
    formData.append('album_title', editAlbum);
    formData.append('composer', editComposer);
    formData.append('lyricist', editLyricist);
    formData.append('year', editYear);
    formData.append('track_number', editTrackNumber);
    formData.append('album_artist', editAlbumArtist);
    formData.append('comment', editComment);
    formData.append('copyright', editCopyright);
    formData.append('language', editLanguage);
    formData.append('genres', editGenres);
    formData.append('lyrics', editLyrics);
    if (editCoverFile) {
      formData.append('cover_image', editCoverFile);
    }
    return formData;
  };

  const buildMultiEditFormData = () => {
    const formData = new FormData();
    const maybeAppend = (key: string, value: string) => {
      if (value !== KEEP_SAME) formData.append(key, value);
    };
    maybeAppend('title', editTitle);
    maybeAppend('artist_name', editArtist);
    maybeAppend('album_title', editAlbum);
    maybeAppend('composer', editComposer);
    maybeAppend('lyricist', editLyricist);
    maybeAppend('year', editYear);
    maybeAppend('track_number', editTrackNumber);
    maybeAppend('album_artist', editAlbumArtist);
    maybeAppend('comment', editComment);
    maybeAppend('copyright', editCopyright);
    maybeAppend('language', editLanguage);
    maybeAppend('genres', editGenres);
    maybeAppend('lyrics', editLyrics);
    if (editCoverFile) {
      formData.append('cover_image', editCoverFile);
    }
    return formData;
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasEditorTarget) return;
    setIsSavingEdit(true);
    setEditError(null);

    try {
      if (isMultiEdit) {
        const formData = buildMultiEditFormData();
        if ([...formData.keys()].length === 0) {
          setEditError('Change at least one field, or leave as <Keep Same>.');
          return;
        }
        const results = await Promise.allSettled(
          selectedTrackIds.map((trackId) => {
            const payload = buildMultiEditFormData();
            return fetch(`/api/music/${trackId}`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}` },
              body: payload,
            });
          })
        );
        const failed = results.filter(
          (r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
        ).length;
        const updated = selectedTrackIds.length - failed;
        fetchSuggestions();
        if (failed === 0) {
          toastSuccess(`Updated tags on ${updated} track${updated === 1 ? '' : 's'}.`);
          // Merge applied values into selected tracks so unanimous fields don't stay as KEEP_SAME.
          const pick = (current: string, existing: string) =>
            current === KEEP_SAME ? existing : current;
          const merged = selectedTracks.map((t) => ({
            ...t,
            title: pick(editTitle, t.title || ''),
            artist_name: pick(editArtist, t.artist_name || ''),
            album_title: pick(editAlbum, t.album_title || ''),
            album_artist: pick(editAlbumArtist, t.album_artist || ''),
            composer: pick(editComposer, t.composer || ''),
            lyricist: pick(editLyricist, t.lyricist || ''),
            year: editYear === KEEP_SAME ? t.year : (editYear === '' ? null : Number(editYear)),
            track_number:
              editTrackNumber === KEEP_SAME
                ? t.track_number
                : editTrackNumber === ''
                  ? null
                  : Number(editTrackNumber),
            language: pick(editLanguage, t.language || ''),
            comment: pick(editComment, t.comment || ''),
            copyright: pick(editCopyright, t.copyright || ''),
            lyrics: pick(editLyrics, t.lyrics || ''),
            genres:
              editGenres === KEEP_SAME
                ? t.genres
                : editGenres
                    .split(',')
                    .map((g) => g.trim())
                    .filter(Boolean)
                    .map((name) => ({ name })),
          }));
          populateMultiTagEditor(merged);
          tracksList.setItems((prev) =>
            prev.map((row) => {
              const next = merged.find((m) => m.id === row.id);
              return next ? { ...row, ...next } : row;
            })
          );
          void tracksList.reload();
        } else if (updated > 0) {
          setEditError(`${updated} updated, ${failed} failed.`);
          fetchTracks();
        } else {
          setEditError('Failed to update selected tracks.');
          fetchTracks();
        }
      } else {
        const trackId = selectedTrackIds[0];
        const formData = buildSingleEditFormData();
        const res = await fetch(`/api/music/${trackId}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) {
          const updatedTrack = await res.json();
          toastSuccess('Track tags updated.');
          fetchTracks();
          fetchSuggestions();
          if (updateTrackMetadata) {
            updateTrackMetadata(updatedTrack);
          }
        } else {
          const errorData = await res.json();
          setEditError(errorData.detail || 'Failed to update track.');
        }
      }
    } catch {
      setEditError('Connection failed.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="space-y-8 w-full max-w-[1600px]">
      {/* Studio Profile Registration Form (Studio Admin post-approval setup) */}
      {currentUser?.role === 'studio_admin' && (!currentUser.artist_profile?.bio || currentUser.artist_profile.bio === '') && (
        <form onSubmit={handleStudioRegister} className="glass-card p-6 rounded-3xl border border-cyan-500/10 space-y-4 max-w-2xl">
          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
            <ShieldCheck className="w-4.5 h-4.5 text-cyan-400" /> Register Your Studio details
          </h3>
          <p className="text-xs text-slate-450 leading-relaxed font-sans">
            Congratulations on your Studio Admin approval! Please configure your stage name and biography to complete your studio registration.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Stage Name / Studio Brand</label>
              <input 
                type="text" 
                value={registerStageName}
                onChange={(e) => setRegisterStageName(e.target.value)}
                placeholder="e.g. DJ Resonance"
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-cyan-500 text-slate-300 transition"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Studio Description / Biography</label>
            <textarea 
              value={registerBio}
              onChange={(e) => setRegisterBio(e.target.value)}
              placeholder="Tell listeners about your studio setups, musical style..."
              rows={3}
              className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-cyan-500 text-slate-300 transition resize-none"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={isRegisteringStudio}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
          >
            {isRegisteringStudio ? 'Registering Studio...' : 'Complete Studio Registration'}
          </button>
        </form>
      )}

      <AppModal
        open={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        maxWidth="4xl"
        align="start"
        showGradient={false}
        panelClassName="bg-slate-900 max-h-[90vh] flex flex-col overflow-hidden"
        bodyClassName="flex-1 overflow-y-auto p-6 space-y-6 min-h-0"
        header={(
          <div className="border-b border-white/5 pb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <UploadCloud className="w-6 h-6 text-rose-400" /> Upload Studio Master
            </h3>
            <p className="text-xs text-slate-400 mt-1 font-sans">
              Process acoustic FLAC/WAV/MP3 files through live Librosa spectral checks.
            </p>
          </div>
        )}
        footer={uploadQueue.length > 0 ? (
          isQueueUploading ? (
            <button
              type="button"
              onClick={handleStopUploadQueue}
              className="w-full bg-slate-900 border border-rose-500/30 hover:bg-rose-600/15 text-rose-400 font-bold py-3 rounded-xl transition text-xs font-sans flex items-center justify-center gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" />
              Stop Upload ({uploadQueue.filter(q => q.status === 'completed' || q.status === 'failed' || q.status === 'cancelled').length} / {uploadQueue.length} done)
            </button>
          ) : uploadQueue.some(q => q.status === 'completed' || q.status === 'failed' || q.status === 'cancelled') ? (
            <button
              type="button"
              onClick={() => {
                setUploadQueue([]);
                setUploadMessage(null);
                uploadStopRequestedRef.current = false;
                setIsUploadModalOpen(false);
              }}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl transition text-xs shadow flex items-center justify-center gap-1.5 font-sans"
            >
              Close & Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUploadQueue}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-3 rounded-xl transition text-xs shadow flex items-center justify-center gap-1.5 font-sans"
            >
              Verify and Upload Queue
            </button>
          )
        ) : undefined}
        footerClassName="w-full flex-shrink-0 !justify-stretch px-6 py-4"
      >
              {uploadMessage && (
                <div className={`p-4 rounded-xl text-xs flex items-center gap-2 font-semibold ${uploadMessage.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/25 text-rose-400'}`}>
                  {uploadMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
                  {uploadMessage.text}
                </div>
              )}

              {/* Drag & Drop Area */}
              <div className="border border-dashed border-slate-700/80 rounded-2xl p-8 text-center hover:border-rose-500/50 transition relative bg-slate-950/20">
                <input 
                  type="file" 
                  accept=".wav,.flac,.mp3"
                  multiple={true}
                  onChange={(e) => handleFilesSelected(e.target.files)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer animate-none"
                  disabled={isQueueUploading}
                />
                <UploadCloud className="w-12 h-12 text-rose-400 mx-auto mb-3 animate-pulse" />
                <div>
                  <p className="text-xs text-slate-350 font-semibold font-sans">Drag & drop your studio master files or click to browse</p>
                  <p className="text-[9px] text-slate-500 mt-1 font-semibold uppercase tracking-wider font-sans">Supports FLAC, WAV, MP3 (Multiple Files allowed)</p>
                </div>
              </div>

              {/* Queue List */}
              {uploadQueue.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-350">{uploadQueue.length} files in upload queue</span>
                    <button 
                      onClick={() => setUploadQueue([])}
                      disabled={isQueueUploading}
                      className="text-rose-400 hover:text-rose-350 font-bold transition disabled:opacity-30 font-sans"
                    >
                      Clear Queue
                    </button>
                  </div>

                  <div className="space-y-3 pr-1">
                    {uploadQueue.map((item, idx) => {
                      const isPending = item.status === 'pending';
                      const isUploading = item.status === 'uploading';

                      return (
                        <div key={item.id} className="bg-slate-900/40 border border-white/5 p-4 rounded-2xl space-y-3 transition hover:border-slate-800 shadow-lg">
                          {/* Queue Item Header */}
                          <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0">
                              <span className="text-[9px] text-slate-550 font-bold uppercase tracking-wider block">File {idx + 1}</span>
                              <span className="text-xs font-bold text-slate-200 block truncate" title={item.file.name}>{item.file.name}</span>
                              <span className="text-[9px] text-slate-500 font-semibold font-sans">{(item.file.size / (1024 * 1024)).toFixed(2)} MB</span>
                              {item.message && item.status !== 'pending' && (
                                <span className={`text-[9px] font-extrabold uppercase font-sans ml-2.5 px-1.5 py-0.5 rounded border ${
                                  item.status === 'completed'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-450'
                                    : item.status === 'failed'
                                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-455'
                                    : item.status === 'cancelled'
                                    ? 'bg-slate-500/10 border-slate-500/20 text-slate-400'
                                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                }`}>
                                  {item.message}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Circular progress / status indicators */}
                              {isUploading ? (
                                (() => {
                                  const radius = 14;
                                  const circumference = 2 * Math.PI * radius;
                                  const strokeDashoffset = circumference - (item.progress / 100) * circumference;
                                  return (
                                    <div className="relative w-8 h-8 flex items-center justify-center">
                                      <svg className="w-8 h-8 transform -rotate-90">
                                        <circle
                                          cx="16"
                                          cy="16"
                                          r={radius}
                                          className="stroke-slate-800"
                                          strokeWidth="2.5"
                                          fill="transparent"
                                        />
                                        <circle
                                          cx="16"
                                          cy="16"
                                          r={radius}
                                          className="stroke-rose-500 transition-all duration-300 ease-out"
                                          strokeWidth="2.5"
                                          fill="transparent"
                                          strokeDasharray={circumference}
                                          strokeDashoffset={strokeDashoffset}
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                      <span className="absolute text-[8px] font-black text-rose-455">
                                        {item.progress}%
                                      </span>
                                    </div>
                                  );
                                })()
                              ) : item.status === 'completed' ? (
                                <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400" title="Completed">
                                  <Check className="w-4 h-4" />
                                </div>
                              ) : item.status === 'failed' ? (
                                <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400" title="Upload Failed">
                                  <AlertTriangle className="w-4 h-4" />
                                </div>
                              ) : item.status === 'cancelled' ? (
                                <div className="w-8 h-8 rounded-full bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-slate-400" title="Cancelled">
                                  <Ban className="w-4 h-4" />
                                </div>
                              ) : null}
                              
                              {isPending && (
                                <button 
                                  onClick={() => setUploadQueue(prev => prev.filter(q => q.id !== item.id))}
                                  className="p-1.5 hover:bg-white/5 rounded-lg text-slate-500 hover:text-rose-400 transition"
                                  title="Remove File"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
      </AppModal>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <div className="flex-1 min-w-0 space-y-4 w-full">
          <div className="flex justify-between items-center gap-3">
            <div className="hidden md:block">
              <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <Music className="w-8 h-8 text-rose-400 animate-pulse" /> Manage Tracks
              </h2>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {selectedTrackIds.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600/15 hover:bg-rose-600/25 border border-rose-500/30 rounded-xl text-xs font-bold text-rose-400 transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected ({selectedTrackIds.length})
                </button>
              )}
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white shadow-lg transition"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                Upload New Track
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-end">
            <ListSearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={
                isPlatformAdmin
                  ? 'Search by title, owner, or album...'
                  : 'Search by title, artist, or album...'
              }
            />
            <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TrackStatusFilter)}
                className="bg-slate-950 border border-white/5 rounded-xl p-2.5 outline-none focus:border-rose-500 text-slate-200 transition text-xs min-w-[140px]"
              >
                <option value="all">All Tracks</option>
                <option value="analyzing">Analyzing</option>
                <option value="transcoding">Transcoding</option>
                <option value="ready">Ready</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {isLoading && tracks.length === 0 ? (
          <TableSkeleton rows={8} variant="tracks-admin" />
        ) : tracks.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Music className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No tracks found. Upload tracks to see them here.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-5 w-10">
                  <input
                    type="checkbox"
                    checked={allTracksSelected}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                    aria-label="Select all tracks"
                  />
                </th>
                <th className="p-5">Track Details</th>
                {isPlatformAdmin && <th className="p-5">Owner</th>}
                {isStudioAdmin && <th className="p-5">Artist</th>}
                <th className="p-5">Acoustic Specs</th>
                <th className="p-5">Score</th>
                <th className="p-5">Live Status</th>
                <th className="p-5 text-center">Playback</th>
                <th className="p-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {tracks.map((t) => {
                const status = getStatusDetails(t);
                return (
                  <tr key={t.id} className={`hover:bg-slate-900/20 transition ${selectedTrackIds.includes(t.id) ? 'bg-rose-600/5' : ''}`}>
                    <td className="p-5">
                      <input
                        type="checkbox"
                        checked={selectedTrackIds.includes(t.id)}
                        onChange={() => toggleTrackSelection(t.id)}
                        className="w-3.5 h-3.5 accent-rose-500 cursor-pointer"
                        aria-label={`Select ${t.title}`}
                      />
                    </td>
                    <td className="p-5">
                      <div className="font-bold text-slate-200">{t.title}</div>
                      {t.album_title && <div className="text-[10px] text-slate-455 mt-0.5">Album: {t.album_title}</div>}
                    </td>
                    {isPlatformAdmin && (
                      <td className="p-5">
                        <div className="font-semibold text-slate-350">{formatTrackOwnerName(t)}</div>
                        {t.owner_email && (
                          <div className="text-[10px] text-slate-500 mt-0.5">{t.owner_email}</div>
                        )}
                      </td>
                    )}
                    {isStudioAdmin && (
                      <td className="p-5 font-semibold text-slate-350">
                        {t.artist_name || 'Unknown Artist'}
                      </td>
                    )}
                    <td className="p-5">
                      {t.file_format ? (
                        <div className="space-y-0.5 text-[10px] text-slate-400">
                          <div>Format: <strong className="text-slate-300">{t.file_format}</strong></div>
                          <div>Specs: <span className="text-slate-455">{t.sample_rate ? `${t.sample_rate}Hz` : 'N/A'} / {t.bit_depth ? `${t.bit_depth}-bit` : 'N/A'}</span></div>
                        </div>
                      ) : (
                        <span className="text-slate-650 italic">Pending analysis</span>
                      )}
                    </td>
                    <td className="p-5">
                      {t.quality_score !== null ? (
                        <button
                          onClick={() => onViewReport?.(t)}
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition hover:underline cursor-pointer ${
                            t.quality_score >= 86 
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                              : t.quality_score >= 71 
                                ? 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20' 
                                : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                          }`}
                          title="View spectral analysis report"
                        >
                          {t.quality_score}%
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="p-5">
                      <div className="space-y-1">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${status.style}`}>
                          {status.label}
                        </span>
                        <div className="text-[9px] text-slate-500 leading-normal">{status.desc}</div>
                      </div>
                    </td>
                    <td className="p-5 text-center">
                      <button
                        onClick={() => playTrack(t)}
                        disabled={!trackHasPlayableStream(t)}
                        title={
                          trackHasPlayableStream(t)
                            ? 'Preview original (any status)'
                            : 'Original file not available yet'
                        }
                        className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </td>
                    <td className="p-5">
                      <div className="flex items-center justify-center gap-2">
                        {/* Admin approval/rejection overrides */}
                        {currentUser?.role === 'admin' && t.quality_score !== null && (
                          <>
                            {t.approved ? (
                              <button
                                onClick={() => handleApproveToggle(t.id, false)}
                                className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-amber-500 hover:border-amber-500/30 transition"
                                title="Reject Track"
                              >
                                <Ban className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleApproveToggle(t.id, true)}
                                className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-emerald-500 hover:border-emerald-500/30 transition"
                                title="Approve Track"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                        {/* Edit details */}
                        <button
                          onClick={() => handleEditClick(t)}
                          className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30 transition"
                          title="Edit Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {/* Deletion */}
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-rose-500 hover:border-rose-500/30 transition"
                          title="Delete Track"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <LazyListSentinel
          hasMore={tracksList.hasMore}
          loading={tracksList.loadingMore}
          onLoadMore={tracksList.loadMore}
        />
      </div>

      <div className="md:hidden space-y-3">
        {isLoading && tracks.length === 0 ? (
          <TrackCardSkeleton count={4} withCheckbox />
        ) : tracks.length === 0 ? (
          <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
            <Music className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No tracks found. Upload tracks to see them here.</p>
          </div>
        ) : (
          tracks.map((t) => {
            const status = getStatusDetails(t);
            const isSelected = selectedTrackIds.includes(t.id);
            const canPlay = trackHasPlayableStream(t);

            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-4 space-y-3 transition ${
                  isSelected
                    ? 'border-rose-500/30 bg-rose-600/5'
                    : 'border-white/5 bg-slate-900/20'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleTrackSelection(t.id)}
                    className="w-4 h-4 mt-0.5 accent-rose-500 cursor-pointer flex-shrink-0"
                    aria-label={`Select ${t.title}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-200 truncate">{t.title}</div>
                    {t.album_title && (
                      <div className="text-[10px] text-slate-455 truncate mt-0.5">Album: {t.album_title}</div>
                    )}
                    {isPlatformAdmin && (
                      <div className="text-[10px] text-slate-350 truncate mt-0.5">
                        {formatTrackOwnerName(t)}
                        {t.owner_email ? ` · ${t.owner_email}` : ''}
                      </div>
                    )}
                    {isStudioAdmin && (
                      <div className="text-[10px] text-slate-350 truncate mt-0.5">
                        {t.artist_name || 'Unknown Artist'}
                      </div>
                    )}
                  </div>
                </div>

                {t.file_format ? (
                  <div className="text-[10px] text-slate-400 space-y-0.5">
                    <div>
                      Format: <strong className="text-slate-300">{t.file_format}</strong>
                    </div>
                    <div>
                      Specs:{' '}
                      <span className="text-slate-455">
                        {t.sample_rate ? `${t.sample_rate}Hz` : 'N/A'} /{' '}
                        {t.bit_depth ? `${t.bit_depth}-bit` : 'N/A'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-650 italic">Pending analysis</span>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {t.quality_score !== null ? (
                    <button
                      type="button"
                      onClick={() => onViewReport?.(t)}
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition ${
                        t.quality_score >= 86
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : t.quality_score >= 71
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'bg-rose-500/10 text-rose-400'
                      }`}
                      title="View spectral analysis report"
                    >
                      {t.quality_score}%
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-600">Score: —</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${status.style}`}>
                    {status.label}
                  </span>
                </div>

                <p className="text-[9px] text-slate-500 leading-normal">{status.desc}</p>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => playTrack(t)}
                    disabled={!canPlay}
                    className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Preview Audio"
                  >
                    <Play className={`w-4 h-4 fill-current ${currentTrack?.id === t.id && isPlaying ? 'text-rose-400' : ''}`} />
                  </button>

                  {currentUser?.role === 'admin' && t.quality_score !== null && (
                    t.approved ? (
                      <button
                        type="button"
                        onClick={() => handleApproveToggle(t.id, false)}
                        className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-amber-500 transition"
                        title="Reject Track"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApproveToggle(t.id, true)}
                        className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-emerald-500 transition"
                        title="Approve Track"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => handleEditClick(t)}
                    className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-cyan-400 transition"
                    title="Edit Details"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(t.id)}
                    className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-rose-500 transition"
                    title="Delete Track"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
        <LazyListSentinel
          hasMore={tracksList.hasMore}
          loading={tracksList.loadingMore}
          onLoadMore={tracksList.loadMore}
        />
      </div>
        </div>

        <aside className="w-full xl:w-[400px] xl:sticky xl:top-4 shrink-0 rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-md overflow-hidden max-h-[calc(100vh-6rem)] flex flex-col">
          <form onSubmit={handleEditSubmit} className="flex-1 flex flex-col min-h-0">
            {!hasEditorTarget ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <div className="space-y-2">
                  <Music className="w-8 h-8 text-slate-700 mx-auto" />
                  <p className="text-xs text-slate-500 font-sans">
                    Check one or more tracks to edit tags here.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                  {editError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-455 rounded-xl text-[11px] font-semibold text-center">
                      {editError}
                    </div>
                  )}

                  <BulkTagField
                    label="Track Title"
                    value={editTitle}
                    onChange={setEditTitle}
                    options={isMultiEdit ? multiOptions.title : [editTitle]}
                    required={isSingleEdit}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <BulkTagField
                      label="Artist"
                      value={editArtist}
                      onChange={setEditArtist}
                      options={isMultiEdit ? multiOptions.artist : [editArtist]}
                      required={isSingleEdit}
                    />
                    <BulkTagField
                      label="Album / Movie"
                      value={editAlbum}
                      onChange={(val) => {
                        setEditAlbum(val);
                        if (!isMultiEdit && val !== KEEP_SAME && suggestions.albums[val]) {
                          setEditCoverPreview(suggestions.albums[val]);
                          setEditCoverFile(null);
                        }
                      }}
                      options={isMultiEdit ? multiOptions.album : [editAlbum]}
                      placeholder="e.g. Singles Collection"
                    />
                    <BulkTagField
                      label="Album Artist"
                      value={editAlbumArtist}
                      onChange={setEditAlbumArtist}
                      options={isMultiEdit ? multiOptions.albumArtist : [editAlbumArtist]}
                      placeholder="Album artist"
                    />
                    <BulkTagField
                      label="Composer"
                      value={editComposer}
                      onChange={setEditComposer}
                      options={isMultiEdit ? multiOptions.composer : [editComposer]}
                      placeholder="Composer"
                    />
                    <BulkTagField
                      label="Year"
                      value={editYear}
                      onChange={setEditYear}
                      options={isMultiEdit ? multiOptions.year : [editYear]}
                      type="number"
                      placeholder="YYYY"
                    />
                    <BulkTagField
                      label="Track Number"
                      value={editTrackNumber}
                      onChange={setEditTrackNumber}
                      options={isMultiEdit ? multiOptions.trackNumber : [editTrackNumber]}
                      type="number"
                      placeholder="e.g. 3"
                      min={1}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <BulkTagField
                      label="Language"
                      value={editLanguage}
                      onChange={setEditLanguage}
                      options={isMultiEdit ? multiOptions.language : [editLanguage]}
                      list="languages-suggestions"
                      placeholder="e.g. English"
                    />
                    <BulkTagField
                      label="Genres"
                      value={editGenres}
                      onChange={setEditGenres}
                      options={isMultiEdit ? multiOptions.genres : [editGenres]}
                      placeholder="Ambient, Downtempo"
                    />
                  </div>

                  <div className="space-y-3">
                    <BulkTagField
                      label="Lyricist"
                      value={editLyricist}
                      onChange={setEditLyricist}
                      options={isMultiEdit ? multiOptions.lyricist : [editLyricist]}
                      placeholder="Lyricist"
                    />
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lyrics</label>
                        {isSingleEdit && (
                          <button
                            type="button"
                            onClick={handleTranscribeAI}
                            disabled={isTranscribing}
                            className="px-2 py-1 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-600/30 text-[10px] text-white font-bold rounded-lg transition"
                          >
                            {isTranscribing ? 'Transcribing...' : 'AI Transcribe'}
                          </button>
                        )}
                      </div>
                      <BulkTagField
                        label="Lyrics"
                        hideLabel
                        value={editLyrics}
                        onChange={setEditLyrics}
                        options={isMultiEdit ? multiOptions.lyrics : [editLyrics === KEEP_SAME ? '' : editLyrics]}
                        multiline
                        rows={4}
                        placeholder="Write or paste lyrics..."
                        onExpand={openLyricsModal}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <BulkTagField
                      label="Comment"
                      value={editComment}
                      onChange={setEditComment}
                      options={isMultiEdit ? multiOptions.comment : [editComment]}
                      placeholder="File tag comment"
                    />
                    <BulkTagField
                      label="Copyright"
                      value={editCopyright}
                      onChange={setEditCopyright}
                      options={isMultiEdit ? multiOptions.copyright : [editCopyright]}
                      placeholder="Copyright notice"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cover Art</label>
                    <div className="group relative w-full aspect-[4/3] rounded-2xl bg-slate-950 border border-white/5 overflow-hidden shadow-md">
                      {editCoverPreview ? (
                        <img src={editCoverPreview} alt="Cover preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-10 h-10 text-slate-700" />
                          {isMultiEdit && multiOptions.cover.length > 1 && !editCoverFile && (
                            <span className="absolute bottom-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                              &lt;Keep Same&gt;
                            </span>
                          )}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => editCoverInputRef.current?.click()}
                        aria-label={editCoverPreview ? 'Change cover art' : 'Add cover art'}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/55 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-60 transition-opacity cursor-pointer"
                      >
                        <Camera className="w-7 h-7" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {editCoverPreview || editCoverFile ? 'Change' : 'Add'}
                        </span>
                      </button>
                      <input
                        ref={editCoverInputRef}
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setEditCoverFile(file);
                            setEditCoverPreview(URL.createObjectURL(file));
                          }
                          if (editCoverInputRef.current) editCoverInputRef.current.value = '';
                        }}
                      />
                    </div>
                    {isMultiEdit && (
                      <p className="text-[10px] text-slate-500 font-sans">
                        Upload a new cover to apply it to all selected tracks. Leave unchanged to keep each track’s current cover.
                      </p>
                    )}
                  </div>

                  {isSingleEdit && editingTrack && (
                    <div className="p-3 bg-slate-950/50 border border-white/5 rounded-2xl space-y-2">
                      <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest font-sans">
                        Acoustic Specs
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-sans text-slate-400">
                        <span>Format: <strong className="text-slate-300">{editingTrack.file_format || 'N/A'}</strong></span>
                        <span>Sample: <strong className="text-slate-300">{editingTrack.sample_rate ? `${editingTrack.sample_rate} Hz` : 'N/A'}</strong></span>
                        <span>Depth: <strong className="text-slate-300">{editingTrack.bit_depth ? `${editingTrack.bit_depth}-bit` : 'N/A'}</strong></span>
                        <span>Score: <strong className="text-slate-300">{editingTrack.quality_score != null ? `${editingTrack.quality_score}%` : 'N/A'}</strong></span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-white/5 bg-slate-950/30 flex gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setSelectedTrackIds([])}
                    disabled={isSavingEdit}
                    className="flex-1 px-3 py-2.5 bg-slate-900 border border-white/5 hover:border-slate-800 rounded-xl text-xs font-bold text-slate-300 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEdit}
                    className="flex-[1.4] px-3 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white transition shadow-md shadow-rose-600/20"
                  >
                    {isSavingEdit
                      ? 'Saving...'
                      : isMultiEdit
                        ? `Apply to ${selectedTrackIds.length}`
                        : 'Save Tags'}
                  </button>
                </div>
              </>
            )}
          </form>
        </aside>
      </div>

      <AppModal
        open={isLyricsModalOpen}
        onClose={() => setIsLyricsModalOpen(false)}
        maxWidth="3xl"
        align="start"
        showGradient={false}
        panelClassName="bg-slate-900 max-h-[90vh] flex flex-col overflow-hidden"
        bodyClassName="flex-1 overflow-hidden p-0 min-h-0 flex flex-col"
        header={(
          <div className="flex items-center justify-between gap-3 pr-8">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-rose-400" />
                Edit Lyrics
              </h3>
              {editingTrack?.title && (
                <p className="text-xs text-slate-400 mt-0.5 font-sans truncate">{editingTrack.title}</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleTranscribeAI}
              disabled={isTranscribing}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-600/30 text-[10px] text-white font-bold rounded-lg transition"
            >
              {isTranscribing ? 'Transcribing...' : 'AI Transcribe'}
            </button>
          </div>
        )}
        footer={(
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsLyricsModalOpen(false)}
              className="px-4 py-2.5 bg-slate-900 border border-white/5 hover:border-slate-800 rounded-xl text-xs font-bold text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyLyricsDraft}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white transition"
            >
              Done
            </button>
          </div>
        )}
      >
        <textarea
          value={lyricsDraft}
          onChange={(e) => setLyricsDraft(e.target.value)}
          autoFocus
          className="flex-1 w-full min-h-[55vh] bg-slate-950 border-0 border-t border-white/5 p-5 text-sm outline-none focus:ring-0 text-slate-200 font-sans leading-relaxed resize-none"
          placeholder="Write or paste lyrics here..."
        />
      </AppModal>

      {/* Autocomplete Suggestions Datalists */}
      <datalist id="languages-suggestions">
        {suggestions.languages.map(lang => (
          <option key={lang} value={lang} />
        ))}
      </datalist>
    </div>
  );
};
