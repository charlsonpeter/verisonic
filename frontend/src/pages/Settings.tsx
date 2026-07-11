import React, { useState } from 'react';
import { 
  Settings as SettingsIcon, ShieldCheck, Monitor, Crown, 
  ToggleLeft, ToggleRight, Laptop, Headphones, Speaker, CheckCircle2,
  Copy, Eye, EyeOff
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { showInfo, showConfirm } from '../utils/swal';
import {
  QUALITY_DESCRIPTIONS,
  QUALITY_LABELS,
  type QualityLevelSetting,
} from '../utils/streamQuality';

export const Settings: React.FC = () => {
  const { currentUser, isPremium, canConfigureStreamQuality, token, fetchCurrentUser, userMode } = useAuth();
  const { qualityLevelSetting, setQualityLevelSetting, activeStreamLabel } = useAudio();

  const getTrialDaysLeft = () => {
    if (!currentUser?.created_at) return 0;
    const createdAt = new Date(currentUser.created_at);
    const now = new Date();
    const diffDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(7 - diffDays));
  };

  const userRole = currentUser?.real_role || currentUser?.role;

  const getAccountTierLabel = () => {
    if (!currentUser) return 'Not signed in';
    if (userRole === 'admin' || userRole === 'studio_admin') return 'Studio Master VIP (Active)';
    if (userRole === 'radio_admin') return 'Radio Broadcaster VIP (Active)';
    if (currentUser.subscription === 'unlimited') return 'Super Master Unlimited (Active)';
    if (currentUser.subscription === 'premium') {
      return currentUser.subscription_cycle === 'yearly'
        ? 'Premium - Yearly Subscription (Active)'
        : 'Premium - Monthly Subscription (Active)';
    }
    const trialDays = getTrialDaysLeft();
    if (trialDays > 0) return `Free Trial (Active - ${trialDays} Days Left)`;
    return 'Free Preview Tier';
  };

  const getSubscriptionMessage = () => {
    if (!currentUser) return '';
    if (userRole === 'admin' || userRole === 'studio_admin' || userRole === 'radio_admin') {
      return 'You have full platform access through your staff account.';
    }
    if (currentUser.subscription === 'premium' || currentUser.subscription === 'unlimited') {
      return 'Your subscription is active. Thank you for supporting authentic lossless music and radio artists.';
    }
    const trialDays = getTrialDaysLeft();
    if (trialDays > 0) {
      return `Your free trial includes premium features for ${trialDays} more day${trialDays === 1 ? '' : 's'}.`;
    }
    return 'Upgrade to access uncompressed audio, save playlists, and listen without 30-second previews.';
  };

  const handleVipUpgrade = () => {
    showInfo(
      'Studio VIP',
      'Self-service checkout is not available yet. Contact your platform administrator to upgrade to Premium or Unlimited.',
    );
  };

  // Broadcaster states
  const [station, setStation] = useState<any>(null);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchUserStation = async () => {
    if (currentUser?.role !== 'radio_admin') return;
    try {
      const res = await fetch('/api/radio', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        const myStation = data.find((s: any) => s.owner_id === currentUser.id);
        if (myStation) {
          setStation(myStation);
        }
      }
    } catch (e) {
      console.warn("Failed to load user station details for settings.", e);
    }
  };

  React.useEffect(() => {
    fetchUserStation();
  }, [currentUser]);

  const handleRegenerateKey = async () => {
    if (!station) return;
    setIsRegeneratingKey(true);
    try {
      const res = await fetch(`/api/radio/${station.id}/regenerate-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const updatedStation = await res.json();
        setStation(updatedStation);
      }
    } catch (e) {
      console.error("Failed to regenerate stream key:", e);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const fallbackCopyText = (text: string, onSuccess: () => void) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const successful = document.execCommand('copy');
      if (successful) {
        onSuccess();
      } else {
        console.error("Fallback copy failed");
      }
    } catch (err) {
      console.error("Fallback copy threw exception:", err);
    }
    document.body.removeChild(textArea);
  };

  const [currentTime, setCurrentTime] = useState(Math.floor(Date.now() / 1000));

  React.useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isKeyExpired = (key: string): boolean => {
    if (!key || !key.startsWith("rs_key_")) return true;
    const parts = key.split("_");
    if (parts.length < 4) return true;
    const timestamp = parseInt(parts[parts.length - 1], 10);
    if (isNaN(timestamp)) return true;
    return (currentTime - timestamp) > 300;
  };

  const getKeyExpiryInfo = () => {
    if (!station || !station.stream_key) return null;
    const parts = station.stream_key.split("_");
    if (parts.length < 4) return { expired: true, text: "Invalid Format", color: "text-rose-500" };
    const timestamp = parseInt(parts[parts.length - 1], 10);
    if (isNaN(timestamp)) return { expired: true, text: "Invalid Format", color: "text-rose-500" };
    
    const elapsed = currentTime - timestamp;
    const remaining = 300 - elapsed;
    
    if (remaining <= 0) {
      return { expired: true, text: "Expired (will auto-renew on copy)", color: "text-amber-500 animate-pulse" };
    }
    return null;
  };

  const handleCopyKey = async () => {
    if (!station) return;
    let keyToCopy = station.stream_key || '';
    if (isKeyExpired(keyToCopy)) {
      try {
        const res = await fetch(`/api/radio/${station.id}/regenerate-key`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          keyToCopy = data.stream_key;
          setStation(data);
        }
      } catch (e) {
        console.error("Failed to silently regenerate stream key:", e);
      }
    }
    
    const onSuccess = () => {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(keyToCopy)
        .then(onSuccess)
        .catch(err => {
          console.warn("Clipboard API failed, trying fallback:", err);
          fallbackCopyText(keyToCopy, onSuccess);
        });
    } else {
      fallbackCopyText(keyToCopy, onSuccess);
    }
  };

  // Settings mock toggles
  const [glassmorphism, setGlassmorphism] = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyUploads, setNotifyUploads] = useState(false);

  const devices = [
    { name: "Schiit Bifrost 2/64 DAC", type: "USB External DAC", status: "Active (24-bit / 96kHz Mode)", icon: Headphones },
    { name: "Sony WH-1000XM4", type: "Bluetooth Receiver", status: "Connected (LDAC 990kbps)", icon: Headphones },
    { name: "Built-in Speakers", type: "Local Core Audio", status: "Standby", icon: Laptop }
  ];

  const isBroadcasterAdmin = currentUser && (currentUser.real_role || currentUser.role) === 'radio_admin';
  const showAdminSettings = userMode === 'admin' && isBroadcasterAdmin;

  const qualityOptions: Array<{
    id: QualityLevelSetting;
    label: string;
    desc: string;
    premium: boolean;
  }> = [
    { id: 'lossless', label: QUALITY_LABELS.lossless, desc: QUALITY_DESCRIPTIONS.lossless, premium: true },
    { id: 'hires', label: QUALITY_LABELS.hires, desc: QUALITY_DESCRIPTIONS.hires, premium: true },
    { id: 'high', label: QUALITY_LABELS.high, desc: QUALITY_DESCRIPTIONS.high, premium: true },
    { id: 'normal', label: QUALITY_LABELS.normal, desc: QUALITY_DESCRIPTIONS.normal, premium: false },
  ];

  const handleQualitySelect = async (id: QualityLevelSetting) => {
    if (!canConfigureStreamQuality && id !== 'normal') {
      const confirmed = await showConfirm(
        'Upgrade to Premium',
        'Higher stream quality tiers require a Premium or Unlimited subscription. Would you like to request an upgrade?',
        'Request Upgrade',
      );
      if (confirmed) {
        handleVipUpgrade();
      }
      return;
    }
    setQualityLevelSetting(id);
  };

  return (
    <div className="space-y-10 w-full max-w-4xl pb-10">
      {/* Title */}
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-rose-400" /> {showAdminSettings ? 'Broadcaster control Settings' : 'Platform Settings'}
        </h2>
      </div>

      {showAdminSettings ? (
        /* --- ADMIN BROADCASTER SETTINGS ONLY --- */
        station ? (
          <section className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner">
            {/* Broadcaster Connection Settings */}
            <div className="md:col-span-12 max-w-xl space-y-4">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest font-sans">
                Broadcaster Connection Settings
              </h3>
              <p className="text-[11px] text-slate-400 font-sans leading-normal">
                Copy your personal stream key into your PyQt5 desktop broadcaster application or encoder to stream live.
              </p>

              <div className="space-y-4 text-xs font-sans">

                {/* Stream Key */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9.5px] font-bold text-slate-555 uppercase block">Stream Key</label>
                    {(() => {
                      const info = getKeyExpiryInfo();
                      if (!info) return null;
                      return (
                        <span className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${info.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${info.expired ? 'bg-amber-500' : 'bg-emerald-400'}`} />
                          {info.text}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={station.stream_key || ''}
                      className="w-full bg-slate-950 border border-white/5 text-[10px] p-2.5 rounded-xl text-white font-mono font-semibold outline-none tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="px-3 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-405 hover:text-white rounded-xl transition cursor-pointer"
                    >
                      {copiedKey ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Regenerate Button */}
                <button
                  onClick={handleRegenerateKey}
                  disabled={isRegeneratingKey}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-rose-455 font-bold border border-rose-500/10 hover:border-rose-500/30 rounded-xl transition text-[10px] uppercase tracking-wider"
                >
                  {isRegeneratingKey ? 'Regenerating...' : 'Regenerate Stream Key'}
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="glass-card border border-white/5 rounded-3xl p-16 text-center animate-pulse">
            <SettingsIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-xs">No active radio station associated with this broadcaster account.</p>
          </div>
        )
      ) : (
        /* --- LISTENER SETTINGS ONLY --- */
        <div className="space-y-10">
          {/* 1. AUDIO QUALITY RESOLUTIONS */}
          <section className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl space-y-6 shadow-inner">
            <h3 className="text-base font-bold text-white">Stream Quality</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {qualityOptions.map((q) => {
                const isActive = qualityLevelSetting === q.id;
                const isLocked = !canConfigureStreamQuality && q.premium;
                return (
                  <div
                    key={q.id}
                    onClick={() => handleQualitySelect(q.id)}
                    className={`relative p-4 rounded-2xl border transition duration-200 flex flex-col justify-between ${
                      isLocked
                        ? 'bg-slate-950/20 border-white/5 opacity-60 cursor-not-allowed'
                        : isActive 
                          ? 'bg-rose-600/10 border-rose-500/35 shadow-md shadow-rose-500/5 cursor-pointer' 
                          : 'bg-slate-950/40 border-white/5 hover:border-slate-800 cursor-pointer'
                    }`}
                  >
                    {q.premium && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-[8px] font-extrabold uppercase tracking-wider text-amber-400">
                        <Crown className="w-3 h-3" />
                        Premium
                      </span>
                    )}
                    <div>
                      <h4 className={`text-xs font-bold pr-16 ${isActive ? 'text-rose-400' : 'text-slate-200'}`}>{q.label}</h4>
                    </div>
                    <p className="text-[9.5px] text-slate-455 mt-3 leading-normal">{q.desc}</p>
                  </div>
                );
              })}
            </div>
            {!canConfigureStreamQuality && (
              <p className="text-[10px] text-slate-500 font-semibold">
                Free accounts are locked to Normal quality. Upgrade to unlock higher tiers.
              </p>
            )}
            {activeStreamLabel && (
              <p className="text-[10px] text-emerald-400/90 font-semibold">
                Now playing: {activeStreamLabel}
              </p>
            )}
          </section>

          {/* 2. VIP ACCOUNT SUBSCRIPTION */}
          <section className="bg-slate-900/40 border border-white/3 p-6 rounded-3xl space-y-6 shadow-xl relative overflow-hidden font-sans">
            {isPremium && (
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
            )}
            
            <h3 className="text-xs font-bold text-rose-455 uppercase tracking-widest flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-amber-400" /> VIP Subscription Details
            </h3>

            <div className="space-y-4 max-w-xl">
              <div>
                <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">Current Account Tier</span>
                <span className="text-base font-extrabold text-white mt-1 block">
                  {getAccountTierLabel()}
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
                {getSubscriptionMessage()}
              </p>

              {!isPremium && (
                <button
                  type="button"
                  onClick={handleVipUpgrade}
                  className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-955 text-xs font-bold rounded-xl shadow-md hover:scale-[1.01] transition duration-300 uppercase tracking-wider cursor-pointer"
                >
                  Request Studio VIP Upgrade
                </button>
              )}
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
                      isActive ? 'bg-rose-600/5 border-rose-500/15' : 'bg-slate-900/40 border-white/3'
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
                    <span className={`text-[9.5px] font-extrabold uppercase ${isActive ? 'text-rose-455 animate-pulse font-sans' : 'text-slate-650 font-sans'}`}>
                      {dev.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      )}
    </div>
  );
};
