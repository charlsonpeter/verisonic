import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, X, Clock, HelpCircle, Flame, Star, ChevronRight } from 'lucide-react';
import { useAudio, Track, RadioStation } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';
import { RadioCard } from '../components/shared/RadioCard';

interface SearchProps {
  onViewDetails: (track: Track) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export const Search: React.FC<SearchProps> = ({ 
  onViewDetails, searchQuery, setSearchQuery 
}) => {
  const { playTrack } = useAudio();

  // Search local states
  const [activeFilter, setActiveFilter] = useState<'all' | 'tracks' | 'radio' | 'artists'>('all');
  const [recentSearches, setRecentSearches] = useState<string[]>(['Beethoven', 'Sarah Jenkins', 'Lossless Jazz']);
  const [filteredTracks, setFilteredTracks] = useState<Track[]>([]);
  const [filteredRadio, setFilteredRadio] = useState<RadioStation[]>([]);

  // Dynamic search matching
  useEffect(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) {
      setFilteredTracks([]);
      setFilteredRadio([]);
      return;
    }

    const performSearch = async () => {
      try {
        // Fetch tracks from backend API
        const tracksRes = await fetch(`/api/music?search=${encodeURIComponent(query)}&approved_only=true`);
        if (tracksRes.ok) {
          const tracksData = await tracksRes.json();
          setFilteredTracks(tracksData);
        }

        // Fetch radio stations from backend API and filter locally
        const radioRes = await fetch(`/api/radio`);
        if (radioRes.ok) {
          const radioData = await radioRes.json();
          const filtered = radioData.filter(
            (r: RadioStation) => 
              r.name.toLowerCase().includes(query) || 
              (r.description || '').toLowerCase().includes(query)
          );
          setFilteredRadio(filtered);
        }
      } catch (e) {
        console.error("Search failed:", e);
      }
    };

    const debounceTimer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const handleRecentClick = (term: string) => {
    setSearchQuery(term);
  };

  const handleClearHistory = () => {
    setRecentSearches([]);
  };

  const handleAddToHistory = (term: string) => {
    if (!term.trim()) return;
    setRecentSearches(prev => {
      const filtered = prev.filter(t => t !== term);
      return [term, ...filtered].slice(0, 5); // Lock max 5 history logs
    });
  };

  const trendingQueries = ['Clara Schumann', 'FLAC 96kHz', 'Live Jazz Orchestra', 'Beethoven Symphony', 'Ambient White Noise'];

  return (
    <div className="space-y-10 w-full">
      {/* Title */}
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <SearchIcon className="w-8 h-8 text-rose-400" /> Search
        </h2>
      </div>

      {/* Input container */}
      <div className="relative w-full max-w-2xl bg-slate-900/40 border border-white/5 rounded-3xl p-4 flex items-center gap-4 hover:border-slate-800 transition shadow-inner">
        <SearchIcon className="w-6 h-6 text-slate-500" />
        <input 
          type="text"
          placeholder="What do you want to listen to?"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddToHistory(searchQuery)}
          className="bg-transparent text-base text-slate-200 outline-none w-full placeholder-slate-500"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="p-1 rounded-full bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Sub category filter tabs */}
      <div className="flex gap-2">
        {(['all', 'tracks', 'radio', 'artists'] as const).map(f => (
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

      {/* SEARCH RESULTS OR DEFAULT VIEW */}
      {!searchQuery ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Recent Searches */}
          {recentSearches.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-4 h-4" /> Recent Searches
                </h3>
                <button 
                  onClick={handleClearHistory}
                  className="text-[10px] text-rose-400 font-semibold hover:text-rose-300 transition"
                >
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

          {/* Trending Searches */}
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
      ) : (
        <div className="space-y-8">
          {/* Tracks results list */}
          {(activeFilter === 'all' || activeFilter === 'tracks') && filteredTracks.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1 flex items-center gap-1">
                Matched Tracks ({filteredTracks.length})
              </h3>
              <div className="space-y-2.5 bg-slate-900/15 border border-white/3 p-4 rounded-3xl">
                {filteredTracks.map((track, idx) => (
                  <TrackRow 
                    key={track.id} 
                    track={track} 
                    index={idx}
                    onViewDetails={onViewDetails}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Radio results list */}
          {(activeFilter === 'all' || activeFilter === 'radio') && filteredRadio.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1 flex items-center gap-1">
                Matched Live Stations ({filteredRadio.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredRadio.map(station => (
                  <RadioCard key={station.id} station={station} />
                ))}
              </div>
            </div>
          )}

          {/* Empty search fallback */}
          {filteredTracks.length === 0 && filteredRadio.length === 0 && (
            <div className="text-center py-20 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-8 max-w-xl mx-auto">
              <HelpCircle className="w-12 h-12 text-slate-600 mx-auto mb-4 animate-bounce" />
              <h4 className="text-sm font-bold text-slate-300">No matching results found</h4>
              <p className="text-xs text-slate-500 mt-1">Check the spelling or search by specific frequencies e.g. "96kHz".</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
};
