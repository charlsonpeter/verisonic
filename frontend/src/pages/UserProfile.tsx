import React from 'react';
import { Activity, Key, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { AppModal } from '../components/shared/AppModal';
import { ProfileAvatarUpload } from '../components/shared/ProfileAvatarUpload';
import {
  getAccountTierLabel,
  hasPaidSubscription,
  isOnFreeTrial,
} from '../utils/accountTier';
import { SubscriptionDates } from '../components/subscription/SubscriptionDates';

export const UserProfile: React.FC = () => {
  const { currentUser, fetchCurrentUser, token } = useAuth();
  const { favorites } = useAudio();

  // Profile details update states
  const [fullName, setFullName] = React.useState(currentUser?.full_name || '');
  const [email, setEmail] = React.useState(currentUser?.email || '');
  const [profileMessage, setProfileMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = React.useState(false);

  // Password update states
  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordMessage, setPasswordMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSavingPassword, setIsSavingPassword] = React.useState(false);

  React.useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.full_name || '');
      setEmail(currentUser.email || '');
    }
  }, [currentUser]);

  const closePasswordModal = () => {
    setIsPasswordModalOpen(false);
    setPasswordMessage(null);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleUpdateAllProfileDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setProfileMessage({ type: 'error', text: 'Display Name and Email are required.' });
      return;
    }
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          full_name: fullName,
          email: email
        })
      });
      
      if (!res.ok) {
        const data = await res.json();
        setProfileMessage({ type: 'error', text: data.detail || 'Failed to update user profile.' });
      } else {
        setProfileMessage({ type: 'success', text: 'Profile details saved successfully!' });
        if (fetchCurrentUser) await fetchCurrentUser();
      }
    } catch (err) {
      console.error(err);
      setProfileMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'All password fields are required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setIsSavingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword
        })
      });
      if (res.ok) {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const data = await res.json();
        setPasswordMessage({ type: 'error', text: data.detail || 'Failed to change password.' });
      }
    } catch (err) {
      console.error(err);
      setPasswordMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  // Dynamic listening metrics
  const userStats = {
    playsCount: favorites.length * 3,
    uniquesCount: favorites.length,
    bandwidthGb: parseFloat((favorites.length * 0.05).toFixed(2)),
    averageBitrate: favorites.length > 0 ? "1,411 kbps (FLAC CD)" : "N/A"
  };

  const tierBadge = getAccountTierLabel(currentUser);
  const isPaidSubscriber = hasPaidSubscription(currentUser);
  const isOnTrial = isOnFreeTrial(currentUser);

  return (
    <div className="space-y-10 w-full">
      {/* 1. PROFILE HEADER CARD */}
      <section className="bg-gradient-premium border border-white/5 p-8 rounded-3xl flex flex-col md:flex-row gap-6 items-center shadow-2xl relative overflow-hidden">
        {/* Ambient blob */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl animate-pulse" />
        
        <ProfileAvatarUpload
          fullName={fullName}
          email={email}
          imageUrl={currentUser?.profile_image_url}
          token={token}
          className="w-24 h-24"
          fallbackIconClassName="w-12 h-12"
          initialsClassName="text-2xl"
          onUploaded={() => { void fetchCurrentUser?.(); }}
        />
        
        <div className="text-center md:text-left space-y-2.5 flex-1 min-w-0">
          <div className="flex flex-col md:flex-row items-center gap-2">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{currentUser?.full_name || 'Guest User'}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
              isPaidSubscriber
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : isOnTrial
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-slate-900 border-white/3 text-slate-500'
            }`}>
              {tierBadge}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">{currentUser?.email || 'unregistered@verisonic.com'}</p>
          {hasPaidSubscription(currentUser) && (
            <div className="pt-1 max-w-md mx-auto md:mx-0">
              <SubscriptionDates
                activatedAt={currentUser?.subscription_activated_at}
                expiresAt={currentUser?.subscription_expires_at}
                compact
              />
            </div>
          )}
        </div>
      </section>

      {/* 2. STATS OVERVIEW */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
          <Activity className="w-4 h-4" /> Audiophile Stream Analytics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: "Accumulated Streamings", val: userStats.playsCount, desc: "Plays recorded" },
            { label: "Unique tracks audited", val: userStats.uniquesCount, desc: "Acoustic signatures" },
            { label: "Bandwidth consumed", val: `${userStats.bandwidthGb} GB`, desc: "Lossless packet streams" },
            { label: "Avg streaming resolution", val: userStats.averageBitrate, desc: "Active format depth" }
          ].map((stat, idx) => (
            <div key={idx} className="glass-card rounded-2xl p-5 border border-white/5 shadow-inner font-sans">
              <span className="text-[10px] text-slate-505 font-bold uppercase block mb-1">{stat.label}</span>
              <span className="text-xl md:text-2xl font-extrabold text-white block">{stat.val}</span>
              <span className="text-[9px] text-slate-400 font-bold block mt-1.5">{stat.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 2.5. ACCOUNT CONFIGURATIONS */}
      <form onSubmit={handleUpdateAllProfileDetails} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
        <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans pt-1">
          <Settings className="w-4.5 h-4.5" /> Account Settings
        </h3>
        {profileMessage && (
          <div className={`p-4 rounded-2xl text-xs font-semibold max-w-xl mx-auto shadow-md ${
            profileMessage.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450' 
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {profileMessage.text}
          </div>
        )}

        {/* Card 1: User Profile details (Full Width) */}
        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-5 shadow-xl font-sans">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              Update Profile Details
            </h3>
            <button
              type="button"
              onClick={() => {
                setPasswordMessage(null);
                setOldPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setIsPasswordModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-xl transition text-slate-300"
            >
              <Key className="w-3.5 h-3.5 text-rose-400" />
              Change Password
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Display Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
              />
            </div>
          </div>
        </div>

        {/* Centered Single Save Button */}
        <div className="flex justify-center pt-2">
          <button 
            type="submit"
            disabled={isSavingProfile}
            className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
          >
            {isSavingProfile ? 'Saving Details...' : 'Save Profile Details'}
          </button>
        </div>
      </form>

      <AppModal
        open={isPasswordModalOpen}
        onClose={closePasswordModal}
        maxWidth="md"
        showGradient={false}
        panelClassName="glass-card animate-scale-up"
        header={(
          <h3 className="text-sm font-extrabold text-white uppercase tracking-widest flex items-center gap-1.5 font-sans">
            <Key className="w-4 h-4 text-rose-500 animate-pulse" /> Change Password
          </h3>
        )}
        footer={(
          <>
            <button
              type="button"
              onClick={closePasswordModal}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition text-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="change-password-form"
              disabled={isSavingPassword}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-[10px] rounded-xl shadow-md transition uppercase tracking-wider cursor-pointer"
            >
              {isSavingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </>
        )}
      >
        {passwordMessage && (
          <div className={`p-3 rounded-xl text-xs font-semibold ${
            passwordMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {passwordMessage.text}
          </div>
        )}

        <form id="change-password-form" onSubmit={handleChangePassword} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold text-slate-400 uppercase tracking-wider block">Current Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-400 uppercase tracking-wider block">New Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-bold text-slate-400 uppercase tracking-wider block">Confirm New Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
            />
          </div>
        </form>
      </AppModal>

    </div>
  );
};
export default UserProfile;
