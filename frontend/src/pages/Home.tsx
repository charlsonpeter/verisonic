import React, { useState, useEffect } from 'react';
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
} from '../components/shared/skeleton';

interface HomeProps {
  onNavigate: (tab: string) => void;
  onViewDetails: (track: Track) => void;
  onArtistClick: (artistName: string) => void;
}

const mobileScrollStrip =
  'flex md:hidden gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

const TrackTile: React.FC<{
  track: Track;
  onPlay: () => void;
  compact?: boolean;
}> = ({ track, onPlay, compact = false }) => (
  <button
    type="button"
    onClick={onPlay}
    className={`text-left group active:scale-[0.98] transition flex-shrink-0 ${compact ? 'w-[6.75rem]' : 'w-full'}`}
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
  const { currentUser, hasRadioStation } = useAuth();

  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const popularArtists = Array.from(new Set(allTracks.map(t => t.artist_name))).map(name => {
    const tracksByArtist = allTracks.filter(t => t.artist_name === name);
    return {
      name,
      genre: tracksByArtist[0]?.file_format || "Artist",
      tracks: tracksByArtist.length,
      avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=150"
    };
  });

  const trackPages: Track[][] = [];
  for (let i = 0; i < allTracks.length; i += 9) {
    trackPages.push(allTracks.slice(i, i + 9));
  }

  useEffect(() => {
    // Load tracks from backend API
    const loadTracks = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/music?approved_only=true');
        if (res.ok) {
          const data = await res.json();
          if (data.length > 0) {
            setAllTracks(data);
            return;
          }
        }
        throw new Error();
      } catch (e) {
        console.error("Failed to load tracks from backend API:", e);
        setAllTracks([]);
      } finally {
        setIsLoading(false);
      }
    };
    loadTracks();
  }, []);

  return (
    <div className="space-y-8 md:space-y-12 w-full">
      
      {/* Promoted Studio Admin Setup Banner */}
      {currentUser?.role === 'studio_admin' && !currentUser.artist_profile?.profile_complete && (
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
      {currentUser?.role === 'radio_admin' && !hasRadioStation && (
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

      {/* Recently Played */}
      {isLoading ? (
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
            <Clock className="w-5 h-5 text-rose-400" /> Recently Played
          </h3>
          <RecentlyPlayedSkeleton count={3} />
        </section>
      ) : allTracks.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
              <Clock className="w-5 h-5 text-rose-400" /> Recently Played
            </h3>

          <div className={mobileScrollStrip}>
            {allTracks.slice(0, 3).map((track) => (
              <TrackTile key={`continue-${track.id}`} track={track} onPlay={() => playTrack(track)} compact />
            ))}
          </div>

          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTracks.slice(0, 3).map((track) => (
              <div
                key={`continue-desktop-${track.id}`}
                onClick={() => playTrack(track)}
                className="flex bg-slate-900/20 hover:bg-slate-900/40 rounded-3xl p-4 items-center gap-4 transition duration-200 cursor-pointer group hover:scale-[1.02] hover:shadow-lg"
              >
                <div className="w-12 h-12 bg-slate-800 rounded-xl overflow-hidden relative flex-shrink-0">
                  <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <Play className="w-5 h-5 text-white fill-current" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-200 truncate">{track.title}</h4>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{track.artist_name}</p>
                </div>
              </div>
            ))}
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
            <TrendingMobileSkeleton tileCount={9} />
          ) : (
          <div className={mobileScrollStrip}>
            {trackPages.map((page, pageIdx) => (
              <div
                key={pageIdx}
                className="grid grid-cols-3 gap-x-2.5 gap-y-2 flex-shrink-0 snap-start"
              >
                {page.map((track) => (
                  <TrackTile key={track.id} track={track} onPlay={() => playTrack(track)} compact />
                ))}
              </div>
            ))}
          </div>
          )}

          {/* Desktop: list view */}
          <div className="hidden md:block space-y-2 bg-slate-950/40 backdrop-blur-md p-5 rounded-3xl shadow-inner glow-rose/5">
            {isLoading ? (
              <TrackRowSkeleton count={8} borderless />
            ) : (
            allTracks.map((track, index) => (
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
            <div className={mobileScrollStrip}>
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
