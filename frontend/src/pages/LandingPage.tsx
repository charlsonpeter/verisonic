import React, { useState } from 'react';
import { 
  Play, Volume2, ShieldCheck, Flame, Radio, Heart, Check, Crown,
  ChevronRight, ArrowUpRight, HelpCircle, Star, Users, Disc, ChevronLeft
} from 'lucide-react';
import { useAudio, Track, RadioStation } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { showError } from '../utils/swal';

interface LandingPageProps {
  onNavigate: (tab: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { playTrack, playRadioStation } = useAudio();
  const { token } = useAuth();
  
  // States for interactive carousels & accordions
  const [activeTestimonial, setActiveTestimonial] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [featuredTracks, setFeaturedTracks] = useState<Track[]>([]);
  const [featuredRadio, setFeaturedRadio] = useState<RadioStation[]>([]);

  React.useEffect(() => {
    const loadLandingData = async () => {
      try {
        const tracksRes = await fetch('/api/music?approved_only=true');
        if (tracksRes.ok) {
          const tracksData = await tracksRes.json();
          setFeaturedTracks(tracksData.slice(0, 4));
        }
        const radioRes = await fetch('/api/radio');
        if (radioRes.ok) {
          const radioData = await radioRes.json();
          setFeaturedRadio(radioData.slice(0, 3));
        }
      } catch (e) {
        console.error("Failed to load landing page data:", e);
      }
    };
    loadLandingData();
  }, []);

  const testimonials = [
    { text: "VeriSonic changed how I listen to classical pieces. The difference in clarity and bit-depth is night and day. Standard streaming services feel flat now.", author: "Dr. Charles Vance", role: "Concert Violinist & Audiophile" },
    { text: "As a studio sound engineer, I hate upscaled audio. VeriSonic's spectral verification algorithm ensures that everything I listen to is a true studio master. Incredible product.", author: "Helena Rostova", role: "Lead Mastering Engineer" },
    { text: "The radio stations are actually curated. Listening to synchronized jazz streams at 24-bit/96kHz is like having a private club in my living room.", author: "Marcus Thorne", role: "Music Historian" }
  ];

  const faqs = [
    { q: "What makes VeriSonic's audio quality different?", a: "Unlike typical streaming services that upscale standard MP3s and label them 'Hi-Fi', VeriSonic validates all audio uploads. We run files through spectral analysis to guarantee there are no high-frequency cutoffs or lossy transcoding signatures, ensuring you get true, studio-quality sound." },
    { q: "Can I stream lossless audio on my phone?", a: "Yes. Our stream delivery supports adaptive HLS playback. When using devices with limited bandwidth, the stream scales smoothly. On desktop and home systems with high bandwidth, you can toggle uncompressed FLAC at 24-bit/96kHz." },
    { q: "What is the guest preview limit?", a: "Guests can stream the first 30 seconds of any library track and up to 1 minute of live radio broadcasts. This allows you to audit the audio specifications and verify your device setup before upgrading." },
    { q: "Do I need special equipment to hear the difference?", a: "To enjoy the full benefits of 24-bit Lossless streaming, we recommend using a digital-to-analog converter (DAC) and high-quality wired headphones or monitors. However, even on standard speakers, our authentic masters provide better dynamic range." }
  ];

  return (
    <div className="pb-12 w-full overflow-x-hidden bg-slate-950">
      
      {/* Premium Top Navigation Bar for Landing Page */}
      <header className="w-full py-5 px-6 md:px-12 flex justify-between items-center border-b border-white/5 bg-slate-950/45 backdrop-blur-md sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-rose-600 to-rose-500 p-2 rounded-xl text-white shadow-lg shadow-rose-600/20">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <span className="text-base font-extrabold text-white tracking-tight">VeriSonic</span>
            <span className="text-[8px] bg-rose-500/25 text-rose-300 font-bold px-1.5 py-0.5 rounded-md uppercase ml-1.5 tracking-wider">Hi-Fi</span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-slate-400">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#comparison" className="hover:text-white transition">Comparisons</a>
          <a href="#science" className="hover:text-white transition">The Science</a>
          <a href="#pricing" className="hover:text-white transition">Pricing</a>
          <a href="#faq" className="hover:text-white transition">FAQs</a>
        </nav>

        <div className="flex gap-3 items-center">
          <button 
            onClick={() => onNavigate('auth')} 
            className="text-xs font-bold text-slate-350 hover:text-white px-3 py-2 transition"
          >
            Log In
          </button>
        </div>
      </header>

      {/* 1. HERO SECTION */}
      <section className="relative min-h-[80vh] flex flex-col justify-center items-center text-center px-6 pt-10">
        {/* Animated grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#180911_1px,transparent_1px),linear-gradient(to_bottom,#180911_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] -z-10" />

        <div className="max-w-4xl space-y-8 relative z-10">
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tight leading-none select-none">
              <span className="text-gradient-premium">The Purest</span> <br />
              <span className="text-gradient-accent">Audio Player.</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto font-semibold leading-relaxed">
              Experience uncompressed studio-quality FLAC masters and synchronized live broadcasts in a sleek, distraction-free environment.
            </p>
          </div>

          {/* Floating High-Fidelity Player Mockup */}
          <div className="w-full max-w-sm mx-auto bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-2xl shadow-rose-500/5 hover:border-rose-500/20 transition-all duration-500 group relative overflow-hidden select-none hover:scale-[1.02] text-left">
            {/* Ambient Background Glow */}
            <div className="absolute -right-16 -top-16 w-36 h-36 bg-rose-500/10 rounded-full blur-3xl group-hover:bg-rose-500/15 transition-all duration-500" />
            
            <div className="flex items-center gap-4 relative z-10">
              {/* Spinning Record Art */}
              <div className="relative w-14 h-14 rounded-full overflow-hidden shadow-lg border border-white/10 flex-shrink-0 animate-spin" style={{ animationDuration: '8s' }}>
                <img 
                  src="https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&q=80&w=200" 
                  alt="Spinning Record" 
                  className="w-full h-full object-cover" 
                />
                <div className="absolute inset-0 m-auto w-4.5 h-4.5 bg-slate-950 border border-white/10 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                </div>
              </div>

              {/* Track Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 text-[8px] font-extrabold uppercase text-rose-455 tracking-wider">
                    24-Bit FLAC
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[8px] font-extrabold uppercase text-emerald-400 tracking-wider">
                    Studio
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white truncate">Acoustic Forest Resonance</h4>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">Nature Synthesis Ensembles</p>
              </div>

              {/* Equalizer Soundwave Anim */}
              <div className="flex items-end gap-0.5 h-5 w-8 justify-center">
                {[12, 20, 8, 16].map((h, i) => (
                  <span 
                    key={i} 
                    className="w-0.5 bg-rose-500 rounded-full animate-bounce" 
                    style={{ 
                      height: `${h}px`, 
                      animationDelay: `${i * 0.15}s`, 
                      animationDuration: '0.8s' 
                    }} 
                  />
                ))}
              </div>
            </div>

            {/* Simulated Seek bar */}
            <div className="mt-4 space-y-1 relative z-10">
              <div className="h-1 bg-white/5 rounded-full overflow-hidden relative">
                <div className="absolute left-0 top-0 h-full w-[45%] bg-gradient-to-r from-rose-500 to-pink-500" />
              </div>
              <div className="flex justify-between text-[8px] text-slate-500 font-bold">
                <span>01:14</span>
                <span>03:42</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <button
              onClick={() => onNavigate('auth')}
              className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-sm rounded-2xl border border-white/5 transition"
            >
              Sign Up
            </button>
          </div>
        </div>

        {/* Animated soundwave mockup in Hero background */}
        <div className="w-full max-w-4xl mt-16 h-28 flex items-end justify-center gap-1.5 opacity-60">
          {[...Array(32)].map((_, i) => {
            const h = Math.sin(i * 0.2) * 40 + 50;
            return (
              <span
                key={i}
                className="w-1.5 bg-gradient-to-t from-rose-600/10 via-rose-500/40 to-pink-500 rounded-full animate-pulse"
                style={{ 
                  height: `${h}%`,
                  animationDelay: `${i * 0.08}s`,
                  animationDuration: '1.8s'
                }}
              />
            );
          })}
        </div>
      </section>

      {/* 2. FEATURES SECTION */}
      <section id="features" className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Engaged with Pure Acoustics</h2>
          <p className="text-sm text-slate-400">Our features are optimized for standard high-fidelity audio equipment.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: "24-bit Studio Master", icon: ShieldCheck, desc: "We support true uncompressed audio containers (FLAC, WAV) without lossy codecs or artificial upscaling adjustments." },
            { title: "Live Radio Broadcasts", icon: Radio, desc: "Global synchronized radio feeds playing audiophile-curated shows with metadata timing matching exactly." },
            { title: "Personal Playlists", icon: Heart, desc: "Configure custom channels, drag-and-drop queues, and sync listening stats with ease." },
            { title: "Acoustic Cutoff Checks", icon: Flame, desc: "Upload inspects. Using Librosa algorithms, our nodes check frequency distributions and reject low-grade MP3s." },
            { title: "Connected Node Devices", icon: Volume2, desc: "Seamless streaming switches from desktop interfaces to mobile web apps without synchronization delays." },
            { title: "Verified Spectrograms", icon: Disc, desc: "Audiophiles can view spectral densities and cutoff frequencies directly in the track report dashboard." }
          ].map((feat, idx) => {
            const Icon = feat.icon;
            return (
              <div key={idx} className="glass-card glass-card-hover p-6 rounded-3xl space-y-4">
                <div className="bg-rose-600/10 border border-rose-500/15 w-12 h-12 rounded-2xl flex items-center justify-center text-rose-455">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">{feat.title}</h3>
                <p className="text-xs text-slate-455 leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. WHY CHOOSE US - COMPARISON */}
      <section id="comparison" className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Compare The Audio Performance</h2>
          <p className="text-sm text-slate-400">Understanding why authentic master streaming changes your soundstage.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th className="p-5">Feature Specification</th>
                <th className="p-5 text-rose-400 text-glow-rose font-bold">VeriSonic Stream</th>
                <th className="p-5">Traditional Services</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                { name: "Max Audio Resolution", us: "24-bit / 96kHz Lossless FLAC", them: "16-bit / 44.1kHz (or 320kbps Lossy)" },
                { name: "Frequency Cutoff Limits", us: "None (Full 44kHz Spectrum)", them: "Filtered at 16kHz - 20kHz" },
                { name: "Spectral Integrity Checks", us: "Librosa Verified Master uploads", them: "Fake upscaled files accepted" },
                { name: "Broadcast Sync Latency", us: "Under 1.5 seconds synchronized", them: "Buffer shifts over 10 seconds" },
                { name: "Interactive Spec Reports", us: "Yes (Complete Spectrograms)", them: "No (Proprietary files hidden)" }
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/20 transition">
                  <td className="p-5 font-semibold text-slate-300">{row.name}</td>
                  <td className="p-5 text-rose-350 font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" /> {row.us}
                  </td>
                  <td className="p-5 text-slate-500">{row.them}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. FEATURED MUSIC CAROUSEL */}
      <section className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">Featured Studio Tracks</h2>
            <p className="text-xs text-slate-400 mt-1">Audit these high-fidelity tracks with our 30-second free guest player preview.</p>
          </div>
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 transition"
          >
            Explore Library <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {featuredTracks.map((track) => (
            <div 
              key={track.id} 
              onClick={() => playTrack(track)}
              className="glass-card glass-card-hover p-4 rounded-3xl relative group cursor-pointer"
            >
              <div className="w-full aspect-square rounded-2xl overflow-hidden relative shadow-md bg-slate-800 border border-white/5 mb-3">
                <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <button className="w-12 h-12 bg-white text-slate-950 rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition active:scale-95">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </button>
                </div>
              </div>
              <h4 className="font-bold text-white text-xs truncate mb-0.5">{track.title}</h4>
              <p className="text-[10px] text-slate-450 truncate">{track.artist_name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 5. FEATURED RADIO STATIONS */}
      <section className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">Live Broadcasting Hubs</h2>
            <p className="text-xs text-slate-400 mt-1">Globally synchronized, low-latency live audiophile radio streams.</p>
          </div>
          <button 
            onClick={() => onNavigate('radio')}
            className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 transition"
          >
            All Live Stations <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredRadio.map((station) => (
            <div 
              key={station.id} 
              onClick={() => {
                if (station.is_online === false) {
                  showError("Station Offline", "This radio station is currently offline.");
                  return;
                }
                playRadioStation(station);
              }}
              className={`glass-card rounded-2xl p-5 border transition duration-300 relative group cursor-pointer flex gap-4 ${
                station.is_online === false
                  ? 'opacity-60 hover:opacity-85 border-white/5 bg-slate-900/5'
                  : 'border-white/5 bg-slate-900/10 hover:border-slate-800'
              }`}
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden shadow-inner flex-shrink-0 relative">
                <img src={station.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
                {station.is_online !== false && (
                  <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <Play className="w-5 h-5 text-white fill-current" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1 flex flex-col justify-between">
                <div>
                  <h4 className="font-bold text-white text-xs truncate group-hover:text-rose-400 transition">{station.name}</h4>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{station.description}</p>
                </div>
                <div className="flex items-center justify-between text-[9px] font-bold text-slate-500 uppercase mt-2">
                  {station.is_online === false ? (
                    <span className="flex items-center gap-1 text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      Offline
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-rose-405">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                      Live
                    </span>
                  )}
                  <span>{station.is_online === false ? '0' : station.listeners_count?.toLocaleString()} listeners</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. HOW AUDIO QUALITY WORKS DIAGRAM */}
      <section id="science" className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">How Audio Verification Works</h2>
          <p className="text-sm text-slate-450 max-w-xl mx-auto">
            VeriSonic checks acoustic signatures to reject upscaled files and protect authentic lossless streaming tiers.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Explanation text */}
          <div className="md:col-span-5 space-y-6">
            {[
              { num: "01", name: "Spectral Signature Uploads", desc: "Acoustic containers (FLAC, WAV) are uploaded directly to the verification cluster nodes." },
              { num: "02", name: "Librosa Frequency Inspection", desc: "Fast Fourier Transform (FFT) filters analyze the high-frequency thresholds." },
              { num: "03", name: "Upscaling Rejection Check", desc: "If a low-grade MP3 has been converted to FLAC, a sharp spectral cutoff signature is detected below 17kHz, and the file is flagged." },
              { num: "04", name: "Direct CD/Studio Master Stream", desc: "Approved masters are packetized to live HLS channels for lossless delivery." }
            ].map((step, idx) => (
              <div key={idx} className="flex gap-4">
                <span className="text-xl font-extrabold text-rose-450">{step.num}</span>
                <div>
                  <h4 className="text-xs font-bold text-white">{step.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Graphical diagram representing spectrogram cutoff */}
          <div className="md:col-span-7 bg-slate-900/40 border border-white/5 rounded-3xl p-6 shadow-inner">
            <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-4">FFT Spectral Cutoff Comparison</h4>
            
            {/* SVG Diagram */}
            <div className="relative w-full h-56 bg-slate-950 rounded-2xl border border-white/5 p-4 overflow-hidden">
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                {/* Grid Lines */}
                <line x1="0" y1="20" x2="100" y2="20" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="0" y1="40" x2="100" y2="40" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="0" y1="60" x2="100" y2="60" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="0" y1="80" x2="100" y2="80" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                
                <line x1="30" y1="0" x2="30" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="60" y1="0" x2="60" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
                <line x1="90" y1="0" x2="90" y2="100" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />

                {/* Spectral curves */}
                {/* 1. Lossless/Studio Master (Green Curve - full range) */}
                <path 
                  d="M 0,15 Q 20,10 40,20 T 70,30 T 90,40 T 100,60 L 100,100 L 0,100 Z" 
                  fill="rgba(16,185,129,0.08)" 
                  stroke="#10b981" 
                  strokeWidth="1.5"
                />

                {/* 2. Fake Upscaled Rejection (Red Curve - sharp cutoff at 17kHz) */}
                <path 
                  d="M 0,18 Q 20,14 40,25 T 60,35 T 75,42 L 76,98 L 76,100 L 0,100 Z" 
                  fill="rgba(239,68,68,0.08)" 
                  stroke="#ef4444" 
                  strokeWidth="1.5"
                  strokeDasharray="2"
                />

                {/* Cutoff label marker */}
                <line x1="76" y1="10" x2="76" y2="100" stroke="rgba(239,68,68,0.4)" strokeWidth="1" strokeDasharray="4" />
              </svg>

              {/* Badges on graph */}
              <div className="absolute top-4 left-4 flex flex-col gap-1.5 text-[9px] font-bold">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Authentic Studio Master (WAV/FLAC)
                </span>
                <span className="flex items-center gap-1 text-rose-455">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Upscaled Lossy Rejection Limit (&lt;17kHz Cutoff)
                </span>
              </div>

              {/* Frequency coordinates */}
              <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[8px] text-slate-500 font-bold">
                <span>20 Hz</span>
                <span>5 kHz</span>
                <span>15 kHz</span>
                <span className="text-rose-400">17 kHz (Cutoff)</span>
                <span>22 kHz (CD)</span>
                <span>48 kHz (Hi-Res)</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 7. TESTIMONIALS CAROUSEL */}
      <section className="max-w-3xl mx-auto px-6 text-center space-y-8 relative">
        <div className="absolute top-1/2 -left-12 -translate-y-1/2">
          <button 
            onClick={() => setActiveTestimonial(prev => (prev === 0 ? testimonials.length - 1 : prev - 1))}
            className="p-2 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-white hover:border-slate-800 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="absolute top-1/2 -right-12 -translate-y-1/2">
          <button 
            onClick={() => setActiveTestimonial(prev => (prev === testimonials.length - 1 ? 0 : prev + 1))}
            className="p-2 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-white hover:border-slate-800 transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex justify-center gap-1 text-amber-500">
            {[...Array(5)].map((_, i) => <Star key={i} className="w-5 h-5 fill-current" />)}
          </div>
          <p className="text-lg md:text-xl font-medium text-slate-200 leading-relaxed italic">
            "{testimonials[activeTestimonial].text}"
          </p>
          <div>
            <h4 className="text-sm font-bold text-white">{testimonials[activeTestimonial].author}</h4>
            <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider mt-0.5">{testimonials[activeTestimonial].role}</p>
          </div>
        </div>

        {/* Carousel indicators */}
        <div className="flex justify-center gap-1.5 mt-4">
          {testimonials.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setActiveTestimonial(idx)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                activeTestimonial === idx ? 'bg-rose-505 w-5' : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
      </section>

      {/* 8. PRICING SECTION */}
      <section id="pricing" className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Audiophile Streaming Plans</h2>
          <p className="text-sm text-slate-400">Stream lossless audio master streams directly to your audio system.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto font-sans">
          {/* Free Tier */}
          <div className="bg-slate-900/10 border border-white/5 rounded-3xl p-8 flex flex-col justify-between shadow-inner hover:border-slate-800 transition duration-300">
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-slate-300 uppercase tracking-wide">Listener Free</h3>
                <p className="text-xs text-slate-450 mt-1">Audit verification tier for testing playback specs.</p>
              </div>
              <div className="text-3xl font-extrabold text-white">
                $0<span className="text-[10px] text-slate-500 font-bold block mt-1 uppercase">Free preview access</span>
              </div>
              <ul className="space-y-3.5 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> 30-Second Song Previews
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> 1-Minute Live Radio Limits
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> High Quality (320kbps MP3)
                </li>
                <li className="flex items-center gap-2 text-slate-650 line-through">
                  No Lossless FLAC Master streams
                </li>
                <li className="flex items-center gap-2 text-slate-650 line-through">
                  Custom playlist organization
                </li>
              </ul>
            </div>
            <button 
              onClick={() => onNavigate('auth')}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs rounded-xl mt-8 border border-white/5 transition"
            >
              Sign Up Free
            </button>
          </div>

          {/* Premium Tier */}
          <div className="bg-gradient-to-b from-rose-950/20 to-slate-950 border-2 border-rose-500/25 glow-rose rounded-3xl p-8 flex flex-col justify-between relative shadow-2xl hover:border-rose-500/40 transition duration-300">
            <div className="absolute top-4 right-4 bg-rose-600 text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-md">
              Popular
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-rose-455 uppercase tracking-wide flex items-center gap-1.5 text-glow-rose">
                  Studio Master VIP <Crown className="w-4 h-4 text-rose-400 fill-rose-400 animate-pulse" />
                </h3>
                <p className="text-xs text-slate-400 mt-1">Unlimited lossless streams for premium audio hardware.</p>
              </div>
              <div className="text-3xl font-extrabold text-white text-glow-rose">
                $14.99<span className="text-[10px] text-rose-350 font-bold block mt-1 uppercase">per month, cancel anytime</span>
              </div>
              <ul className="space-y-3.5 text-xs text-slate-350">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> Unlimited Playback (No Timers)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> 24-bit Lossless FLAC Streams
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> 96kHz High Frequency spectrum
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> Unlimited Radio Tuner
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> Custom Playlists & Favorites sync
                </li>
              </ul>
            </div>
            <button 
              onClick={() => onNavigate('settings')}
              className="w-full py-3 bg-gradient-to-r from-rose-600 to-rose-500 text-white font-extrabold text-xs rounded-xl mt-8 hover:scale-[1.02] transition shadow-lg shadow-rose-600/20 glow-rose"
            >
              Get Studio VIP Now
            </button>
          </div>
        </div>
      </section>

      {/* 9. FAQ ACCORDION */}
      <section id="faq" className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">Frequently Answered Queries</h2>
          <p className="text-xs text-slate-455">Everything you need to know about setting up lossless audio hardware.</p>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div 
                key={idx}
                className="bg-slate-900/25 border border-white/5 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between p-5 text-left text-xs font-bold text-slate-200 hover:text-white transition"
                >
                  <span>{faq.q}</span>
                  <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-250 ${isOpen ? 'rotate-90 text-rose-455' : ''}`} />
                </button>
                {isOpen && (
                  <div className="p-5 pt-0 text-xs text-slate-400 leading-relaxed border-t border-white/3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 10. FOOTER */}
      <footer className="border-t border-white/5 bg-slate-950 pt-16 pb-20 px-6">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          
          {/* Logo column */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-rose-600 p-1.5 rounded-xl text-white">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-extrabold text-white">VeriSonic</span>
            </div>
            <p className="text-xs text-slate-455 max-w-sm leading-relaxed">
              We deliver authentic soundstage reproduction using spectral file analysis validation layers to reject upscaled files.
            </p>
            <div className="text-[10px] text-slate-500 font-bold space-y-1">
              <div>Email: support@verisonic.com</div>
              <div>Phone: +1 (800) 555-SONIC</div>
              <div>Address: 100 Audiophile Way, San Francisco, CA</div>
            </div>
          </div>

          {/* Links columns */}
          {[
            { 
              title: "Product", 
              links: ["Features", "Hi-Fi Radio", "Pricing Plans", "Specifications", "FAQ"] 
            },
            { 
              title: "Legal & DMCA", 
              links: ["Privacy Policy", "Terms of Service", "DMCA Notices", "Cookie Preferences", "License Agreement"] 
            },
            { 
              title: "Company", 
              links: ["About Us", "Our Science", "Press Releases", "Developer APIs", "Careers at Sonic"] 
            }
          ].map((col, idx) => (
            <div key={idx} className="space-y-4">
              <h4 className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest">{col.title}</h4>
              <ul className="space-y-2.5 text-xs text-slate-455">
                {col.links.map((link, lIdx) => (
                  <li key={lIdx}>
                    <button onClick={() => onNavigate('home')} className="hover:text-white transition">{link}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* copyright sub-footer */}
        <div className="max-w-6xl mx-auto pt-8 border-t border-white/3 flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-500 font-semibold gap-4">
          <span>&copy; 2026 VeriSonic Inc. All rights reserved. CD quality frequency parameters are verified.</span>
          <div className="flex gap-4">
            <button className="hover:text-slate-300">Twitter</button>
            <button className="hover:text-slate-300">Instagram</button>
            <button className="hover:text-slate-300">Discord</button>
            <button className="hover:text-slate-300">GitHub</button>
          </div>
        </div>
      </footer>

    </div>
  );
};
