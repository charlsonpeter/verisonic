import React, { useState } from 'react';
import { ShieldAlert, CheckCircle2, User, Key, Mail, Crown, HelpCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthPageProps {
  onSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onSuccess }) => {
  const { login, register, socialLogin, authError, clearError } = useAuth();
  
  // Tab states
  const [isRegistering, setIsRegistering] = useState(false);

  // Field states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'listener' | 'studio_admin' | 'radio_admin' | 'admin'>('listener');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    clearError();
    setSuccessMsg(null);

    if (isRegistering) {
      const success = await register(email, password, fullName, role);
      if (success) {
        // Automatically login the user upon successful registration
        const loginSuccess = await login(email, password);
        if (loginSuccess) {
          onSuccess();
        }
      }
    } else {
      const success = await login(email, password);
      if (success) {
        onSuccess();
      }
    }
    setIsLoading(false);
  };

  const handleSocialClick = async (provider: 'google' | 'apple') => {
    setIsLoading(true);
    const success = await socialLogin(provider);
    if (success) {
      onSuccess();
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      {/* Container box */}
      <div className="relative max-w-md w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-white/5 rounded-3xl p-8 shadow-2xl">
        {/* Glow */}
        <div className="absolute -top-16 -left-16 w-40 h-40 bg-rose-600/10 rounded-full blur-2xl pointer-events-none" />

        {/* Brand */}
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="text-2xl font-extrabold text-gradient-premium tracking-tight leading-tight">
            {isRegistering ? "Create Audiophile Account" : "Access Studio Stage"}
          </h2>
          <p className="text-[11px] text-slate-450 mt-1 uppercase tracking-widest font-bold">
            VeriSonic Audio Nodes Gateway
          </p>
        </div>

        {/* Error / Success logs */}
        {authError && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-455 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed font-semibold">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-455 animate-pulse" />
            <span>{authError}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed font-semibold">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-450" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-semibold">
          {isRegistering && (
            <div className="space-y-1">
              <label className="text-slate-400 block mb-0.5">Display Name</label>
              <div className="relative bg-slate-950 border border-white/5 rounded-xl flex items-center px-3 py-2.5 focus-within:border-rose-500 transition">
                <User className="w-4.5 h-4.5 text-slate-500 flex-shrink-0 mr-2.5" />
                <input
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="bg-transparent text-slate-200 outline-none w-full text-xs"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-slate-400 block mb-0.5">Email Address</label>
            <div className="relative bg-slate-950 border border-white/5 rounded-xl flex items-center px-3 py-2.5 focus-within:border-rose-500 transition">
              <Mail className="w-4.5 h-4.5 text-slate-500 flex-shrink-0 mr-2.5" />
              <input
                type="email"
                placeholder="audiophile@verisonic.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-transparent text-slate-200 outline-none w-full text-xs"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400 block mb-0.5">Password</label>
            <div className="relative bg-slate-950 border border-white/5 rounded-xl flex items-center px-3 py-2.5 focus-within:border-rose-500 transition">
              <Key className="w-4.5 h-4.5 text-slate-500 flex-shrink-0 mr-2.5" />
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-transparent text-slate-200 outline-none w-full text-xs"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-gradient-to-r from-rose-600 to-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition duration-300 hover:scale-[1.01]"
          >
            {isLoading 
              ? "Connecting Secure Handshakes..." 
              : isRegistering 
                ? "Register Account" 
                : "Enter SoundStage"}
          </button>
        </form>

        {/* Toggle link */}
        <div className="mt-5 text-center text-xs">
          <button
            onClick={() => {
              setIsRegistering(!isRegistering);
              clearError();
              setSuccessMsg(null);
            }}
            className="text-slate-455 hover:text-rose-400 transition"
          >
            {isRegistering 
              ? "Already registered? Sign in here" 
              : "Need a high fidelity stream? Register here"}
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-6">
          <div className="absolute border-t border-white/5 w-full" />
          <span className="relative bg-slate-900 px-3 text-[10px] text-slate-505 font-bold uppercase tracking-wider">
            Third-party OAuth
          </span>
        </div>

        {/* Social Buttons */}
        <div className="flex justify-center">
          <button
            onClick={() => handleSocialClick('google')}
            className="w-full py-2.5 bg-white hover:bg-slate-100 text-slate-900 font-bold text-[10px] uppercase rounded-xl transition flex items-center justify-center gap-1.5"
          >
            <Crown className="w-3.5 h-3.5 text-slate-900 fill-slate-900" />
            Continue with Google
          </button>
        </div>

      </div>
    </div>
  );
};
export default AuthPage;
