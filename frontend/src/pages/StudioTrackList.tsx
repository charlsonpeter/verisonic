import React, { useState, useEffect } from 'react';
import { Music, RefreshCw, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { trackHasPlayableStream } from '../utils/streamQuality';

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
  const { token } = useAuth();
  const { playTrack, currentTrack, isPlaying } = useAudio();
  const [tracks, setTracks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTracks = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await fetch('/api/music/manage', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setTracks(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch tracks:', e);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  useEffect(() => {
    if (!token) return;

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/api/music/ws/tracks/status?token=${token}`;
    const socket = new WebSocket(wsUrl);

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

      <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {isLoading && tracks.length === 0 ? (
          <p className="p-8 text-xs text-slate-500 text-center">Loading your tracks...</p>
        ) : tracks.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Music className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No tracks uploaded yet.</p>
            <p className="text-[10px] text-slate-600">Use Upload &amp; Manage Tracks from your account menu to add music.</p>
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
                        disabled={!trackHasPlayableStream(t, token)}
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
    </div>
  );
};
