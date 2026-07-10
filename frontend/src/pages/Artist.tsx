import React from 'react';
import { Users, Info, Disc, Radio, Heart, Sparkles, CheckCircle2, ChevronRight } from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';

interface ArtistProps {
  onViewReport?: (track: Track) => void;
  onViewDetails: (track: Track) => void;
}

export const Artist: React.FC<ArtistProps> = ({ onViewReport, onViewDetails }) => {
  const { playTrack, toggleFavorite, favorites } = useAudio();

  // Mock artist profile details
  const artist = {
    name: "Clara Schumann Ensembles",
    cover: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&q=80&w=1000",
    avatar: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=150",
    followers: 124500,
    bio: "The Clara Schumann Ensembles are dedicated to recreating romantic classical piano and orchestral pieces in historical chamber dynamics. Every recording uses original 19th-century acoustic designs and is preserved at 24-bit PCM thresholds to capture the authentic physical soundstage.",
    releases: [
      { id: 301, title: "Romantic Masterclass", year: 2024, type: "Album", cover: "https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&q=80&w=200" },
      { id: 302, title: "Chamber Resonances", year: 2023, type: "Album", cover: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=200" },
      { id: 303, title: "Prelude in G minor", year: 2024, type: "Single", cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&q=80&w=200" }
    ],
    related: [
      { name: "Ludwig van Beethoven", genre: "Classical", avatar: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=150" },
      { name: "Sarah Jenkins", genre: "Acoustic Orchestra", avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=150" }
    ]
  };

  const [popularTracks, setPopularTracks] = React.useState<Track[]>([]);

  React.useEffect(() => {
    const fetchArtistTracks = async () => {
      try {
        const res = await fetch(`/api/music?search=${encodeURIComponent(artist.name)}&approved_only=true`);
        if (res.ok) {
          const data = await res.json();
          setPopularTracks(data.slice(0, 5));
        }
      } catch (e) {
        console.error("Failed to load artist tracks:", e);
      }
    };
    fetchArtistTracks();
  }, []);

  const isFollowed = false;

  return (
    <div className="space-y-10 w-full overflow-x-hidden">
      
      {/* 1. ARTIST BANNER */}
      <section 
        className="relative h-96 rounded-3xl overflow-hidden bg-cover bg-center flex flex-col justify-end p-8 md:p-12 border border-white/5 shadow-2xl"
        style={{ backgroundImage: `linear-gradient(to top, rgba(2,6,23,0.98) 0%, rgba(2,6,23,0.3) 60%, rgba(2,6,23,0.1) 100%), url(${artist.cover})` }}
      >
        <div className="flex flex-col md:flex-row items-center md:items-end gap-6 relative z-10">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white/10 shadow-lg flex-shrink-0">
            <img src={artist.avatar} alt="Avatar" className="w-full h-full object-cover" />
          </div>
          <div className="text-center md:text-left space-y-2">
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-500 text-white text-[9px] font-extrabold uppercase rounded-full">
              <CheckCircle2 className="w-3 h-3 fill-current text-white" /> Verified Artist
            </div>
            <h1 className="text-3xl md:text-5xl font-extrabold text-gradient-premium tracking-tight">
              {artist.name}
            </h1>
            <div className="flex items-center justify-center md:justify-start gap-4 text-xs text-slate-400 font-bold">
              <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {artist.followers.toLocaleString()} Followers</span>
              <span>•</span>
              <span className="text-rose-400">PCM 24-bit streams</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. POPULAR TRACKS */}
      <section className="space-y-4">
        <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
          <Sparkles className="w-5 h-5 text-rose-400" /> Popular Releases
        </h3>
        <div className="space-y-2.5 bg-slate-900/10 border border-white/3 p-4 rounded-3xl">
          {popularTracks.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">No popular tracks found.</p>
          ) : (
            popularTracks.map((track, idx) => (
              <TrackRow 
                key={track.id} 
                track={track} 
                index={idx}
                onViewReport={onViewReport}
                onViewDetails={onViewDetails}
              />
            ))
          )}
        </div>
      </section>

      {/* 3. DISCOGRAPHY ALBUMS */}
      <section className="space-y-4">
        <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
          <Disc className="w-5 h-5 text-rose-400" /> Studio Catalog
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {artist.releases.map((rel) => (
            <div 
              key={rel.id}
              className="glass-card glass-card-hover p-4 rounded-3xl cursor-pointer group hover:scale-[1.02]"
            >
              <div className="w-full aspect-square rounded-2xl overflow-hidden relative shadow-md bg-slate-800 border border-white/5 mb-3">
                <img src={rel.cover} alt="Cover" className="w-full h-full object-cover group-hover:scale-103 transition" />
              </div>
              <h4 className="font-bold text-white text-xs truncate group-hover:text-rose-400 transition">{rel.title}</h4>
              <p className="text-[10px] text-slate-500 font-semibold uppercase mt-1">{rel.year} • {rel.type}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 4. BIOGRAPHY & RELATED */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Biography */}
        <div className="md:col-span-8 bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Info className="w-4 h-4" /> Artist Biography
          </h3>
          <p className="text-xs text-slate-355 leading-relaxed font-medium">
            {artist.bio}
          </p>
        </div>

        {/* Related Artists */}
        <div className="md:col-span-4 bg-slate-900/10 border border-white/3 p-5 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Related soundstages
          </h3>
          <div className="space-y-4">
            {artist.related.map((relArt, idx) => (
              <div key={idx} className="flex items-center gap-3 group cursor-pointer p-1 rounded-2xl hover:bg-white/[0.02] transition duration-300">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/5 flex-shrink-0">
                  <img src={relArt.avatar} alt="Avatar" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-200 truncate group-hover:text-rose-400 transition">{relArt.name}</h4>
                  <p className="text-[9px] text-slate-500 truncate mt-0.5">{relArt.genre}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition" />
              </div>
            ))}
          </div>
        </div>

      </section>

    </div>
  );
};
