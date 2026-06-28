import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, ShieldCheck, Volume2, Monitor, Crown, 
  ToggleLeft, ToggleRight, Laptop, Headphones, Speaker, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';

export const Settings: React.FC = () => {
  const { currentUser, isPremium, token, fetchCurrentUser } = useAuth();
  const { qualityLevelSetting, setQualityLevelSetting } = useAudio();

  // Settings mock toggles
  const [glassmorphism, setGlassmorphism] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyUploads, setNotifyUploads] = useState(false);

  // Profile Edit fields
  const [fullName, setFullName] = useState(currentUser?.full_name || 'Free Listener');
  const [isSaved, setIsSaved] = useState(false);

  // Artist Request fields
  const [stageName, setStageName] = useState(currentUser?.artist_profile?.stage_name || '');
  const [bio, setBio] = useState(currentUser?.artist_profile?.bio || '');
  const [artistReqMessage, setArtistReqMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isArtistReqLoading, setIsArtistReqLoading] = useState(false);

  React.useEffect(() => {
    if (currentUser?.artist_profile) {
      setStageName(currentUser.artist_profile.stage_name || '');
      setBio(currentUser.artist_profile.bio || '');
    }
  }, [currentUser]);

  const handleArtistRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageName.trim()) {
      setArtistReqMessage({ type: 'error', text: 'Stage name is required.' });
      return;
    }
    setIsArtistReqLoading(true);
    setArtistReqMessage(null);
    try {
      const res = await fetch('/api/auth/request-artist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          stage_name: stageName,
          bio: bio
        })
      });
      if (res.ok) {
        setArtistReqMessage({ type: 'success', text: 'Artist request submitted successfully! Pending approval from administrator.' });
        await fetchCurrentUser();
      } else {
        const data = await res.json();
        setArtistReqMessage({ type: 'error', text: data.detail || 'Failed to submit request.' });
      }
    } catch {
      setArtistReqMessage({ type: 'error', text: 'Network connection failed.' });
    } finally {
      setIsArtistReqLoading(false);
    }
  };

  const handleProfileSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const devices = [
    { name: "Schiit Bifrost 2/64 DAC", type: "USB External DAC", status: "Active (24-bit / 96kHz Mode)", icon: Headphones },
    { name: "Sony WH-1000XM4", type: "Bluetooth Receiver", status: "Connected (LDAC 990kbps)", icon: Headphones },
    { name: "Built-in Speakers", type: "Local Core Audio", status: "Standby", icon: Laptop }
  ];

  return (
    <div className="space-y-10 w-full max-w-4xl pb-10">
      {/* Title */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-rose-400" /> Platform Settings
        </h2>
        <p className="text-sm text-slate-400 mt-1">Configure audio resolution streams, account subscriptions, and DAC devices.</p>
      </div>

      {/* 1. AUDIO QUALITY RESOLUTIONS */}
      <section className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl space-y-6 shadow-inner">
        <h3 className="text-sm font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
          <Volume2 className="w-4.5 h-4.5" /> Audiophile Stream Quality Configuration
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { id: 'lossless', label: "Lossless FLAC", resolution: "24-bit / 96kHz", bitrate: "1,411 - 4,608 kbps", desc: "Studio Quality (Recommended for external DACs)" },
            { id: 'hires', label: "Hi-Res Master", resolution: "24-bit / 48kHz", bitrate: "920 kbps (ALAC/FLAC)", desc: "CD+ Resolution for high quality headphones" },
            { id: 'high', label: "High Quality", resolution: "16-bit / 44.1kHz", bitrate: "320 kbps (MP3/AAC)", desc: "Compressed audio with balanced performance" },
            { id: 'normal', label: "Normal Quality", resolution: "16-bit / 44.1kHz", bitrate: "160 kbps (AAC)", desc: "Optimized bandwidth for cellular networks" }
          ].map((q) => {
            const isActive = qualityLevelSetting === q.id;
            return (
              <div
                key={q.id}
                onClick={() => setQualityLevelSetting(q.id as any)}
                className={`p-4 rounded-2xl border transition duration-200 cursor-pointer flex flex-col justify-between ${
                  isActive 
                    ? 'bg-rose-600/10 border-rose-500/35 shadow-md shadow-rose-500/5' 
                    : 'bg-slate-950/40 border-white/5 hover:border-slate-800'
                }`}
              >
                <div>
                  <h4 className={`text-xs font-bold ${isActive ? 'text-rose-400' : 'text-slate-200'}`}>{q.label}</h4>
                  <span className="text-[10px] text-slate-400 font-extrabold block mt-1 uppercase tracking-wide">{q.resolution}</span>
                  <span className="text-[9px] text-slate-500 font-semibold block mt-0.5">{q.bitrate}</span>
                </div>
                <p className="text-[9.5px] text-slate-455 mt-4 leading-normal">{q.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. PROFILE SETTINGS */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Profile Edit */}
        <div className="md:col-span-7 bg-slate-900/20 border border-white/5 p-6 rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Profile Configurations</h3>
          
          <form onSubmit={handleProfileSave} className="space-y-4 text-xs">
            {isSaved && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 rounded-xl flex items-center gap-2 font-semibold font-sans">
                <CheckCircle2 className="w-4.5 h-4.5" /> Profile details saved!
              </div>
            )}
            
            <div className="space-y-1">
              <label className="font-bold text-slate-350 block">Display Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition"
              />
            </div>
            
            <div className="space-y-1">
              <label className="font-bold text-slate-350 block">Email Address</label>
              <input
                type="email"
                value={currentUser?.email || 'guest@verisonic.com'}
                disabled
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs opacity-50 outline-none text-slate-400 cursor-not-allowed"
              />
            </div>

            <button 
              type="submit"
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md transition"
            >
              Save Details
            </button>
          </form>
        </div>

        {/* VIP Subscriptions */}
        <div className="md:col-span-5 bg-slate-900/40 border border-white/3 p-6 rounded-3xl space-y-6 shadow-xl relative overflow-hidden">
          {isPremium && (
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl animate-pulse pointer-events-none" />
          )}
          
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Crown className="w-4 h-4" /> VIP Account details
          </h3>

          <div className="space-y-4">
            <div>
              <span className="text-[10px] text-slate-500 font-bold block uppercase">Current Plan</span>
              <span className="text-base font-extrabold text-white mt-1 block">
                {isPremium ? "Studio Master VIP (Active)" : "Free Preview Tier"}
              </span>
            </div>

            <p className="text-[10.5px] text-slate-455 leading-relaxed font-semibold">
              {isPremium 
                ? "Your billing cycle renews automatically. Thank you for supporting authentic lossless music and radio artists." 
                : "You are currently in guest mode. Upgrade to access uncompressed FLAC audio, save playlists, and listen without 30s limits."}
            </p>

            {!isPremium && (
              <button className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 text-xs font-bold rounded-xl shadow-md hover:scale-[1.01] transition duration-300">
                Activate Studio VIP ($14.99/mo)
              </button>
            )}
          </div>
        </div>

      </section>

      {/* 3. CONNECTED DEVICES */}
      <section className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl space-y-4 shadow-inner">
        <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
          <Monitor className="w-4.5 h-4.5" /> Active SoundStage Output Nodes
        </h3>
        
        <div className="space-y-2.5">
          {devices.map((dev, idx) => {
            const Icon = dev.icon;
            const isActive = dev.status.includes('Active');
            return (
              <div 
                key={idx}
                className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                  isActive ? 'bg-rose-600/5 border-rose-500/15' : 'bg-slate-950/40 border-white/3'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`p-2.5 rounded-xl border ${isActive ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-900 border-white/5 text-slate-500'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200">{dev.name}</h4>
                    <p className="text-[9px] text-slate-505 font-semibold mt-0.5">{dev.type}</p>
                  </div>
                </div>
                <span className={`text-[9.5px] font-extrabold uppercase ${isActive ? 'text-rose-400 animate-pulse font-sans' : 'text-slate-650 font-sans'}`}>
                  {dev.status}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. STUDIO ADMIN REQUEST */}
      {currentUser?.role === 'listener' && (
        <section className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl space-y-4 shadow-inner">
          <div>
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
              <Headphones className="w-4.5 h-4.5" /> Request Studio Admin Access
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Submit your stage name and biography to unlock studio upload tools, high-fidelity master inspection, and studio management permissions.
            </p>
          </div>

          {currentUser.artist_profile && (
            <div className="p-4 bg-cyan-500/5 border border-cyan-500/15 text-cyan-300 text-xs rounded-xl flex flex-col gap-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4.5 h-4.5 text-cyan-400" />
                Studio Admin request is currently pending administrator approval.
              </span>
              <p>Stage Name: <strong>{currentUser.artist_profile.stage_name}</strong></p>
              <p>Biography: <em>{currentUser.artist_profile.bio || "No biography provided."}</em></p>
            </div>
          )}

          {artistReqMessage && (
            <div className={`p-4 rounded-xl text-xs flex items-center gap-2 font-semibold ${
              artistReqMessage.type === 'success' 
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' 
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-455'
            }`}>
              {artistReqMessage.text}
            </div>
          )}

          <form onSubmit={handleArtistRequestSubmit} className="space-y-4 text-xs font-sans">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-350 block">Stage Name</label>
                <input
                  type="text"
                  placeholder="e.g. DJ Resonance"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-cyan-500 text-slate-300 transition"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-350 block">Artist Biography</label>
              <textarea
                placeholder="Share your musical background, style, and influences..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-cyan-500 text-slate-300 transition resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isArtistReqLoading}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold text-xs rounded-xl shadow-md transition"
            >
              {isArtistReqLoading ? "Submitting Request..." : currentUser.artist_profile ? "Update Request Details" : "Submit Studio Admin Request"}
            </button>
          </form>
        </section>
      )}

    </div>
  );
};
