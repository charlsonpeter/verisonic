import React, { useState } from 'react';
import { Key, ShieldAlert, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ForceAdminPasswordResetProps {
  onSuccess: () => void;
}

export const ForceAdminPasswordReset: React.FC<ForceAdminPasswordResetProps> = ({ onSuccess }) => {
  const { token, currentUser, logout, fetchCurrentUser } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || !confirmPassword) {
      setError('Both password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-initial-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await fetchCurrentUser();
        onSuccess();
        return;
      }
      setError(typeof data.detail === 'string' ? data.detail : 'Failed to update password.');
    } catch {
      setError('Could not reach the authentication service.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="relative max-w-md w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-white/5 rounded-3xl p-8 shadow-2xl">
        <div className="absolute -top-16 -left-16 w-40 h-40 bg-rose-600/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
            <Key className="w-7 h-7 text-rose-400" />
          </div>
          <h2 className="text-2xl font-extrabold text-gradient-premium tracking-tight leading-tight">
            Set Super Admin Password
          </h2>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed max-w-sm">
            {currentUser?.email
              ? `Signed in as ${currentUser.email}. Replace the default password before using platform admin features.`
              : 'Replace the default password before using platform admin features.'}
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-455 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed font-semibold">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-455" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
              placeholder="At least 8 characters, letter + number"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
              placeholder="Repeat new password"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider"
          >
            {isLoading ? 'Updating...' : 'Save & Continue'}
          </button>
        </form>

        <button
          type="button"
          onClick={logout}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
};

export default ForceAdminPasswordReset;
