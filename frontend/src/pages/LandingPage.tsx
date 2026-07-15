import React, { useState } from 'react';
import { Play, ShieldCheck, Radio, Heart, Check, Disc, ChevronRight } from 'lucide-react';
import { useAudio, Track, RadioStation } from '../context/AudioContext';
import { SubscriptionPlans } from '../components/subscription/SubscriptionPlans';

interface LandingPageProps {
  onNavigate: (tab: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const { playTrack, playRadioStation } = useAudio();
  
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [featuredTracks, setFeaturedTracks] = useState<Track[]>([]);
  const [featuredRadio, setFeaturedRadio] = useState<RadioStation[]>([]);
  const [contentStatus, setContentStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

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
        setContentStatus(tracksRes.ok || radioRes.ok ? 'ready' : 'unavailable');
      } catch (e) {
        console.error("Failed to load landing page data:", e);
        setContentStatus('unavailable');
      }
    };
    loadLandingData();
  }, []);

  const faqs = [
    { q: "What makes VeriSonic different?", a: "Studios upload lossless source files that are analyzed and prepared for multiple playback qualities. Available quality depends on the source file, your plan, and your selected stream setting." },
    { q: "Can I listen on my phone?", a: "Yes. VeriSonic is a responsive web app. Normal quality uses AAC 128 kbps HLS, while Premium members can choose higher qualities when available." },
    { q: "What is included with the free tier?", a: "New accounts have a seven-day full-access trial. Afterwards, free listeners can preview tracks for 30 seconds and radio for 60 seconds at normal quality." },
    { q: "What does Premium include?", a: "Premium unlocks full playback and quality settings including AAC 256, lossless, and Hi-Res master streams when the selected track provides them." }
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
              <span className="text-gradient-accent">Audio Streaming.</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto font-semibold leading-relaxed">
              Explore studio-uploaded music, live radio, and quality settings designed for every listening setup.
            </p>
          </div>

          {/* Floating High-Fidelity Player Mockup */}
          <div className="w-full max-w-sm mx-auto bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-5 shadow-2xl shadow-rose-500/5 hover:border-rose-500/20 transition-all duration-500 group relative overflow-hidden select-none hover:scale-[1.02] text-left">
            {/* Ambient Background Glow */}
            <div className="absolute -right-16 -top-16 w-36 h-36 bg-rose-500/10 rounded-full blur-3xl group-hover:bg-rose-500/15 transition-all duration-500" />
            
            <div className="flex items-center gap-4 relative z-10">
              {/* Spinning Record Art */}
              <div className="relative w-14 h-14 rounded-full overflow-hidden shadow-lg border border-white/10 flex-shrink-0 animate-spin" style={{ animationDuration: '8s' }}>
                <Disc className="w-7 h-7 m-auto text-rose-300" aria-hidden="true" />
                <div className="absolute inset-0 m-auto w-4.5 h-4.5 bg-slate-950 border border-white/10 rounded-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                </div>
              </div>

              {/* Track Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 border border-rose-500/25 text-[8px] font-extrabold uppercase text-rose-455 tracking-wider">
                    Quality options
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[8px] font-extrabold uppercase text-emerald-400 tracking-wider">
                    Studio
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white truncate">Music at the quality you choose</h4>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">Normal, high, lossless, and Hi-Res when available</p>
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
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Built for listeners and broadcasters</h2>
          <p className="text-sm text-slate-400">A complete web platform for music discovery, playback, and live radio.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: "Studio source uploads", icon: ShieldCheck, desc: "Studios can upload lossless source formats for analysis and transcoding." },
            { title: "Live radio", icon: Radio, desc: "Radio admins can broadcast from the desktop broadcaster to listeners in the web player." },
            { title: "Personal playlists", icon: Heart, desc: "Save favorites, build playlists, and control playback from one global player." },
            { title: "Audio analysis", icon: Disc, desc: "The processing pipeline records quality data and creates spectrogram reports for review." }
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

      <section id="comparison" className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Playback quality options</h2>
          <p className="text-sm text-slate-400">Quality availability depends on the source track and your subscription tier.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
          <table className="w-full text-left border-collapse text-xs">
            <caption className="sr-only">VeriSonic playback quality options</caption>
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th scope="col" className="p-5">Setting</th>
                <th scope="col" className="p-5 text-rose-400 text-glow-rose font-bold">VeriSonic playback</th>
                <th scope="col" className="p-5">Access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                { name: "Normal quality", us: "AAC 128 kbps HLS", them: "Available for free playback" },
                { name: "High quality", us: "AAC 256 kbps HLS", them: "Premium" },
                { name: "Lossless", us: "FLAC HLS at CD quality", them: "Premium, when available" },
                { name: "Hi-Res master", us: "Original source sample rate and bit depth", them: "Premium, when available" },
                { name: "Audio reports", us: "Analysis and spectrogram data", them: "Available to authorized admins" }
              ].map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/20 transition">
                  <th scope="row" className="p-5 font-semibold text-slate-300">{row.name}</th>
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
            <p className="text-xs text-slate-400 mt-1">Listen to approved music from the platform catalog.</p>
          </div>
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 transition"
          >
            Explore Library <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {contentStatus === 'loading' && <p className="text-sm text-slate-400">Loading featured tracks…</p>}
        {contentStatus === 'unavailable' && <p className="text-sm text-slate-400">Featured music is unavailable right now. Explore the library after signing in.</p>}
        {contentStatus === 'ready' && featuredTracks.length === 0 && <p className="text-sm text-slate-400">No featured tracks are available yet.</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {featuredTracks.map((track) => (
            <button
              key={track.id} 
              onClick={() => playTrack(track)}
              className="glass-card glass-card-hover p-4 rounded-3xl relative group text-left"
              aria-label={`Play ${track.title} by ${track.artist_name}`}
            >
              <div className="w-full aspect-square rounded-2xl overflow-hidden relative shadow-md bg-slate-800 border border-white/5 mb-3">
                <img src={track.cover_art_url} alt={`${track.title} cover`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                  <span className="w-12 h-12 bg-white text-slate-950 rounded-full flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition">
                    <Play className="w-5 h-5 fill-current ml-0.5" aria-hidden="true" />
                  </span>
                </div>
              </div>
              <h4 className="font-bold text-white text-xs truncate mb-0.5">{track.title}</h4>
              <p className="text-[10px] text-slate-450 truncate">{track.artist_name}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 5. FEATURED RADIO STATIONS */}
      <section className="max-w-6xl mx-auto px-6">
        <div className="flex justify-between items-end mb-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white">Live Broadcasting Hubs</h2>
            <p className="text-xs text-slate-400 mt-1">Tune in to available stations from the web player.</p>
          </div>
          <button 
            onClick={() => onNavigate('radio')}
            className="flex items-center gap-1 text-xs font-bold text-rose-400 hover:text-rose-300 transition"
          >
            All Live Stations <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {contentStatus === 'ready' && featuredRadio.length === 0 && <p className="text-sm text-slate-400">No radio stations are available yet.</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {featuredRadio.map((station) => (
            <button
              key={station.id} 
              onClick={() => {
                if (station.is_online === false) {
                  return;
                }
                playRadioStation(station);
              }}
              className={`glass-card rounded-2xl p-5 border transition duration-300 relative group cursor-pointer flex gap-4 ${
                station.is_online === false
                  ? 'opacity-60 hover:opacity-85 border-white/5 bg-slate-900/5'
                  : 'border-white/5 bg-slate-900/10 hover:border-slate-800'
              } text-left`}
              disabled={station.is_online === false}
              aria-label={station.is_online === false ? `${station.name} is offline` : `Play ${station.name}`}
            >
              <div className="w-16 h-16 rounded-xl overflow-hidden shadow-inner flex-shrink-0 relative">
                <img src={station.cover_art_url} alt={`${station.name} cover`} className="w-full h-full object-cover" />
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
            </button>
          ))}
        </div>
      </section>

      {/* 6. HOW AUDIO QUALITY WORKS DIAGRAM */}
      <section id="science" className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">How Audio Verification Works</h2>
          <p className="text-sm text-slate-450 max-w-xl mx-auto">
            Uploaded source files are analyzed before quality-specific streams are prepared for playback.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Explanation text */}
          <div className="md:col-span-5 space-y-6">
            {[
              { num: "01", name: "Lossless source upload", desc: "Studios provide supported lossless source files such as FLAC, WAV, AIFF, or ALAC." },
              { num: "02", name: "Audio analysis", desc: "The processing pipeline extracts metadata and creates quality and spectrogram data." },
              { num: "03", name: "Review and preparation", desc: "Approved tracks are transcoded into quality-specific HLS variants when supported." },
              { num: "04", name: "Playback choice", desc: "Listeners select an available quality level; free accounts use normal-quality AAC 128 playback." }
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

      {/* 8. PRICING SECTION */}
      <section id="pricing" className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Audiophile Streaming Plans</h2>
          <p className="text-sm text-slate-400">Choose the plan and playback quality that fit your listening needs.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto font-sans">
          {/* Free Tier */}
          <div className="bg-slate-900/10 border border-white/5 rounded-3xl p-8 flex flex-col justify-between shadow-inner hover:border-slate-800 transition duration-300">
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-extrabold text-slate-300 uppercase tracking-wide">Listener Free</h3>
                <p className="text-xs text-slate-450 mt-1">Try the platform, then keep listening with previews.</p>
              </div>
              <div className="text-3xl font-extrabold text-white">
                ₹0<span className="text-[10px] text-slate-500 font-bold block mt-1 uppercase">Free preview access</span>
              </div>
              <ul className="space-y-3.5 text-xs text-slate-400">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> 30-Second Song Previews
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> 1-Minute Live Radio Limits
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> Normal Quality (AAC 128)
                </li>
                <li className="flex items-center gap-2 text-slate-650 line-through">
                  No Lossless FLAC Master streams
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-rose-455" /> Favorites and playlists
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

          <div className="lg:col-span-2">
            <SubscriptionPlans
              compact
              onRequireAuth={() => onNavigate('auth')}
              onSuccess={() => onNavigate('home')}
            />
          </div>
        </div>
      </section>

      {/* 9. FAQ ACCORDION */}
      <section id="faq" className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">Frequently Answered Queries</h2>
          <p className="text-xs text-slate-455">Answers about playback quality and access.</p>
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
        <div className="max-w-6xl mx-auto grid grid-cols-1 gap-8 mb-12">
          
          {/* Logo column */}
          <div className="col-span-2 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="bg-rose-600 p-1.5 rounded-xl text-white">
                <Radio className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-extrabold text-white">VeriSonic</span>
            </div>
            <p className="text-xs text-slate-455 max-w-sm leading-relaxed">
              A web platform for music streaming, live radio, and studio-managed catalogs.
            </p>
          </div>
        </div>

        {/* copyright sub-footer */}
        <div className="max-w-6xl mx-auto pt-8 border-t border-white/3 flex flex-col md:flex-row items-center justify-between text-[10px] text-slate-500 font-semibold gap-4">
          <span>&copy; 2026 VeriSonic. All rights reserved.</span>
          <button onClick={() => onNavigate('contact')} className="hover:text-slate-300">Contact</button>
        </div>
      </footer>

    </div>
  );
};
