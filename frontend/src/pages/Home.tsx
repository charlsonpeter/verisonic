import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Flame, Award, Sparkles, Clock 
} from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { TrackRow } from '../components/shared/TrackRow';
import {
  TrackRowSkeleton,
  RecentlyPlayedSkeleton,
  TrendingMobileSkeleton,
  ArtistTileSkeleton,
  ArtistListSkeleton,
  MOBILE_SCROLL_STRIP,
  MOBILE_GRID_PAGE,
} from '../components/shared/skeleton';

import { DEFAULT_COVER_FALLBACK } from '../utils/constants';
import { buildArtistCandidatesFromTracks } from '../utils/searchMatch';

interface StudioBrowseItem {
  stage_name: string;
  cover_art_url?: string | null;
}

interface HomeProps {
  onNavigate: (tab: string) => void;
  onViewDetails: (track: Track) => void;
  onArtistClick: (artistName: string) => void;
}

const RECENT_MOBILE_PAGE_SIZE = 9;
const RECENT_DESKTOP_BATCH_SIZE = 27;
const RECENT_DESKTOP_VISIBLE_ROWS = 9;
const RECENT_MAX_TRACKS = 18;
const TRENDING_DESKTOP_COUNT = 10;
const TRENDING_MOBILE_COUNT = 9;
const POPULAR_ARTISTS_MAX = 10;

/** Split into fixed-size pages. Pad the last page to a full 3×3 only when there is more than one page. */
function chunkIntoMobilePages<T>(items: T[], pageSize: number): (T | null)[][] {
  if (items.length === 0) return [];
  const pages: (T | null)[][] = [];
  for (let i = 0; i < items.length; i += pageSize) {
    pages.push(items.slice(i, i + pageSize));
  }
  if (pages.length > 1) {
    const last = pages[pages.length - 1];
    while (last.length < pageSize) {
      last.push(null);
    }
  }
  return pages;
}

const CompactTilePlaceholder: React.FC = () => (
  <div className="w-full min-w-0 pointer-events-none invisible" aria-hidden>
    <div className="w-full aspect-square rounded-xl mb-1.5" />
    <div className="h-[10px]" />
    <div className="h-[9px]" />
  </div>
);

const RecentRowCard: React.FC<{ track: Track; onPlay: () => void }> = ({ track, onPlay }) => (
  <div
    role="button"
    tabIndex={0}
    onClick={onPlay}
    onKeyDown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onPlay();
      }
    }}
    className="flex bg-slate-900/20 hover:bg-slate-900/40 rounded-2xl p-3 items-center gap-3 transition duration-200 cursor-pointer group min-h-[4.25rem]"
  >
    <div className="w-11 h-11 bg-slate-800 rounded-xl overflow-hidden relative flex-shrink-0">
      <img src={track.cover_art_url} alt="" className="w-full h-full object-cover" />
      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
        <Play className="w-4 h-4 text-white fill-current" />
      </div>
    </div>
    <div className="flex-1 min-w-0">
      <h4 className="text-[11px] font-bold text-slate-200 truncate">{track.title}</h4>
      <p className="text-[10px] text-slate-400 truncate mt-0.5">{track.artist_name}</p>
    </div>
  </div>
);

const TrackTile: React.FC<{
  track: Track;
  onPlay: () => void;
  compact?: boolean;
}> = ({ track, onPlay, compact = false }) => (
  <button
    type="button"
    onClick={onPlay}
    className="text-left group active:scale-[0.98] transition w-full min-w-0"
  >
    <div
      className={`w-full aspect-square overflow-hidden bg-slate-800 relative ${
        compact ? 'rounded-xl mb-1.5' : 'rounded-2xl mb-2'
      }`}
    >
      {track.cover_art_url ? (
        <img src={track.cover_art_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-slate-900 to-rose-950">
          <Play className={`text-slate-600 ${compact ? 'w-5 h-5' : 'w-8 h-8'}`} />
        </div>
      )}
      <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-active:opacity-100 flex items-center justify-center transition">
        <Play className={`text-white fill-current ml-0.5 ${compact ? 'w-5 h-5' : 'w-8 h-8'}`} />
      </div>
    </div>
    <h4 className={`font-bold text-slate-200 truncate ${compact ? 'text-[10px]' : 'text-xs'}`}>
      {track.title}
    </h4>
    <p
      className={`text-slate-400 truncate ${compact ? 'text-[9px] mt-0' : 'text-[10px] mt-0.5'}`}
    >
      {track.artist_name}
    </p>
  </button>
);

const ArtistTile: React.FC<{
  name: string;
  tracks: number;
  avatar: string;
  onClick: () => void;
}> = ({ name, tracks, avatar, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex-shrink-0 w-[5.5rem] text-center group active:scale-[0.98] transition"
  >
    <div className="w-[5.5rem] aspect-square rounded-xl overflow-hidden bg-slate-800 mb-1.5 p-2.5 flex items-center justify-center group-hover:bg-slate-800/80">
      <div className="w-full h-full rounded-full overflow-hidden">
        <img src={avatar} alt="" className="w-full h-full object-cover" />
      </div>
    </div>
    <h4 className="text-[10px] font-bold text-slate-200 truncate group-hover:text-rose-400 transition">{name}</h4>
    <p className="text-[9px] text-slate-550 truncate mt-0">{tracks} Tracks</p>
  </button>
);

export const Home: React.FC<HomeProps> = ({ onNavigate, onViewDetails, onArtistClick }) => {
  const { playTrack } = useAudio();
  const { currentUser, hasRadioStation, token, canAccessListeningHistory } = useAuth();

  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [studioCovers, setStudioCovers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [isLoadingMoreRecent, setIsLoadingMoreRecent] = useState(false);
  const [hasMoreRecent, setHasMoreRecent] = useState(true);
  const recentOffsetRef = useRef(0);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const mobileLoadMoreRef = useRef<HTMLDivElement>(null);
  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const desktopLoadMoreRef = useRef<HTMLDivElement>(null);

  const recentMobilePages = chunkIntoMobilePages(recentlyPlayed, RECENT_MOBILE_PAGE_SIZE);

  const appendRecentTracks = useCallback((tracks: Track[]) => {
    if (tracks.length === 0) return;
    setRecentlyPlayed((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const merged = [...prev];
      for (const track of tracks) {
        if (merged.length >= RECENT_MAX_TRACKS) {
          break;
        }
        if (!existingIds.has(track.id)) {
          merged.push(track);
        }
      }
      return merged;
    });
  }, []);

  const fetchRecentBatch = useCallback(async (limit: number, offset: number) => {
    const res = await fetch(
      `/api/music/listening-history?limit=${limit}&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      return { tracks: [] as Track[], hasMore: false };
    }
    const entries = (await res.json()) as { track: Track }[];
    const tracks = entries.map((entry) => entry.track);
    return { tracks, hasMore: tracks.length >= limit };
  }, [token]);

  const getInitialBatchSize = () =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
      ? Math.min(RECENT_DESKTOP_BATCH_SIZE, RECENT_MAX_TRACKS)
      : Math.min(RECENT_MOBILE_PAGE_SIZE, RECENT_MAX_TRACKS);

  const popularArtists = buildArtistCandidatesFromTracks(allTracks)
    .slice(0, POPULAR_ARTISTS_MAX)
    .map((art) => {
      const normalized = art.name.toLowerCase().trim();
      return {
        name: art.name,
        genre: art.file_format || 'Artist',
        tracks: art.trackCount,
        avatar:
          studioCovers[normalized]
          || art.cover_art_url
          || DEFAULT_COVER_FALLBACK,
      };
    });

  const trendingDesktopTracks = allTracks.slice(0, TRENDING_DESKTOP_COUNT);
  const trendingMobileTracks = allTracks.slice(0, TRENDING_MOBILE_COUNT);
  const trackPages = chunkIntoMobilePages(trendingMobileTracks, TRENDING_MOBILE_COUNT);

  useEffect(() => {
    const loadStudios = async () => {
      try {
        const res = await fetch('/api/discovery/studios');
        if (!res.ok) return;
        const studios = (await res.json()) as StudioBrowseItem[];
        const map: Record<string, string> = {};
        for (const studio of studios) {
          if (studio.cover_art_url) {
            map[studio.stage_name.toLowerCase().trim()] = studio.cover_art_url;
          }
        }
        setStudioCovers(map);
      } catch {
        /* optional enrichment */
      }
    };
    void loadStudios();
  }, []);

  useEffect(() => {
    const loadTracks = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/discovery/trending?limit=${TRENDING_DESKTOP_COUNT}`);
        if (res.ok) {
          const data = await res.json();
          setAllTracks(data);
          return;
        }
        throw new Error('trending fetch failed');
      } catch (e) {
        console.error('Failed to load trending tracks:', e);
        setAllTracks([]);
      } finally {
        setIsLoading(false);
      }
    };
    void loadTracks();
  }, []);

  useEffect(() => {
    if (!canAccessListeningHistory) {
      setRecentlyPlayed([]);
      setHasMoreRecent(false);
      return;
    }
    const loadRecent = async () => {
      setIsLoadingRecent(true);
      setHasMoreRecent(true);
      recentOffsetRef.current = 0;
      try {
        const batchSize = getInitialBatchSize();
        const { tracks, hasMore } = await fetchRecentBatch(batchSize, 0);
        const limitedTracks = tracks.slice(0, RECENT_MAX_TRACKS);
        setRecentlyPlayed(limitedTracks);
        recentOffsetRef.current = limitedTracks.length;
        setHasMoreRecent(hasMore && limitedTracks.length < RECENT_MAX_TRACKS);
      } catch {
        setRecentlyPlayed([]);
        setHasMoreRecent(false);
      } finally {
        setIsLoadingRecent(false);
      }
    };
    void loadRecent();
  }, [canAccessListeningHistory, fetchRecentBatch]);

  const loadMoreRecent = useCallback(async (batchSize: number) => {
    if (isLoadingMoreRecent || isLoadingRecent || !hasMoreRecent || !canAccessListeningHistory) {
      return;
    }
    const remaining = RECENT_MAX_TRACKS - recentlyPlayed.length;
    if (remaining <= 0) {
      setHasMoreRecent(false);
      return;
    }
    setIsLoadingMoreRecent(true);
    try {
      const { tracks, hasMore } = await fetchRecentBatch(Math.min(batchSize, remaining), recentOffsetRef.current);
      if (tracks.length === 0) {
        setHasMoreRecent(false);
        return;
      }
      const limitedTracks = tracks.slice(0, remaining);
      appendRecentTracks(limitedTracks);
      const nextCount = recentlyPlayed.length + limitedTracks.length;
      recentOffsetRef.current += limitedTracks.length;
      setHasMoreRecent(hasMore && nextCount < RECENT_MAX_TRACKS);
    } catch {
      setHasMoreRecent(false);
    } finally {
      setIsLoadingMoreRecent(false);
    }
  }, [
    appendRecentTracks,
    canAccessListeningHistory,
    fetchRecentBatch,
    hasMoreRecent,
    isLoadingMoreRecent,
    isLoadingRecent,
    recentlyPlayed.length,
  ]);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    const root = mobileScrollRef.current;
    const target = mobileLoadMoreRef.current;
    if (!root || !target || !canAccessListeningHistory || !hasMoreRecent) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreRecent(RECENT_MOBILE_PAGE_SIZE);
        }
      },
      { root, rootMargin: '80px', threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canAccessListeningHistory, hasMoreRecent, loadMoreRecent, recentlyPlayed.length]);

  useEffect(() => {
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    const root = desktopScrollRef.current;
    const target = desktopLoadMoreRef.current;
    if (!root || !target || !canAccessListeningHistory || !hasMoreRecent) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMoreRecent(RECENT_DESKTOP_BATCH_SIZE);
        }
      },
      { root, rootMargin: '120px', threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canAccessListeningHistory, hasMoreRecent, loadMoreRecent, recentlyPlayed.length]);

  const desktopScrollMaxHeight = `calc(${RECENT_DESKTOP_VISIBLE_ROWS} * 4.25rem + ${RECENT_DESKTOP_VISIBLE_ROWS - 1} * 0.75rem)`;

  return (
    <div className="space-y-8 md:space-y-12 w-full">
      
      {/* Promoted Studio Admin Setup Banner */}
      {(currentUser?.real_role || currentUser?.role) === 'studio_admin' && !currentUser?.artist_profile?.profile_complete && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-cyan-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-fade-in group">
          <div className="absolute top-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-700" />
          <div className="space-y-2 relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-[10px] text-cyan-400 font-extrabold uppercase tracking-widest font-sans">
              <Sparkles className="w-3.5 h-3.5 text-cyan-455" /> Action Required: Studio Setup
            </span>
            <h3 className="text-lg font-extrabold text-white tracking-tight leading-tight">Complete Your Studio Admin Registration</h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed font-sans font-medium">
              Welcome to the team! Please complete your studio profile with contact and location details before uploading tracks.
            </p>
          </div>
          <button 
            onClick={() => onNavigate('studio-profile')}
            className="relative z-10 flex-shrink-0 px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-550/20 hover:scale-[1.02] hover:shadow-cyan-550/30 transition duration-300 uppercase tracking-wider cursor-pointer"
          >
            Complete Studio Profile
          </button>
        </div>
      )}

      {/* Promoted Radio Admin Setup Banner */}
      {(currentUser?.real_role || currentUser?.role) === 'radio_admin' && !hasRadioStation && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-rose-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-fade-in group">
          <div className="absolute top-0 left-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-rose-500/10 transition-all duration-700" />
          <div className="space-y-2 relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-[10px] text-rose-400 font-extrabold uppercase tracking-widest font-sans">
              <Sparkles className="w-3.5 h-3.5 text-rose-455" /> Action Required: Station Setup
            </span>
            <h3 className="text-lg font-extrabold text-white tracking-tight leading-tight">Register Your Live Radio Node</h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed font-sans font-medium">
              Your account has been promoted to Radio Admin! Please register your radio station node and download the broadcast tools to start streaming.
            </p>
          </div>
          <button 
            onClick={() => onNavigate('radio')}
            className="relative z-10 flex-shrink-0 px-6 py-3 bg-gradient-to-r from-rose-600 to-rose-500 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-600/20 hover:scale-[1.02] hover:shadow-rose-600/30 transition duration-300 uppercase tracking-wider cursor-pointer"
          >
            Setup Radio Station
          </button>
        </div>
      )}

      {/* Recently Played — mobile 3×3 horizontal pages; desktop 3×9 vertical scroll */}
      {canAccessListeningHistory && isLoadingRecent && (
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
            <Clock className="w-5 h-5 text-rose-400" /> Recently Played
          </h3>
          <RecentlyPlayedSkeleton />
        </section>
      )}
      {canAccessListeningHistory && !isLoadingRecent && recentlyPlayed.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
            <Clock className="w-5 h-5 text-rose-400" /> Recently Played
          </h3>

          {/* Mobile: 3×3 pages, horizontal scroll + lazy load */}
          <div ref={mobileScrollRef} className={MOBILE_SCROLL_STRIP}>
            {recentMobilePages.map((page, pageIdx) => (
              <div
                key={pageIdx}
                className={MOBILE_GRID_PAGE}
              >
                {page.map((track, slotIdx) =>
                  track ? (
                    <TrackTile
                      key={`recent-mobile-${track.id}-${pageIdx}`}
                      track={track}
                      onPlay={() => playTrack(track)}
                      compact
                    />
                  ) : (
                    <CompactTilePlaceholder key={`recent-pad-${pageIdx}-${slotIdx}`} />
                  )
                )}
              </div>
            ))}
            {isLoadingMoreRecent && (
              <div className={MOBILE_GRID_PAGE}>
                {Array.from({ length: RECENT_MOBILE_PAGE_SIZE }).map((_, idx) => (
                  <div key={idx} className="w-full min-w-0">
                    <div className="w-full aspect-square rounded-xl bg-slate-800/60 animate-pulse mb-1.5" />
                    <div className="h-2.5 bg-slate-800/60 rounded animate-pulse w-4/5 mb-1" />
                    <div className="h-2 bg-slate-800/40 rounded animate-pulse w-3/5" />
                  </div>
                ))}
              </div>
            )}
            {hasMoreRecent && (
              <div ref={mobileLoadMoreRef} className="w-2 flex-shrink-0 snap-start" aria-hidden />
            )}
          </div>

          {/* Desktop: 3 columns × 9 visible rows, vertical scroll + lazy load */}
          <div
            ref={desktopScrollRef}
            className="hidden md:block overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.35)_transparent]"
            style={{ maxHeight: desktopScrollMaxHeight }}
          >
            <div className="grid grid-cols-3 gap-3">
              {recentlyPlayed.map((track) => (
                <RecentRowCard
                  key={`recent-desktop-${track.id}`}
                  track={track}
                  onPlay={() => playTrack(track)}
                />
              ))}
              {isLoadingMoreRecent &&
                Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`recent-desktop-skeleton-${idx}`}
                    className="flex bg-slate-900/20 rounded-2xl p-3 items-center gap-3 min-h-[4.25rem] animate-pulse"
                  >
                    <div className="w-11 h-11 rounded-xl bg-slate-800/60 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 bg-slate-800/60 rounded w-3/5" />
                      <div className="h-2 bg-slate-800/40 rounded w-2/5" />
                    </div>
                  </div>
                ))}
            </div>
            {hasMoreRecent && (
              <div ref={desktopLoadMoreRef} className="h-4 w-full" aria-hidden />
            )}
          </div>
        </section>
      )}

      {/* Trending + Popular Artists */}
      <section className="flex flex-col gap-4 md:gap-5 lg:grid lg:grid-cols-12 lg:gap-8">
        
        {/* Trending tracks */}
        <div className="lg:col-span-8 space-y-2 md:space-y-4">
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-rose-400 animate-pulse" /> Trending Now
            </h3>
          </div>

          {/* Mobile: 3×3 pages, row-major within each page, scroll horizontally */}
          {isLoading ? (
            <TrendingMobileSkeleton tileCount={TRENDING_MOBILE_COUNT} />
          ) : (
          <div className={MOBILE_SCROLL_STRIP}>
            {trackPages.map((page, pageIdx) => (
              <div
                key={pageIdx}
                className={MOBILE_GRID_PAGE}
              >
                {page.map((track, slotIdx) =>
                  track ? (
                    <TrackTile
                      key={track.id}
                      track={track}
                      onPlay={() => playTrack(track)}
                      compact
                    />
                  ) : (
                    <CompactTilePlaceholder key={`trending-pad-${pageIdx}-${slotIdx}`} />
                  )
                )}
              </div>
            ))}
          </div>
          )}

          {/* Desktop: list view */}
          <div className="hidden md:block space-y-2 bg-slate-950/40 backdrop-blur-md p-5 rounded-3xl shadow-inner glow-rose/5">
            {isLoading ? (
              <TrackRowSkeleton count={TRENDING_DESKTOP_COUNT} borderless />
            ) : (
            trendingDesktopTracks.map((track, index) => (
              <TrackRow
                key={track.id}
                track={track}
                index={index}
                onViewDetails={onViewDetails}
                borderless
              />
            ))
            )}
          </div>
        </div>

        {/* Popular Artists */}
        <div className="lg:col-span-4 space-y-2 md:space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
            <Award className="w-5 h-5 text-rose-400" /> Popular Artists
          </h3>

          {/* Mobile: horizontal artist strip */}
          {isLoading ? (
            <ArtistTileSkeleton count={4} scrollable />
          ) : popularArtists.length === 0 ? (
            <p className="md:hidden text-xs text-slate-500 text-center py-4">No artists available.</p>
          ) : (
            <div className={MOBILE_SCROLL_STRIP}>
              {popularArtists.map((art) => (
                <ArtistTile
                  key={art.name}
                  name={art.name}
                  tracks={art.tracks}
                  avatar={art.avatar}
                  onClick={() => onArtistClick(art.name)}
                />
              ))}
            </div>
          )}

          {/* Desktop: artist list */}
          {isLoading ? (
            <ArtistListSkeleton count={4} />
          ) : (
          <div className="hidden md:block space-y-4 bg-slate-950/40 backdrop-blur-md p-6 rounded-3xl shadow-inner">
            {popularArtists.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No artists available.</p>
            ) : (
              popularArtists.map((art) => (
                <button
                  key={art.name}
                  type="button"
                  onClick={() => onArtistClick(art.name)}
                  className="w-full flex items-center gap-4 p-2 rounded-3xl hover:bg-slate-900/40 transition text-left group"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-white/5 flex-shrink-0">
                    <img src={art.avatar} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate group-hover:text-rose-400 transition">{art.name}</h4>
                    <p className="text-[10px] text-slate-550 truncate mt-0.5">{art.genre} • {art.tracks} Tracks</p>
                  </div>
                </button>
              ))
            )}
          </div>
          )}
        </div>

      </section>

    </div>
  );
};
