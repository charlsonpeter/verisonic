import React from 'react';
import { 
  Settings as SettingsIcon, Monitor, Crown, 
  Laptop, Headphones,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio } from '../context/AudioContext';
import { showConfirm } from '../utils/swal';
import {
  QUALITY_DESCRIPTIONS,
  QUALITY_LABELS,
  type QualityLevelSetting,
} from '../utils/streamQuality';
import { SubscriptionPlans } from '../components/subscription/SubscriptionPlans';
import { SubscriptionDates } from '../components/subscription/SubscriptionDates';
import {
  getAccountTierLabel,
  getTrialDaysLeft,
  hasPaidSubscription,
} from '../utils/accountTier';

export const Settings: React.FC = () => {
  const { currentUser, isPremium, canConfigureStreamQuality, canAccessPlatformSettings, switchUserMode } = useAuth();
  const { qualityLevelSetting, setQualityLevelSetting, activeStreamLabel } = useAudio();
  const activeQuality = canConfigureStreamQuality ? qualityLevelSetting : 'normal';

  if (!canAccessPlatformSettings) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <SettingsIcon className="w-12 h-12 text-slate-600 mx-auto" />
        <h2 className="text-lg font-bold text-white">Platform Settings</h2>
        <p className="text-sm text-slate-400">
          Switch to Listen mode to access stream quality and subscription settings.
        </p>
        <button
          type="button"
          onClick={() => switchUserMode('listener')}
          className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl uppercase tracking-wider"
        >
          Switch to Listen Mode
        </button>
      </div>
    );
  }

  const getSubscriptionMessage = () => {
    if (!currentUser) return '';
    if (currentUser.subscription === 'unlimited') {
      return 'You have unlimited platform access assigned by the super admin.';
    }
    if (hasPaidSubscription(currentUser)) {
      return 'Thank you for supporting authentic lossless music and radio artists.';
    }
    const trialDays = getTrialDaysLeft(currentUser);
    if (trialDays > 0) {
      return `Your free trial includes premium features for ${trialDays} more day${trialDays === 1 ? '' : 's'}.`;
    }
    return 'Upgrade to access uncompressed audio, save playlists, and listen without 30-second previews.';
  };

  const handleQualitySelect = async (id: QualityLevelSetting) => {
    if (!canConfigureStreamQuality && id !== 'normal') {
      const confirmed = await showConfirm(
        'Upgrade to Premium',
        'Higher stream quality tiers require a Premium subscription. View plans below?',
        'View Plans',
      );
      if (confirmed) {
        document.getElementById('subscription-plans')?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }
    setQualityLevelSetting(id);
  };

  const devices = [
    { name: "Schiit Bifrost 2/64 DAC", type: "USB External DAC", status: "Active (24-bit / 96kHz Mode)", icon: Headphones },
    { name: "Sony WH-1000XM4", type: "Bluetooth Receiver", status: "Connected (LDAC 990kbps)", icon: Headphones },
    { name: "Built-in Speakers", type: "Local Core Audio", status: "Standby", icon: Laptop }
  ];

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

  return (
    <div className="space-y-10 w-full max-w-4xl pb-10">
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <SettingsIcon className="w-8 h-8 text-rose-400" /> Platform Settings
        </h2>
      </div>

      <div className="space-y-10">
        <section className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl space-y-6 shadow-inner">
          <h3 className="text-base font-bold text-white">Stream Quality</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {qualityOptions.map((q) => {
              const isActive = activeQuality === q.id;
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
                {getAccountTierLabel(currentUser)}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-semibold">
              {getSubscriptionMessage()}
            </p>

            {hasPaidSubscription(currentUser) && (
              <SubscriptionDates
                activatedAt={currentUser?.subscription_activated_at}
                expiresAt={currentUser?.subscription_expires_at}
                compact
              />
            )}

            {currentUser?.subscription === 'unlimited' && currentUser.subscription_activated_at && (
              <SubscriptionDates
                activatedAt={currentUser.subscription_activated_at}
                compact
              />
            )}

            {currentUser?.subscription !== 'unlimited' && (
              <div id="subscription-plans" className="pt-2">
                <SubscriptionPlans compact onRequireAuth={() => undefined} />
              </div>
            )}
          </div>
        </section>

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
    </div>
  );
};
