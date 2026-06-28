import React from 'react';
import { Crown, CheckCircle2, X, Star, Zap, ShieldCheck } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';

interface PremiumModalProps {
  onNavigate: (tab: string) => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ onNavigate }) => {
  const { showPremiumModal, setShowPremiumModal } = useAudio();
  const { currentUser } = useAuth();

  if (!showPremiumModal) return null;

  const benefits = [
    { title: "Lossless Master Files", desc: "Access verified studio quality FLAC streams (up to 24-bit / 96kHz)" },
    { title: "Unlimited Listening", desc: "No 30-second previews. Stream all you want without interruptions" },
    { title: "Live Radio Broadcasting", desc: "Full continuous tuning on global live radio streams" },
    { title: "Personal Playlists & Library", desc: "Save tracks to custom collections, folders, and sync favorites" },
    { title: "Audiophile Spectrum Validations", desc: "Analyze spectrogram plots, sample distributions and cutoffs" },
    { title: "Ad-Free Playback", desc: "Continuous high-fidelity streams with zero advertisement delays" }
  ];

  const handleLoginClick = () => {
    setShowPremiumModal(false);
    onNavigate('auth');
  };

  const handleUpgradeClick = () => {
    setShowPremiumModal(false);
    onNavigate('settings');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex justify-center items-start overflow-y-auto z-50 p-4">
      {/* Container card */}
      <div className="relative max-w-2xl w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-rose-500/20 rounded-3xl p-8 md:p-10 max-h-[90vh] overflow-y-auto shadow-2xl shadow-rose-500/5 my-auto">
        
        {/* Glow accent */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-rose-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-pink-600/10 rounded-full blur-[100px] pointer-events-none" />

        {/* Close Button */}
        <button 
          onClick={() => setShowPremiumModal(false)}
          className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800/40 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="bg-gradient-to-tr from-amber-500 to-yellow-500 p-4 rounded-2xl shadow-lg shadow-amber-500/20 border border-amber-400/25 mb-4">
            <Crown className="w-8 h-8 text-slate-950 fill-current" />
          </div>
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2 font-sans bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-350">
            {currentUser ? "Stream in High Definition" : "Unlock Studio-Quality Audio"}
          </h2>
          <p className="text-sm text-slate-400 max-w-md">
            {currentUser 
              ? "Upgrade to premium to remove restrictions and enjoy true uncompressed studio audio." 
              : "Sign in or register for a premium account to remove constraints and stream lossless audio."}
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {benefits.map((benefit, idx) => (
            <div 
              key={idx}
              className="bg-slate-900/45 border border-white/3 p-4 rounded-2xl flex gap-3 shadow-inner"
            >
              <CheckCircle2 className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-200">{benefit.title}</h4>
                <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">{benefit.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-center">
          {currentUser ? (
            <button 
              onClick={handleUpgradeClick}
              className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 text-white text-sm font-bold rounded-2xl hover:scale-[1.01] hover:shadow-lg hover:shadow-rose-600/25 transition duration-300"
            >
              Upgrade Subscriptions
            </button>
          ) : (
            <>
              <button 
                onClick={handleLoginClick}
                className="w-full md:w-auto px-8 py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 text-white text-sm font-bold rounded-2xl hover:scale-[1.01] hover:shadow-lg hover:shadow-rose-600/25 transition duration-300"
              >
                Sign In / Register
              </button>
              <button 
                onClick={handleUpgradeClick}
                className="w-full md:w-auto px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 text-sm font-bold rounded-2xl border border-white/5 transition duration-300"
              >
                View Premium Pricing
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
