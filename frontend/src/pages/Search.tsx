import React, { useState, useEffect, useCallback } from 'react';
import {
  Search as SearchIcon, X, Clock, HelpCircle, Flame, ChevronRight, User, ChevronLeft, Disc, Play, FolderHeart,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio, Track, RadioStation } from '../context/AudioContext';
import { TrackSearchRow } from '../components/shared/TrackRow';
import { RadioSearchRow } from '../components/shared/RadioCard';
import { TrackRowSkeleton, RadioStationsSkeleton } from '../components/shared/skeleton';
import {
  AlbumCandidate,
  ArtistCandidate,
  buildAlbumCandidatesFromTracks,
  buildArtistCandidatesFromTracks,
  fetchSearchTracks,
  filterTracksByAlbum,
  filterTracksByArtist,
  playlistSearchFields,
  radioSearchFields,
  rankAlbumCandidates,
  rankArtistCandidates,
  rankSearchResults,
  trackSearchFields,
} from '../utils/searchMatch';

interface SearchProps {
  onViewDetails: (track: Track) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedArtist: string | null;
  setSelectedArtist: (name: string | null) => void;
  selectedAlbum: string | null;
  setSelectedAlbum: (name: string | null) => void;
  selectedPlaylistId: number | null;
  setSelectedPlaylistId: (id: number | null) => void;
  onOpenArtistPage?: (artistName: string) => void;
}

interface SearchPlaylist {
  id: number;
  name: string;
  tracks: Track[];
}

type SearchFilter = 'all' | 'tracks' | 'albums' | 'radio' | 'artists' | 'playlists';

function playAllTracks(tracks: Track[], playQueueTracks: (t: Track[]) => void) {
  if (tracks.length === 0) return;
  playQueueTracks(tracks);
}

const PlayAllButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition"
  >
    <Play className="w-4 h-4 fill-current" />
    Play All
  </button>
);

export const Search: React.FC<SearchProps> = ({
  onViewDetails, searchQuery, setSearchQuery, selectedArtist, setSelectedArtist,
  selectedAlbum, setSelectedAlbum, selectedPlaylistId, setSelectedPlaylistId, onOpenArtistPage,
}) => {
  const { token, canUsePlaylists } = useAuth();
  const { playQueueTracks } = useAudio();

  const [activeFilter, setActiveFilter] = useState<SearchFilter>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(['Beethoven', 'Sarah Jenkins', 'Lossless Jazz']);
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
  const [filteredAlbums, setFilteredAlbums] = useState<AlbumCandidate[]>([]);
  const [filteredRadio, setFilteredRadio] = useState<RadioStation[]>([]);
  const [filteredArtists, setFilteredArtists] = useState<ArtistCandidate[]>([]);
  const [filteredPlaylists, setFilteredPlaylists] = useState<SearchPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<SearchPlaylist | null>(null);
  const [artistTracks, setArtistTracks] = useState<Track[]>([]);
  const [albumTracks, setAlbumTracks] = useState<Track[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingArtistTracks, setIsLoadingArtistTracks] = useState(false);
  const [isLoadingAlbumTracks, setIsLoadingAlbumTracks] = useState(false);

  const authHeaders = useCallback((): HeadersInit => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const clearDetailViews = () => {
    setSelectedArtist(null);
    setSelectedAlbum(null);
    setSelectedPlaylist(null);
    setSelectedPlaylistId(null);
  };

  const handlePlayAll = (tracks: Track[]) => {
    playAllTracks(tracks, playQueueTracks);
  };

  useEffect(() => {
    if (!selectedArtist) {
      setArtistTracks([]);
      setIsLoadingArtistTracks(false);
      return;
    }

    const loadArtistTracks = async () => {
      setIsLoadingArtistTracks(true);
      try {
        const data = (await fetchSearchTracks(selectedArtist)) as Track[];
        setArtistTracks(filterTracksByArtist(data, selectedArtist));
      } catch (e) {
        console.error('Failed to load artist tracks:', e);
        setArtistTracks([]);
      } finally {
        setIsLoadingArtistTracks(false);
      }
    };

    void loadArtistTracks();
  }, [selectedArtist]);

  useEffect(() => {
    if (!selectedAlbum) {
      setAlbumTracks([]);
      setIsLoadingAlbumTracks(false);
      return;
    }

    const loadAlbumTracks = async () => {
      setIsLoadingAlbumTracks(true);
      try {
        const data = (await fetchSearchTracks(selectedAlbum)) as Track[];
        setAlbumTracks(filterTracksByAlbum(data, selectedAlbum));
      } catch (e) {
        console.error('Failed to load album tracks:', e);
        setAlbumTracks([]);
      } finally {
        setIsLoadingAlbumTracks(false);
      }
    };

    void loadAlbumTracks();
  }, [selectedAlbum]);

  useEffect(() => {
    const query = searchQuery.trim();
    const inDetailView = selectedArtist || selectedAlbum || selectedPlaylist;

    if (!query || inDetailView) {
      if (!query) {
        setFilteredTracks([]);
        setFilteredAlbums([]);
        setFilteredRadio([]);
        setFilteredArtists([]);
        setFilteredPlaylists([]);
      }
      setIsSearching(false);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      try {
        const fetches: [
          Promise<Track[]>,
          Promise<Response>,
          Promise<SearchPlaylist[] | null>,
        ] = [
          fetchSearchTracks(query) as Promise<Track[]>,
          fetch('/api/radio'),
          canUsePlaylists && token
            ? fetch('/api/playlist', { headers: authHeaders() }).then(async (res) => {
                if (!res.ok) return [];
                return (await res.json()) as SearchPlaylist[];
              })
            : Promise.resolve(null),
        ];

        const [tracksData, radioRes, playlistsData] = await Promise.all(fetches);

        setFilteredTracks(rankSearchResults(tracksData, query, trackSearchFields).map(({ item }) => item));

        const albumCandidates = buildAlbumCandidatesFromTracks(tracksData);
        setFilteredAlbums(rankAlbumCandidates(albumCandidates, query).map(({ item }) => item));

        if (radioRes.ok) {
          const radioData = (await radioRes.json()) as RadioStation[];
          setFilteredRadio(rankSearchResults(radioData, query, radioSearchFields).map(({ item }) => item));
        } else {
          setFilteredRadio([]);
        }

        const artistCandidates = buildArtistCandidatesFromTracks(tracksData);
        setFilteredArtists(rankArtistCandidates(artistCandidates, query).map(({ item }) => item));

        if (playlistsData) {
          setFilteredPlaylists(
            rankSearchResults(playlistsData, query, playlistSearchFields).map(({ item }) => item)
          );
        } else {
          setFilteredPlaylists([]);
        }
      } catch (e) {
        console.error('Search failed:', e);
      } finally {
        setIsSearching(false);
      }
    };

    const debounceTimer = setTimeout(performSearch, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, selectedArtist, selectedAlbum, selectedPlaylist, canUsePlaylists, token, authHeaders]);

  const handleRecentClick = (term: string) => {
    clearDetailViews();
    setSearchQuery(term);
  };

  const handleArtistSelect = (artist: ArtistCandidate) => {
    if (onOpenArtistPage) {
      onOpenArtistPage(artist.name);
      return;
    }
    clearDetailViews();
    setSelectedArtist(artist.name);
    setSearchQuery(artist.name);
    setActiveFilter('tracks');
  };

  const handleAlbumSelect = (album: AlbumCandidate) => {
    clearDetailViews();
    setSelectedAlbum(album.title);
    setSearchQuery(album.title);
    setActiveFilter('albums');
  };

  const handlePlaylistSelect = (playlist: SearchPlaylist) => {
    clearDetailViews();
    setSelectedPlaylist(playlist);
    setSelectedPlaylistId(playlist.id);
    setSearchQuery(playlist.name);
    setActiveFilter('playlists');
  };

  useEffect(() => {
    if (!selectedPlaylistId || !token) return;
    if (selectedPlaylist?.id === selectedPlaylistId) return;
    const load = async () => {
      try {
        const res = await fetch(`/api/playlist/${selectedPlaylistId}`, { headers: authHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        setSelectedPlaylist({ id: data.id, name: data.name, tracks: data.tracks || [] });
        setSearchQuery(data.name || searchQuery);
        setActiveFilter('playlists');
      } catch (e) {
        console.error('Failed to open playlist from header search:', e);
      }
    };
    void load();
  }, [selectedPlaylistId, token, authHeaders, selectedPlaylist?.id]);

  const handlePlayArtistFromList = async (artist: ArtistCandidate, e: React.MouseEvent) => {
    e.stopPropagation();
    const data = (await fetchSearchTracks(artist.name)) as Track[];
    handlePlayAll(filterTracksByArtist(data, artist.name));
  };

  const handlePlayAlbumFromList = async (album: AlbumCandidate, e: React.MouseEvent) => {
    e.stopPropagation();
    const data = (await fetchSearchTracks(album.title)) as Track[];
    handlePlayAll(filterTracksByAlbum(data, album.title));
  };

  const handlePlayPlaylistFromList = (playlist: SearchPlaylist, e: React.MouseEvent) => {
    e.stopPropagation();
    handlePlayAll(playlist.tracks);
  };

  const handleSearchInputChange = (value: string) => {
    if (selectedArtist || selectedAlbum || selectedPlaylist) {
      clearDetailViews();
      setActiveFilter('all');
    }
    setSearchQuery(value);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    clearDetailViews();
  };

  const handleClearHistory = () => {
    setRecentSearches([]);
  };

  const handleAddToHistory = (term: string) => {
    if (!term.trim()) return;
    setRecentSearches((prev) => {
      const filtered = prev.filter((t) => t !== term);
      return [term, ...filtered].slice(0, 5);
    });
  };

  const trendingQueries = ['Clara Schumann', 'FLAC 96kHz', 'Live Jazz Orchestra', 'Beethoven Symphony', 'Ambient White Noise'];

  const filterTabs: SearchFilter[] = canUsePlaylists
    ? ['all', 'tracks', 'albums', 'radio', 'artists', 'playlists']
    : ['all', 'tracks', 'albums', 'radio', 'artists'];

  const hasResults =
    filteredTracks.length > 0 ||
    filteredAlbums.length > 0 ||
    filteredRadio.length > 0 ||
    filteredArtists.length > 0 ||
    filteredPlaylists.length > 0;

  const renderTrackList = (tracks: Track[], loading: boolean) => {
    if (loading) {
      return (
        <div className="space-y-2.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
          <TrackRowSkeleton count={5} />
        </div>
      );
    }
    if (tracks.length === 0) {
      return (
        <div className="text-center py-16 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-8 max-w-xl mx-auto">
          <HelpCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h4 className="text-sm font-bold text-slate-300">No tracks found</h4>
        </div>
      );
    }
    return (
      <div className="space-y-1.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
        {tracks.map((track) => (
          <TrackSearchRow key={track.id} track={track} />
        ))}
      </div>
    );
  };

  const renderDetailView = () => {
    if (selectedArtist) {
      return (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => {
              clearDetailViews();
              setActiveFilter('all');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to search results
          </button>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/20 border border-white/5 rounded-3xl">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                <User className="w-7 h-7 text-violet-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-extrabold text-white truncate">{selectedArtist}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isLoadingArtistTracks ? 'Loading...' : `${artistTracks.length} track${artistTracks.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <PlayAllButton onClick={() => handlePlayAll(artistTracks)} disabled={isLoadingArtistTracks || artistTracks.length === 0} />
          </div>
          {renderTrackList(artistTracks, isLoadingArtistTracks)}
        </div>
      );
    }

    if (selectedAlbum) {
      return (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => {
              clearDetailViews();
              setActiveFilter('all');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to search results
          </button>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/20 border border-white/5 rounded-3xl">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                <Disc className="w-7 h-7 text-slate-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-extrabold text-white truncate">{selectedAlbum}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isLoadingAlbumTracks ? 'Loading...' : `${albumTracks.length} track${albumTracks.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>
            <PlayAllButton onClick={() => handlePlayAll(albumTracks)} disabled={isLoadingAlbumTracks || albumTracks.length === 0} />
          </div>
          {renderTrackList(albumTracks, isLoadingAlbumTracks)}
        </div>
      );
    }

    if (selectedPlaylist) {
      return (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => {
              clearDetailViews();
              setActiveFilter('all');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to search results
          </button>
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/20 border border-white/5 rounded-3xl">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-16 h-16 rounded-xl bg-slate-800 flex items-center justify-center flex-shrink-0">
                <FolderHeart className="w-7 h-7 text-amber-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-extrabold text-white truncate">{selectedPlaylist.name}</h3>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedPlaylist.tracks.length} track{selectedPlaylist.tracks.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <PlayAllButton onClick={() => handlePlayAll(selectedPlaylist.tracks)} disabled={selectedPlaylist.tracks.length === 0} />
          </div>
          {renderTrackList(selectedPlaylist.tracks, false)}
        </div>
      );
    }

    return null;
  };

  const detailView = renderDetailView();

  return (
    <div className="flex flex-col gap-4 md:gap-10 w-full">
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <SearchIcon className="w-8 h-8 text-rose-400" /> Search
        </h2>
      </div>

      <div className="relative w-full max-w-2xl bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-4 hover:border-slate-800 transition shadow-inner">
        <SearchIcon className="w-6 h-6 text-slate-500" />
        <input
          type="text"
          placeholder="What do you want to listen to?"
          value={searchQuery}
          onChange={(e) => handleSearchInputChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddToHistory(searchQuery)}
          className="bg-transparent text-base text-slate-200 outline-none w-full placeholder-slate-500"
        />
        {searchQuery && (
          <button onClick={handleClearSearch} className="p-1 rounded-full bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!detailView && (
        <div className="flex flex-wrap gap-2">
          {filterTabs.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition border uppercase tracking-wider ${
                activeFilter === f
                  ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/15'
                  : 'bg-slate-900/40 text-slate-455 border-white/5 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {!searchQuery ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {recentSearches.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Recent Searches
                </h3>
                <button onClick={handleClearHistory} className="text-[10px] text-rose-400 font-semibold hover:text-rose-300 transition">
                  Clear History
                </button>
              </div>
              <div className="space-y-1.5 bg-slate-900/10 border border-white/3 p-4 rounded-3xl">
                {recentSearches.map((term, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleRecentClick(term)}
                    className="flex justify-between items-center text-xs p-3 rounded-xl hover:bg-slate-900/40 cursor-pointer text-slate-350 hover:text-white transition"
                  >
                    <span>{term}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
              <Flame className="w-4 h-4" /> Hot Queries
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {trendingQueries.map((term, idx) => (
                <button
                  key={idx}
                  onClick={() => handleRecentClick(term)}
                  className="px-4 py-2.5 bg-slate-900/30 hover:bg-slate-900/60 border border-white/5 hover:border-slate-800 rounded-xl text-xs font-semibold text-slate-350 hover:text-white transition"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : detailView ? (
        detailView
      ) : (
        <div className="space-y-8">
          {isSearching ? (
            <div className="space-y-6">
              {(activeFilter === 'all' || activeFilter === 'tracks') && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">Matched Tracks</h3>
                  <div className="space-y-2.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    <TrackRowSkeleton count={5} />
                  </div>
                </div>
              )}
              {(activeFilter === 'all' || activeFilter === 'albums') && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">Matched Albums</h3>
                  <div className="space-y-2 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="h-12 rounded-xl bg-slate-900/40 animate-pulse" />
                    ))}
                  </div>
                </div>
              )}
              {(activeFilter === 'all' || activeFilter === 'radio') && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">Matched Live Stations</h3>
                  <RadioStationsSkeleton tileCount={3} cardCount={2} />
                </div>
              )}
              {(activeFilter === 'all' || activeFilter === 'artists') && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">Matched Artists</h3>
                  <div className="space-y-2 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="h-12 rounded-xl bg-slate-900/40 animate-pulse" />
                    ))}
                  </div>
                </div>
              )}
              {canUsePlaylists && (activeFilter === 'all' || activeFilter === 'playlists') && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">Matched Playlists</h3>
                  <div className="space-y-2 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {Array.from({ length: 2 }).map((_, idx) => (
                      <div key={idx} className="h-12 rounded-xl bg-slate-900/40 animate-pulse" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {(activeFilter === 'all' || activeFilter === 'tracks') && filteredTracks.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">
                    Matched Tracks ({filteredTracks.length})
                  </h3>
                  <div className="space-y-1.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {filteredTracks.map((track) => (
                      <TrackSearchRow key={track.id} track={track} />
                    ))}
                  </div>
                </div>
              )}

              {(activeFilter === 'all' || activeFilter === 'albums') && filteredAlbums.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">
                    Matched Albums ({filteredAlbums.length})
                  </h3>
                  <div className="space-y-1.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {filteredAlbums.map((album) => (
                      <div key={album.title} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAlbumSelect(album)}
                          className="flex-1 flex items-center gap-4 p-3 rounded-xl hover:bg-slate-900/40 transition text-left min-w-0"
                        >
                          {album.cover_art_url ? (
                            <img src={album.cover_art_url} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                              <Disc className="w-5 h-5 text-slate-500" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-slate-200 truncate">{album.title}</h4>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {album.artist_name ? `${album.artist_name} · ` : ''}
                              {album.trackCount === 1 ? '1 track' : `${album.trackCount} tracks`}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void handlePlayAlbumFromList(album, e)}
                          title="Play all"
                          aria-label={`Play all tracks from ${album.title}`}
                          className="p-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 transition flex-shrink-0"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(activeFilter === 'all' || activeFilter === 'radio') && filteredRadio.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">
                    Matched Live Stations ({filteredRadio.length})
                  </h3>
                  <div className="space-y-1.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {filteredRadio.map((station) => (
                      <RadioSearchRow key={station.id} station={station} />
                    ))}
                  </div>
                </div>
              )}

              {(activeFilter === 'all' || activeFilter === 'artists') && filteredArtists.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">
                    Matched Artists ({filteredArtists.length})
                  </h3>
                  <div className="space-y-1.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {filteredArtists.map((artist) => (
                      <div key={artist.name} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleArtistSelect(artist)}
                          className="flex-1 flex items-center gap-4 p-3 rounded-xl hover:bg-slate-900/40 transition text-left min-w-0"
                        >
                          <div className="w-11 h-11 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <User className="w-5 h-5 text-violet-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-slate-200 truncate">{artist.name}</h4>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {artist.trackCount === 1 ? '1 track' : `${artist.trackCount} tracks`}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => void handlePlayArtistFromList(artist, e)}
                          title="Play all"
                          aria-label={`Play all tracks by ${artist.name}`}
                          className="p-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 text-rose-400 transition flex-shrink-0"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {canUsePlaylists && (activeFilter === 'all' || activeFilter === 'playlists') && filteredPlaylists.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1">
                    Matched Playlists ({filteredPlaylists.length})
                  </h3>
                  <div className="space-y-1.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                    {filteredPlaylists.map((playlist) => (
                      <div key={playlist.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePlaylistSelect(playlist)}
                          className="flex-1 flex items-center gap-4 p-3 rounded-xl hover:bg-slate-900/40 transition text-left min-w-0"
                        >
                          <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <FolderHeart className="w-5 h-5 text-amber-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="text-xs font-bold text-slate-200 truncate">{playlist.name}</h4>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {playlist.tracks.length === 1 ? '1 track' : `${playlist.tracks.length} tracks`}
                            </p>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handlePlayPlaylistFromList(playlist, e)}
                          title="Play all"
                          aria-label={`Play all tracks in ${playlist.name}`}
                          disabled={playlist.tracks.length === 0}
                          className="p-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/40 disabled:opacity-40 text-rose-400 transition flex-shrink-0"
                        >
                          <Play className="w-4 h-4 fill-current" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!hasResults && (
                <div className="text-center py-20 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-8 max-w-xl mx-auto">
                  <HelpCircle className="w-12 h-12 text-slate-600 mx-auto mb-4 animate-bounce" />
                  <h4 className="text-sm font-bold text-slate-300">No matching results found</h4>
                  <p className="text-xs text-slate-500 mt-1">Check the spelling or search by track, album, artist, playlist, or station name.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
