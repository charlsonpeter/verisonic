import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  ChevronRight,
  Music,
  Radio as RadioIcon,
  Loader2,
  User,
  FolderHeart,
  Disc,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio, Track, RadioStation } from '../../context/AudioContext';
import {
  buildAlbumCandidatesFromTracks,
  buildArtistCandidatesFromTracks,
  fetchSearchTracks,
  playlistSearchFields,
  radioSearchFields,
  rankAlbumCandidates,
  rankArtistCandidates,
  rankSearchResults,
  trackSearchFields,
} from '../../utils/searchMatch';

interface HeaderSearchProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  setSelectedArtist: (artist: string | null) => void;
  setActiveTab: (tab: string) => void;
}

interface PlaylistPreview {
  id: number;
  name: string;
  trackCount: number;
}

type SearchResultItem =
  | { kind: 'track'; key: string; title: string; subtitle: string; imageUrl?: string; track: Track }
  | { kind: 'album'; key: string; title: string; subtitle: string; cover_art_url?: string }
  | { kind: 'radio'; key: string; title: string; subtitle: string; station: RadioStation }
  | { kind: 'artist'; key: string; title: string; subtitle: string; name: string }
  | { kind: 'playlist'; key: string; title: string; subtitle: string; playlistId: number };

const PREVIEW_LIMIT = 12;
const PREVIEW_PER_KIND = 5;

const RESULT_KIND_ORDER: Record<SearchResultItem['kind'], number> = {
  track: 0,
  album: 1,
  radio: 2,
  artist: 3,
  playlist: 4,
};

export const HeaderSearch: React.FC<HeaderSearchProps> = ({
  searchQuery,
  setSearchQuery,
  setSelectedArtist,
  setActiveTab,
}) => {
  const { token, canUsePlaylists } = useAuth();
  const { playTrack, playRadioStation } = useAudio();
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = searchQuery.trim();

  const authHeaders = useCallback((): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  useEffect(() => {
    if (!trimmedQuery) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const scored: { score: number; item: SearchResultItem }[] = [];

        const [tracksData, radioRes, playlistsRes] = await Promise.all([
          fetchSearchTracks(trimmedQuery) as Promise<Track[]>,
          fetch('/api/radio'),
          canUsePlaylists
            ? fetch('/api/playlist', { headers: authHeaders() })
            : Promise.resolve(null),
        ]);

        for (const { item: track, score } of rankSearchResults(tracksData, trimmedQuery, trackSearchFields, { limit: PREVIEW_PER_KIND })) {
          scored.push({
            score,
            item: {
              kind: 'track',
              key: `track-${track.id}`,
              title: track.title,
              subtitle: track.artist_name || track.artist_name_override || '',
              imageUrl: track.cover_art_url,
              track,
            },
          });
        }

        const albumCandidates = buildAlbumCandidatesFromTracks(tracksData);
        for (const { item: album, score } of rankAlbumCandidates(albumCandidates, trimmedQuery, { limit: PREVIEW_PER_KIND })) {
          scored.push({
            score,
            item: {
              kind: 'album',
              key: `album-${album.title}`,
              title: album.title,
              subtitle: album.artist_name
                ? `${album.artist_name} · ${album.trackCount === 1 ? '1 track' : `${album.trackCount} tracks`}`
                : album.trackCount === 1 ? '1 track' : `${album.trackCount} tracks`,
              cover_art_url: album.cover_art_url,
            },
          });
        }

        if (radioRes.ok) {
          const radioData: RadioStation[] = await radioRes.json();
          for (const { item: station, score } of rankSearchResults(radioData, trimmedQuery, radioSearchFields, { limit: PREVIEW_PER_KIND })) {
            scored.push({
              score,
              item: {
                kind: 'radio',
                key: `radio-${station.id}`,
                title: station.name,
                subtitle: station.broadcast_frequency || 'Radio station',
                station,
              },
            });
          }
        }

        const artistCandidates = buildArtistCandidatesFromTracks(tracksData);
        for (const { item: artist, score } of rankArtistCandidates(artistCandidates, trimmedQuery, { limit: PREVIEW_PER_KIND })) {
          scored.push({
            score,
            item: {
              kind: 'artist',
              key: `artist-${artist.name}`,
              title: artist.name,
              subtitle: artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`,
              name: artist.name,
            },
          });
        }

        if (playlistsRes?.ok) {
          const playlists: PlaylistPreview[] = (await playlistsRes.json()).map(
            (p: { id: number; name: string; tracks?: unknown[] }) => ({
              id: p.id,
              name: p.name,
              trackCount: p.tracks?.length ?? 0,
            })
          );
          for (const { item: playlist, score } of rankSearchResults(playlists, trimmedQuery, playlistSearchFields, { limit: PREVIEW_PER_KIND })) {
            scored.push({
              score,
              item: {
                kind: 'playlist',
                key: `playlist-${playlist.id}`,
                title: playlist.name,
                subtitle: playlist.trackCount === 1 ? '1 track' : `${playlist.trackCount} tracks`,
                playlistId: playlist.id,
              },
            });
          }
        }

        scored.sort(
          (a, b) =>
            b.score - a.score || RESULT_KIND_ORDER[a.item.kind] - RESULT_KIND_ORDER[b.item.kind]
        );
        setResults(scored.slice(0, PREVIEW_LIMIT).map((entry) => entry.item));
      } catch (e) {
        console.error('Header search failed:', e);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [trimmedQuery, canUsePlaylists, authHeaders]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const goToSearchPage = () => {
    setSelectedArtist(null);
    setActiveTab('search');
    setIsOpen(false);
  };

  const handleResultClick = (item: SearchResultItem) => {
    switch (item.kind) {
      case 'track':
        playTrack(item.track);
        break;
      case 'radio':
        playRadioStation(item.station);
        break;
      case 'artist':
        setSearchQuery(item.name);
        setSelectedArtist(item.name);
        setActiveTab('search');
        break;
      case 'album':
        setSearchQuery(item.title);
        setSelectedArtist(null);
        setActiveTab('search');
        break;
      case 'playlist':
        setActiveTab('playlists');
        break;
    }
    setIsOpen(false);
  };

  const renderIcon = (item: SearchResultItem) => {
    if (item.kind === 'track') {
      if (item.imageUrl) {
        return (
          <img
            src={item.imageUrl}
            alt=""
            className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
          />
        );
      }
      return (
        <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Music className="w-4 h-4 text-slate-500" />
        </div>
      );
    }
    if (item.kind === 'radio') {
      return (
        <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <RadioIcon className="w-4 h-4 text-rose-400" />
        </div>
      );
    }
    if (item.kind === 'album') {
      if (item.cover_art_url) {
        return (
          <img
            src={item.cover_art_url}
            alt=""
            className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
          />
        );
      }
      return (
        <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <Disc className="w-4 h-4 text-slate-500" />
        </div>
      );
    }
    if (item.kind === 'artist') {
      return (
        <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-violet-400" />
        </div>
      );
    }
    return (
      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
        <FolderHeart className="w-4 h-4 text-amber-400" />
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative hidden md:block flex-shrink-0">
      <div className="flex items-center gap-2 bg-slate-900/40 border border-white/5 rounded-xl px-2.5 lg:px-3 py-1.5 hover:border-slate-800 transition duration-300 w-28 lg:w-48">
        <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <input
          type="text"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (trimmedQuery) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') goToSearchPage();
            if (e.key === 'Escape') setIsOpen(false);
          }}
          className="bg-transparent text-xs text-slate-200 outline-none w-full min-w-0 placeholder-slate-505"
        />
      </div>

      {isOpen && trimmedQuery && (
        <div className="absolute top-full right-0 mt-2 w-80 lg:w-96 bg-slate-950/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden z-50">
          <div className="max-h-80 overflow-y-auto py-1">
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </div>
            ) : (
              <>
                {results.length === 0 && (
                  <p className="px-4 py-6 text-xs text-slate-500 text-center">
                    No quick results for &ldquo;{trimmedQuery}&rdquo;
                  </p>
                )}

                {results.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleResultClick(item)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition text-left"
                  >
                    {renderIcon(item)}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-200 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">{item.subtitle}</p>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={goToSearchPage}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 border-t border-white/10 bg-slate-900/60 hover:bg-slate-900/80 transition text-xs font-semibold text-rose-400"
          >
            <span className="truncate">Search all for &ldquo;{trimmedQuery}&rdquo;</span>
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
          </button>
        </div>
      )}
    </div>
  );
};
