import React from 'react';
import { Compass, Sparkles, Disc, Flame, Music, Radio, Star, Play } from 'lucide-react';

interface DiscoverProps {
  onNavigate: (tab: string) => void;
}

export const Discover: React.FC<DiscoverProps> = ({ onNavigate }) => {
  
  const genres = [
    { title: "Hi-Res Studio Masters", desc: "FLAC verified 24-bit streams", grad: "from-emerald-900/60 to-slate-950", border: "border-emerald-500/20", tag: "96kHz" },
    { title: "Lossless Jazz Lounge", desc: "Acoustic room dynamics", grad: "from-cyan-900/60 to-slate-950", border: "border-cyan-500/20", tag: "FLAC" },
    { title: "Authentic Symphonies", desc: "Orchestra frequency ranges", grad: "from-rose-900/60 to-slate-950", border: "border-rose-500/20", tag: "PCM" },
    { title: "Chillout & Ambient Echoes", desc: "Subharmonic focus synthesis", grad: "from-purple-900/60 to-slate-950", border: "border-purple-500/20", tag: "Stereo" },
    { title: "Electronic Frequency", desc: "High dynamic range transient synth", grad: "from-pink-900/60 to-slate-950", border: "border-pink-500/20", tag: "320kbps" },
    { title: "Acoustic & Vocals", desc: "Original master voice signals", grad: "from-amber-900/60 to-slate-950", border: "border-amber-500/20", tag: "Lossless" }
  ];

  const [curatedPlaylists, setCuratedPlaylists] = React.useState<any[]>([]);

  React.useEffect(() => {
    const fetchPlaylists = async () => {
      try {
        const res = await fetch('/api/playlist');
        if (res.ok) {
          const data = await res.json();
          setCuratedPlaylists(data.map((p: any) => ({
            title: p.name,
            tracks: p.tracks.length,
            cover: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=250"
          })));
        }
      } catch (e) {
        console.error("Failed to fetch playlists for discover page:", e);
      }
    };
    fetchPlaylists();
  }, []);

  return (
    <div className="space-y-12 w-full">
      {/* Header title */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Compass className="w-8 h-8 text-rose-400" /> Discover Hub
        </h2>
        <p className="text-sm text-slate-400 mt-1">Explore audiophile collections cataloged by spectral quality validation standards.</p>
      </div>

      {/* 1. GENRES GRID */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
          <Sparkles className="w-5 h-5 text-rose-400" /> Explore Quality Tiers
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {genres.map((genre, idx) => (
            <div 
              key={idx}
              onClick={() => onNavigate('home')}
              className={`bg-gradient-to-br ${genre.grad} border ${genre.border} rounded-3xl p-6 flex flex-col justify-between h-44 hover:scale-[1.02] hover:border-white/10 hover:shadow-2xl hover:shadow-rose-500/[0.05] transition-all duration-350 cubic-bezier(0.16, 1, 0.3, 1) relative group cursor-pointer shadow-lg`}
            >
              <div>
                <span className="text-[8px] font-extrabold text-rose-400 bg-rose-500/10 border border-rose-500/15 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {genre.tag}
                </span>
                <h4 className="text-base font-extrabold text-white mt-3.5 group-hover:text-rose-400 transition">
                  {genre.title}
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{genre.desc}</p>
              </div>
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/3 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                <span>View Archives</span>
                <Play className="w-4 h-4 text-slate-500 group-hover:text-rose-400 group-hover:translate-x-1 transition fill-current" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. CURATED PLAYLISTS */}
      <section className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
          <Disc className="w-5 h-5 text-rose-400" /> Premium Curated Collections
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {curatedPlaylists.map((playlist, idx) => (
            <div 
              key={idx}
              onClick={() => onNavigate('playlists')}
              className="glass-card glass-card-hover p-4 rounded-3xl cursor-pointer group hover:scale-[1.02]"
            >
              <div className="w-full aspect-square rounded-2xl overflow-hidden relative shadow-md bg-slate-800 border border-white/5 mb-3">
                <img src={playlist.cover} alt="Cover" className="w-full h-full object-cover group-hover:scale-103 transition duration-500" />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <span className="p-3 bg-white text-slate-950 rounded-full shadow-lg">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </span>
                </div>
              </div>
              <h4 className="font-bold text-white text-xs truncate group-hover:text-rose-400 transition">{playlist.title}</h4>
              <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">{playlist.tracks} Master Tracks</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
