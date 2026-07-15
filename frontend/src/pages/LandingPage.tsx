import React, { useState } from 'react';
import { ShieldCheck, Radio, Heart, Check, Disc, ChevronRight } from 'lucide-react';
import { SubscriptionPlans } from '../components/subscription/SubscriptionPlans';

interface LandingPageProps {
  onNavigate: (tab: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const scrollToSection = (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const faqs = [
    {
      q: 'What makes VeriSonic different?',
      a: 'Artists and studios share music that has been checked for real sound quality. You can listen at the level that fits your plan, and choose clearer sound when it is available.',
    },
    {
      q: 'Can I listen on my phone?',
      a: 'Yes. VeriSonic works in your phone or computer browser. Free listening uses standard quality, and Premium members can choose clearer options when a track supports them.',
    },
    {
      q: 'What is included with the free plan?',
      a: 'New accounts get a seven-day full trial. After that, free listeners can preview songs for 30 seconds and live radio for one minute at standard quality.',
    },
    {
      q: 'What does Premium include?',
      a: 'Premium lets you hear full songs and live radio without short previews, and unlock higher sound quality when the track offers it.',
    },
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
          <a href="#features" onClick={scrollToSection('features')} className="hover:text-white transition">Features</a>
          <a href="#science" onClick={scrollToSection('science')} className="hover:text-white transition">How it works</a>
          <a href="#pricing" onClick={scrollToSection('pricing')} className="hover:text-white transition">Pricing</a>
          <a href="#faq" onClick={scrollToSection('faq')} className="hover:text-white transition">FAQs</a>
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
              <span className="text-gradient-premium">Music that</span> <br />
              <span className="text-gradient-accent">sounds true.</span>
            </h1>

            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto font-semibold leading-relaxed">
              Discover songs and live radio in your browser. Pick the sound quality that feels right for you.
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
                    Clear sound
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-[8px] font-extrabold uppercase text-emerald-400 tracking-wider">
                    From the studio
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white truncate">Listen the way you like</h4>
                <p className="text-[10px] text-slate-400 truncate mt-0.5">Standard, high, or studio-clear when available</p>
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
      <section id="features" className="max-w-6xl mx-auto px-6 py-16 scroll-mt-24">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Made for listening</h2>
          <p className="text-sm text-slate-400">Find music, enjoy live radio, and keep your favorites in one place.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { title: 'From real studios', icon: ShieldCheck, desc: 'Music comes straight from creators, checked so what you hear matches the intended sound.' },
            { title: 'Live radio', icon: Radio, desc: 'Tune into live stations from your browser whenever a station is on air.' },
            { title: 'Your playlists', icon: Heart, desc: 'Save favorites, build playlists, and control playback from one simple player.' },
            { title: 'Quality checked', icon: Disc, desc: 'Each upload is reviewed so poor or misleading copies are less likely to reach your ears.' },
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

      <section id="comparison" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-24">
        <div className="text-center mb-12 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Sound quality choices</h2>
          <p className="text-sm text-slate-400">What you can hear depends on the song and your plan.</p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
          <table className="w-full text-left border-collapse text-xs">
            <caption className="sr-only">VeriSonic sound quality options</caption>
            <thead>
              <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                <th scope="col" className="p-5">Option</th>
                <th scope="col" className="p-5 text-rose-400 text-glow-rose font-bold">What it means</th>
                <th scope="col" className="p-5">Who can use it</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {[
                { name: 'Standard', us: 'Clear everyday listening', them: 'Free and Premium' },
                { name: 'High', us: 'Richer detail for focused listening', them: 'Premium' },
                { name: 'Studio clear', us: 'As close as possible to the original recording', them: 'Premium, when available' },
                { name: 'Highest detail', us: 'The fullest version the studio provided', them: 'Premium, when available' },
                { name: 'Quality review', us: 'Checks that help keep poor copies out', them: 'Handled by the platform team' },
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

      {/* HOW IT WORKS */}
      <section id="science" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-24">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">How it works</h2>
          <p className="text-sm text-slate-450 max-w-xl mx-auto">
            From studio upload to your headphones — a few simple steps.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Explanation text */}
          <div className="md:col-span-5 space-y-6">
            {[
              { num: '01', name: 'Studios share the original', desc: 'Creators upload the full-quality recording they made in the studio.' },
              { num: '02', name: 'We check the sound', desc: 'Each file is reviewed so you are less likely to hear a weak or fake copy.' },
              { num: '03', name: 'Ready to stream', desc: 'Approved songs are prepared so they play smoothly in your browser.' },
              { num: '04', name: 'You choose how to listen', desc: 'Pick a quality level that fits your plan. Free listening uses standard quality.' },
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

          {/* Graphical diagram — kept visual, plain-language labels */}
          <div className="md:col-span-7 bg-slate-900/40 border border-white/5 rounded-3xl p-6 shadow-inner">
            <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-4">Real studio sound vs. weak copies</h4>
            
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
                {/* 1. Full studio sound (Green Curve) */}
                <path 
                  d="M 0,15 Q 20,10 40,20 T 70,30 T 90,40 T 100,60 L 100,100 L 0,100 Z" 
                  fill="rgba(16,185,129,0.08)" 
                  stroke="#10b981" 
                  strokeWidth="1.5"
                />

                {/* 2. Weak / fake copy (Red Curve) */}
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
                  Full studio recording
                </span>
                <span className="flex items-center gap-1 text-rose-455">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  Weak copy that cuts off detail
                </span>
              </div>

              {/* Simple axis labels */}
              <div className="absolute bottom-2 left-4 right-4 flex justify-between text-[8px] text-slate-500 font-bold">
                <span>Bass</span>
                <span>Mids</span>
                <span className="text-rose-400">Detail lost</span>
                <span>Full range</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8. PRICING SECTION */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-24">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-4xl font-extrabold text-white">Simple plans</h2>
          <p className="text-sm text-slate-400">Start free, then upgrade when you want full songs and clearer sound.</p>
        </div>

        <div className="max-w-5xl mx-auto font-sans">
          <SubscriptionPlans
            compact
            onRequireAuth={() => onNavigate('auth')}
            onSuccess={() => onNavigate('home')}
            leadingSlot={(
              <div className="relative rounded-2xl border border-white/5 bg-slate-950/40 p-5 flex flex-col justify-between h-full">
                <div>
                  <h4 className="text-sm font-bold text-white">Free</h4>
                  <p className="text-2xl font-extrabold text-white mt-2">
                    ₹0
                    <span className="text-[10px] text-slate-500 font-bold block mt-1 uppercase">
                      Free to start
                    </span>
                  </p>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-3">
                    Try VeriSonic, then keep exploring with short previews.
                  </p>
                  <ul className="mt-4 space-y-2 text-[10px] text-slate-350">
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      30-second song previews
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      1-minute live radio previews
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      Standard sound quality
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                      Favorites and playlists
                    </li>
                  </ul>
                </div>
                <div className="mt-5 space-y-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('auth')}
                    className="w-full py-2.5 text-xs font-bold rounded-xl uppercase tracking-wider bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/5 transition"
                  >
                    Sign Up Free
                  </button>
                </div>
              </div>
            )}
          />
        </div>
      </section>

      {/* 9. FAQ ACCORDION */}
      <section id="faq" className="max-w-3xl mx-auto px-6 py-16 scroll-mt-24">
        <div className="text-center mb-16 space-y-2">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">Common questions</h2>
          <p className="text-xs text-slate-455">Quick answers about listening and plans.</p>
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
              Music and live radio in your browser — clear sound from real studios.
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
