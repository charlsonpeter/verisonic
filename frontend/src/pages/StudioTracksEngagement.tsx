import React, { useState, useCallback } from 'react';
import { ArrowLeft, Disc, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLazyList, DEFAULT_LAZY_PAGE_SIZE } from '../hooks/useLazyList';
import { LazyListSentinel } from '../components/shared/LazyListSentinel';
import { ListSearchInput } from '../components/shared/ListSearchInput';
import { TableSkeleton, TrackCardSkeleton } from '../components/shared/skeleton';
import { TrackEngagementModal } from '../components/shared/TrackEngagementModal';

interface StudioRow {
  id: number;
  stage_name: string;
  city?: string;
  country?: string;
  owner_name?: string;
  is_active: boolean;
}

interface TrackRow {
  id: number;
  title: string;
  album_title?: string;
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
}

export const StudioTracksEngagement: React.FC = () => {
  const { token } = useAuth();
  const [view, setView] = useState<'studios' | 'tracks'>('studios');
  const [selectedStudio, setSelectedStudio] = useState<StudioRow | null>(null);
  const [studioSearch, setStudioSearch] = useState('');
  const [trackSearch, setTrackSearch] = useState('');
  const [engagementTrack, setEngagementTrack] = useState<TrackRow | null>(null);
  const [studiosError, setStudiosError] = useState<string | null>(null);
  const [tracksError, setTracksError] = useState<string | null>(null);

  const studiosList = useLazyList<StudioRow>({
    fetchPage: useCallback(async (offset, limit) => {
      if (!token) return { items: [], hasMore: false };
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (studioSearch.trim()) params.set('search', studioSearch.trim());
      const res = await fetch(`/api/auth/admin/studios?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (offset === 0) {
          setStudiosError(typeof data.detail === 'string' ? data.detail : 'Could not load studios.');
        }
        return { items: [], hasMore: false };
      }
      if (offset === 0) setStudiosError(null);
      const data = await res.json();
      return { items: data.items ?? [], hasMore: Boolean(data.has_more) };
    }, [token, studioSearch]),
    resetKey: view === 'studios' ? studioSearch : 'tracks-view',
    enabled: view === 'studios' && !!token,
    pageSize: DEFAULT_LAZY_PAGE_SIZE,
  });

  const tracksList = useLazyList<TrackRow>({
    fetchPage: useCallback(async (offset, limit) => {
      if (!token || !selectedStudio) return { items: [], hasMore: false };
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (trackSearch.trim()) params.set('search', trackSearch.trim());
      const res = await fetch(
        `/api/auth/admin/studios/${selectedStudio.id}/tracks?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (offset === 0) {
          setTracksError(typeof data.detail === 'string' ? data.detail : 'Could not load tracks.');
        }
        return { items: [], hasMore: false };
      }
      if (offset === 0) setTracksError(null);
      const data = await res.json();
      return { items: data.items ?? [], hasMore: Boolean(data.has_more) };
    }, [token, selectedStudio?.id, trackSearch]),
    resetKey: view === 'tracks' && selectedStudio ? `${selectedStudio.id}-${trackSearch}` : 'studios-view',
    enabled: view === 'tracks' && !!token && !!selectedStudio,
    pageSize: DEFAULT_LAZY_PAGE_SIZE,
  });

  const openStudio = (studio: StudioRow) => {
    setSelectedStudio(studio);
    setTrackSearch('');
    setTracksError(null);
    setView('tracks');
  };

  const backToStudios = () => {
    setView('studios');
    setSelectedStudio(null);
    setEngagementTrack(null);
    setTracksError(null);
  };

  const renderEngagementCell = (t: TrackRow) => (
    <button
      type="button"
      onClick={() => setEngagementTrack(t)}
      className="inline-flex items-center gap-2 text-[10px] font-bold text-slate-400 hover:text-white transition"
      title="View engagement"
    >
      <span className="inline-flex items-center gap-0.5 text-emerald-400">
        <ThumbsUp className="w-3 h-3" /> {t.like_count ?? 0}
      </span>
      <span className="text-slate-600">·</span>
      <span className="inline-flex items-center gap-0.5 text-rose-400">
        <ThumbsDown className="w-3 h-3" /> {t.dislike_count ?? 0}
      </span>
      <span className="text-slate-600">·</span>
      <span className="inline-flex items-center gap-0.5 text-slate-300">
        <MessageSquare className="w-3 h-3" /> {t.comment_count ?? 0}
      </span>
    </button>
  );

  if (view === 'studios') {
    const studios = studiosList.items;
    const isLoading = studiosList.loading;

    return (
      <div className="space-y-6 w-full max-w-[90rem] animate-page-entry font-sans">
        <div className="hidden md:block">
          <h2 className="text-3xl font-extrabold tracking-tight text-white">Studio Tracks</h2>
        </div>

        <ListSearchInput
          value={studioSearch}
          onChange={setStudioSearch}
          placeholder="Search studios..."
          className="w-full sm:w-auto"
        />

        {studiosError && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {studiosError}
          </div>
        )}

        <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
          {isLoading && studios.length === 0 ? (
            <TableSkeleton rows={6} columns={4} variant="generic" />
          ) : studios.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <Disc className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500">No studios found.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                  <th className="p-5">Studio</th>
                  <th className="p-5">Location</th>
                  <th className="p-5">Owner</th>
                  <th className="p-5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {studios.map((studio) => (
                  <tr
                    key={studio.id}
                    onClick={() => openStudio(studio)}
                    className="hover:bg-slate-900/20 transition cursor-pointer"
                  >
                    <td className="p-5 font-bold text-slate-200">{studio.stage_name}</td>
                    <td className="p-5 text-slate-400">
                      {[studio.city, studio.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="p-5 text-slate-400">{studio.owner_name || '—'}</td>
                    <td className="p-5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                          studio.is_active
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450'
                            : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                        }`}
                      >
                        {studio.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <LazyListSentinel
            hasMore={studiosList.hasMore}
            loading={studiosList.loadingMore}
            onLoadMore={studiosList.loadMore}
          />
        </div>

        <div className="md:hidden space-y-3">
          {isLoading && studios.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">Loading studios...</p>
          ) : studios.length === 0 ? (
            <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
              <Disc className="w-10 h-10 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500">No studios found.</p>
            </div>
          ) : (
            studios.map((studio) => (
              <button
                key={studio.id}
                type="button"
                onClick={() => openStudio(studio)}
                className="w-full text-left rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-2 active:bg-slate-900/40 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="font-bold text-slate-200">{studio.stage_name}</div>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border flex-shrink-0 ${
                      studio.is_active
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450'
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                    }`}
                  >
                    {studio.is_active ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  {[studio.city, studio.country].filter(Boolean).join(', ') || 'No location'}
                </p>
                <p className="text-[10px] text-slate-500">{studio.owner_name || 'Unknown owner'}</p>
              </button>
            ))
          )}
          <LazyListSentinel
            hasMore={studiosList.hasMore}
            loading={studiosList.loadingMore}
            onLoadMore={studiosList.loadMore}
          />
        </div>
      </div>
    );
  }

  const tracks = tracksList.items;
  const tracksLoading = tracksList.loading;

  return (
    <div className="space-y-6 w-full max-w-[90rem] animate-page-entry font-sans">
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={backToStudios}
          className="p-2 rounded-xl border border-white/5 bg-slate-900/60 text-slate-400 hover:text-white transition flex-shrink-0"
          aria-label="Back to studios"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 hidden md:block">
          <h2 className="text-3xl font-extrabold tracking-tight text-white truncate">
            {selectedStudio?.stage_name || 'Studio'}
          </h2>
        </div>
      </div>

      <ListSearchInput
        value={trackSearch}
        onChange={setTrackSearch}
        placeholder="Search tracks..."
        className="w-full sm:w-auto"
      />

      {tracksError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {tracksError}
        </div>
      )}

      <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
        {tracksLoading && tracks.length === 0 ? (
          <TableSkeleton rows={6} columns={2} variant="generic" />
        ) : tracks.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <Disc className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No approved tracks for this studio.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-5">Track</th>
                <th className="p-5">Engagement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tracks.map((t) => (
                <tr key={t.id} className="hover:bg-slate-900/20 transition">
                  <td className="p-5">
                    <div className="font-bold text-slate-200">{t.title}</div>
                    {t.album_title && (
                      <div className="text-[10px] text-slate-455 mt-0.5">Album: {t.album_title}</div>
                    )}
                  </td>
                  <td className="p-5">{renderEngagementCell(t)}</td>
                </tr>
              ))}
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
        {tracksLoading && tracks.length === 0 ? (
          <TrackCardSkeleton count={4} withCheckbox={false} />
        ) : tracks.length === 0 ? (
          <div className="p-12 text-center space-y-3 rounded-2xl border border-white/5 bg-slate-900/10">
            <Disc className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">No approved tracks for this studio.</p>
          </div>
        ) : (
          tracks.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
            >
              <div className="min-w-0">
                <div className="font-bold text-slate-200 truncate">{t.title}</div>
                {t.album_title && (
                  <div className="text-[10px] text-slate-455 truncate mt-0.5">Album: {t.album_title}</div>
                )}
              </div>
              {renderEngagementCell(t)}
            </div>
          ))
        )}
        <LazyListSentinel
          hasMore={tracksList.hasMore}
          loading={tracksList.loadingMore}
          onLoadMore={tracksList.loadMore}
        />
      </div>

      <TrackEngagementModal
        trackId={engagementTrack?.id ?? null}
        trackTitle={engagementTrack?.title}
        open={!!engagementTrack}
        onClose={() => setEngagementTrack(null)}
      />
    </div>
  );
};
