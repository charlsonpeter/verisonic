import React from 'react';
import { Crown, X } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { useAuth } from '../../context/AuthContext';
import { SubscriptionPlans } from '../subscription/SubscriptionPlans';

interface PremiumModalProps {
  onNavigate: (tab: string) => void;
}

export const PremiumModal: React.FC<PremiumModalProps> = ({ onNavigate }) => {
  const { showPremiumModal, setShowPremiumModal } = useAudio();
  const { currentUser } = useAuth();

  if (!showPremiumModal) return null;

  const handleLoginClick = () => {
    setShowPremiumModal(false);
    onNavigate('auth');
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-rose-500/20 rounded-3xl p-6 md:p-8 shadow-2xl shadow-rose-500/5 my-auto">
        <button 
          onClick={() => setShowPremiumModal(false)}
          className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white rounded-xl hover:bg-slate-800/40 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center mb-5 pr-8">
          <div className="bg-gradient-to-tr from-amber-500 to-yellow-500 p-3 rounded-xl shadow-lg shadow-amber-500/20 border border-amber-400/25 mb-3">
            <Crown className="w-6 h-6 text-slate-950 fill-current" />
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-white mb-1">
            {currentUser ? 'Upgrade to Premium' : 'Studio VIP Plans'}
          </h2>
          <p className="text-xs text-slate-400 max-w-sm">
            {currentUser
              ? 'Pick a plan — checkout opens here, no page change.'
              : 'Sign in to subscribe and unlock lossless streaming.'}
          </p>
        </div>

        <SubscriptionPlans
          compact
          modal
          onSuccess={() => setShowPremiumModal(false)}
          onRequireAuth={handleLoginClick}
        />

        {!currentUser && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleLoginClick}
              className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-500 text-white text-xs font-bold rounded-xl hover:scale-[1.01] transition"
            >
              Sign In / Register
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
