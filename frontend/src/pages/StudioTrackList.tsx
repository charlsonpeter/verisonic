import React, { useState, useEffect } from 'react';
import { Music, RefreshCw, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { trackHasPlayableStream } from '../utils/streamQuality';
import { createAuthenticatedWebSocket } from '../utils/authTokens';
import { TableSkeleton } from '../components/shared/skeleton';

function getStatusDetails(t: {
  quality_score: number | null;
  approved: boolean;
  hls_playlist_path: string | null;
}) {
  if (t.quality_score === null) {
    return { label: 'Analyzing', style: 'bg-amber-500/10 border-amber-500/20 text-amber-400', desc: 'Running spectral checks...' };
  }
  if (t.approved && !t.hls_playlist_path) {
    return { label: 'Transcoding', style: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', desc: 'Generating adaptive streaming files...' };
  }
  if (t.approved && t.hls_playlist_path) {
    return { label: 'Ready', style: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', desc: 'Live on platform' };
  }
  return { label: 'Rejected', style: 'bg-rose-500/10 border-rose-500/20 text-rose-455', desc: 'Failed spectral cutoff checks' };
}

export const StudioTrackList: React.FC = () => {
  const { token, isStaffInAdminMode, isSwitchingMode } = useAuth();
  const { playTrack, currentTrack, isPlaying } = useAudio();
  const [tracks, setTracks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchTracks = async (silent = false) => {
    if (!silent) setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/music/manage?approved_only=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTracks(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setFetchError(data.detail || 'Could not load tracks.');
        setTracks([]);
      }
    } catch (e) {
      console.error('Failed to fetch tracks:', e);
      setFetchError('Could not load tracks.');
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !isStaffInAdminMode) {
      setFetchError(null);
      return;
    }
    fetchTracks();
  }, [token, isStaffInAdminMode]);

  useEffect(() => {
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/music/ws/tracks/status`;
    const socket = createAuthenticatedWebSocket(wsUrl, token);
    if (!socket) return;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'status_updates') return;

        const updates = data.tracks;
        setTracks((prev) => {
          const hasNew = updates.some((u: { track_id: number }) =>
            !prev.some((t) => t.id === u.track_id)
          );
          if (hasNew) {
            setTimeout(() => fetchTracks(true), 0);
          }
          return prev.map((track) => {
            const update = updates.find((u: { track_id: number }) => u.track_id === track.id);
            if (!update) return track;
            return {
              ...track,
              quality_score: update.quality_score,
              quality_level: update.quality_level,
              approved: update.approved,
            };
          });
        });
      } catch {
        /* ignore malformed messages */
      }
    };

    return () => socket.close();
  }, [token]);

  return (
    <div className="space-y-6 font-sans">
      <div className="hidden md:flex items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white mb-1">Tracks List</h2>
          <p className="text-sm text-slate-400">All tracks you have uploaded to the platform.</p>
        </div>
        <button
          onClick={() => fetchTracks()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900/60 border border-white/5 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:border-slate-700 transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="md:hidden flex justify-end">
        <button
          onClick={() => fetchTracks()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border border-white/5 rounded-xl text-xs font-bold text-slate-300 active:text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {fetchError}
        </div>
      )}

      {isSwitchingMode && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-400">
          Switching mode…
        </div>
      )}

      <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {isLoading && tracks.length === 0 ? (
          <TableSkeleton rows={6} columns={6} />
        ) : tracks.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Music className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No approved tracks yet.</p>
            <p className="text-[10px] text-slate-600">Approved tracks will appear here once analysis passes.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-5">Track</th>
                <th className="p-5">Acoustic Specs</th>
                <th className="p-5">Score</th>
                <th className="p-5">Status</th>
                <th className="p-5">Uploaded</th>
                <th className="p-5 text-center">Play</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tracks.map((t) => {
                const status = getStatusDetails(t);
                return (
                  <tr key={t.id} className="hover:bg-slate-900/20 transition">
                    <td className="p-5">
                      <div className="font-bold text-slate-200">{t.title}</div>
                      {t.album_title && (
                        <div className="text-[10px] text-slate-455 mt-0.5">Album: {t.album_title}</div>
                      )}
                    </td>
                    <td className="p-5">
                      {t.file_format ? (
                        <div className="space-y-0.5 text-[10px] text-slate-400">
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
                        <span className="text-slate-650 italic">Pending analysis</span>
                      )}
                    </td>
                    <td className="p-5">
                      {t.quality_score !== null ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            t.quality_score >= 86
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : t.quality_score >= 71
                                ? 'bg-cyan-500/10 text-cyan-400'
                                : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {t.quality_score}%
                        </span>
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
                    <td className="p-5 text-slate-450 text-[10px] font-medium">
                      {t.created_at
                        ? new Date(t.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="p-5 text-center">
                      <button
                        onClick={() => playTrack(t)}
                        disabled={!trackHasPlayableStream(t)}
                        className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-rose-400 hover:border-rose-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition"
                        title="Preview Audio"
                      >
                        <Play className={`w-3.5 h-3.5 fill-current ${currentTrack?.id === t.id && isPlaying ? 'text-rose-400' : ''}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="md:hidden space-y-3">
        {isLoading && tracks.length === 0 ? (
          <TableSkeleton rows={6} columns={6} />
        ) : tracks.length === 0 ? (
          <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
            <Music className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No approved tracks yet.</p>
            <p className="text-[10px] text-slate-600">Approved tracks will appear here once analysis passes.</p>
          </div>
        ) : (
          tracks.map((t) => {
            const status = getStatusDetails(t);
            return (
              <div
                key={t.id}
                className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-200 truncate">{t.title}</div>
                    {t.album_title && (
                      <div className="text-[10px] text-slate-455 truncate mt-0.5">Album: {t.album_title}</div>
                    )}
                  </div>
                  <button
                    onClick={() => playTrack(t)}
                    disabled={!trackHasPlayableStream(t)}
                    className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 active:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0"
                    title="Preview Audio"
                  >
                    <Play className={`w-4 h-4 fill-current ${currentTrack?.id === t.id && isPlaying ? 'text-rose-400' : ''}`} />
                  </button>
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
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        t.quality_score >= 86
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : t.quality_score >= 71
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {t.quality_score}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-600">Score: —</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${status.style}`}>
                    {status.label}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {t.created_at
                      ? new Date(t.created_at).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })
                      : '—'}
                  </span>
                </div>

                <p className="text-[9px] text-slate-500 leading-normal">{status.desc}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
