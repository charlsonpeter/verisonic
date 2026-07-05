import React, { useState, useEffect } from 'react';
import { 
  Play, Heart, Disc, Music, Flame, Award, ChevronRight, Sparkles, Plus, Clock 
} from 'lucide-react';
import { useAudio, Track } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { TrackRow } from '../components/shared/TrackRow';

interface HomeProps {
  onNavigate: (tab: string) => void;
  onViewReport: (track: Track) => void;
  onViewDetails: (track: Track) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate, onViewReport, onViewDetails }) => {
  const { playTrack, addToQueue, favorites, toggleFavorite } = useAudio();
  const { currentUser } = useAuth();
  
  // States for Hero Slider
  const [activeSlide, setActiveSlide] = useState(0);

  // Mock full song library for Home feed
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [hasRadioStation, setHasRadioStation] = useState<boolean>(true);

  const popularArtists = Array.from(new Set(allTracks.map(t => t.artist_name))).map(name => {
    const tracksByArtist = allTracks.filter(t => t.artist_name === name);
    return {
      name,
      genre: tracksByArtist[0]?.file_format || "Artist",
      tracks: tracksByArtist.length,
      avatar: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=150"
    };
  });

  useEffect(() => {
    // Load tracks from backend API
    const loadTracks = async () => {
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
      }
    };
    loadTracks();
  }, []);

  useEffect(() => {
    if (currentUser?.role === 'radio_admin') {
      const checkRadioStation = async () => {
        try {
          const res = await fetch('/api/radio');
          if (res.ok) {
            const data = await res.json();
            const ownsStation = data.some((s: any) => s.owner_id === currentUser.id);
            setHasRadioStation(ownsStation);
          }
        } catch (e) {
          console.warn("Failed to check radio station status:", e);
        }
      };
      checkRadioStation();
    }
  }, [currentUser]);

  const heroSlides = [
    { title: "24-bit Lossless CD Masters", desc: "Experience uncompressed acoustic waveforms validated by FFT spectral cutoff algorithms.", artist: "Sarah Jenkins & Orchestra", bg: "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&q=80&w=800" },
    { title: "Curated Live Radio Stations", desc: "Listen to globally synchronized broadcast feeds with latency timing under 1.5 seconds.", artist: "Live Broadcast Hub", bg: "https://images.unsplash.com/photo-1487180142328-054b783fc471?auto=format&fit=crop&q=80&w=800" },
    { title: "Verified Spectrogram Analytics", desc: "Audit frequencies and reject fake upscaled MP3 files directly through report dashboards.", artist: "Librosa Analyzer Node", bg: "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=800" }
  ];

  // Auto rotate carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide(prev => (prev === heroSlides.length - 1 ? 0 : prev + 1));
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="space-y-12 w-full">
      
      {/* Promoted Studio Admin Setup Banner */}
      {currentUser?.role === 'studio_admin' && (!currentUser.artist_profile?.bio || currentUser.artist_profile.bio === '') && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-cyan-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl animate-fade-in group">
          <div className="absolute top-0 left-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-cyan-500/10 transition-all duration-700" />
          <div className="space-y-2 relative z-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-[10px] text-cyan-400 font-extrabold uppercase tracking-widest font-sans">
              <Sparkles className="w-3.5 h-3.5 text-cyan-455" /> Action Required: Studio Setup
            </span>
            <h3 className="text-lg font-extrabold text-white tracking-tight leading-tight">Complete Your Studio Admin Registration</h3>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed font-sans font-medium">
              Welcome to the team! Before uploading your first track, please configure your Stage Name/Studio Brand and Bio in the Studio Space.
            </p>
          </div>
          <button 
            onClick={() => onNavigate('tracks')}
            className="relative z-10 flex-shrink-0 px-6 py-3 bg-gradient-to-r from-cyan-600 to-cyan-500 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-cyan-550/20 hover:scale-[1.02] hover:shadow-cyan-550/30 transition duration-300 uppercase tracking-wider cursor-pointer"
          >
            Register Studio Details
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

      {/* 1. HERO CAROUSEL */}
      <section className="relative h-80 rounded-3xl overflow-hidden border border-white/5 shadow-2xl group">
        {/* Carousel slides */}
        {heroSlides.map((slide, idx) => {
          const isActive = idx === activeSlide;
          return (
            <div 
              key={idx}
              className={`absolute inset-0 bg-cover bg-center transition-opacity duration-1000 flex flex-col justify-end p-8 md:p-12 ${
                isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              style={{ backgroundImage: `linear-gradient(to top, rgba(2,6,23,0.95) 0%, rgba(2,6,23,0.4) 60%, rgba(2,6,23,0.1) 100%), url(${slide.bg})` }}
            >
              <div className="max-w-xl space-y-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-500 text-white text-[9px] font-extrabold uppercase rounded-full">
                  <Sparkles className="w-3 h-3" /> Featured Spotlight
                </span>
                <h2 className="text-2xl md:text-4xl font-extrabold text-white leading-tight">
                  {slide.title}
                </h2>
                <p className="text-xs text-slate-355 line-clamp-2 leading-relaxed">
                  {slide.desc}
                </p>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => onNavigate('discover')}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition duration-300"
                  >
                    Browse Collections
                  </button>
                  <button 
                    onClick={() => onNavigate('radio')}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 font-bold text-xs rounded-xl transition"
                  >
                    Listen Radio
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Carousel dots indicators */}
        <div className="absolute bottom-6 right-8 flex gap-1.5 z-10">
          {heroSlides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveSlide(idx)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                idx === activeSlide ? 'bg-rose-500 w-5' : 'bg-slate-850'
              }`}
            />
          ))}
        </div>
      </section>

      {/* 2. CONTINUE LISTENING */}
      {allTracks.length > 0 && (
        <section className="space-y-4">
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
              <Clock className="w-5 h-5 text-rose-400" /> Continue Listening
            </h3>
            <span className="text-[10px] text-slate-500 font-bold uppercase">Last Played</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allTracks.slice(0, 3).map((track) => (
              <div 
                key={`continue-${track.id}`}
                onClick={() => playTrack(track)}
                className="bg-slate-900/20 hover:bg-slate-900/40 border border-white/3 rounded-3xl p-4 flex items-center gap-4 transition duration-200 cursor-pointer group hover:scale-[1.02] hover:border-rose-500/25 hover:shadow-lg"
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
                <span className="text-[9px] font-bold text-slate-450 bg-slate-950/40 border border-white/5 px-2.5 py-1 rounded-lg">
                  {track.quality_score ? `${track.quality_score}% Hi-Fi` : 'N/A'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. TRENDING MUSIC GRIDS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left column: Trending tracks */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex justify-between items-end">
            <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
              <Flame className="w-5 h-5 text-rose-400 animate-pulse" /> Trending Now
            </h3>
            <button 
              onClick={() => onNavigate('discover')}
              className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition"
            >
              See All
            </button>
          </div>

          <div className="space-y-2 bg-slate-950/40 backdrop-blur-md border border-white/5 p-5 rounded-3xl shadow-inner glow-rose/5">
            {allTracks.map((track, index) => (
              <TrackRow 
                key={track.id} 
                track={track} 
                index={index}
                onViewReport={onViewReport}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        </div>

        {/* Right column: Popular Artists */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="text-lg font-extrabold text-white flex items-center gap-1.5">
            <Award className="w-5 h-5 text-rose-400" /> Popular Artists
          </h3>

          <div className="space-y-4 bg-slate-950/40 backdrop-blur-md border border-white/5 p-6 rounded-3xl shadow-inner">
            {popularArtists.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">No artists available.</p>
            ) : (
              popularArtists.map((art, idx) => (
                <div 
                  key={idx} 
                  onClick={() => onNavigate('discover')}
                  className="flex items-center gap-4 group cursor-pointer p-2 rounded-3xl hover:bg-white/[0.02] transition duration-300"
                >
                  <div className="w-11 h-11 rounded-full overflow-hidden border border-white/5 flex-shrink-0">
                    <img src={art.avatar} alt="Avatar" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-200 truncate group-hover:text-rose-400 transition">{art.name}</h4>
                    <p className="text-[10px] text-slate-550 truncate mt-0.5">{art.genre} • {art.tracks} Tracks</p>
                  </div>
                  <span className="text-[9px] font-bold text-rose-455 hover:text-rose-350 transition">View</span>
                </div>
              ))
            )}
          </div>
        </div>

      </section>

    </div>
  );
};
