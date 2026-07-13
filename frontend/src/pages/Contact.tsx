import React, { useState, useEffect, useMemo } from 'react';
import { Mail, MessageSquare, Send, CheckCircle2, ShieldCheck, Radio, Music, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type ContactSubject =
  | 'general'
  | 'studio_upgrade'
  | 'radio_upgrade'
  | 'studio_support'
  | 'radio_support';

function defaultSubjectForRole(role?: string): ContactSubject {
  if (role === 'studio_admin') return 'studio_support';
  if (role === 'radio_admin') return 'radio_support';
  return 'general';
}

export const Contact: React.FC = () => {
  const { token, currentUser } = useAuth();
  const userRole = currentUser?.real_role || currentUser?.role;

  const isPlatformAdmin = userRole === 'admin';
  const isStudioAdmin = userRole === 'studio_admin';
  const isRadioAdmin = userRole === 'radio_admin';

  const studioName = currentUser?.artist_profile?.stage_name?.trim() || '';

  const subjectOptions = useMemo(() => {
    if (isStudioAdmin) {
      return [
        { value: 'studio_support' as const, label: 'Studio Admin Account Support' },
        { value: 'general' as const, label: 'General Support / Inquiries' },
      ];
    }
    if (isRadioAdmin) {
      return [
        { value: 'radio_support' as const, label: 'Radio Admin Account Support' },
        { value: 'general' as const, label: 'General Support / Inquiries' },
      ];
    }
    return [
      { value: 'general' as const, label: 'General Support / Inquiries' },
      { value: 'studio_upgrade' as const, label: 'Request Role Upgrade: Studio Admin' },
      { value: 'radio_upgrade' as const, label: 'Request Role Upgrade: Radio Admin' },
    ];
  }, [isStudioAdmin, isRadioAdmin]);

  const [name, setName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [subject, setSubject] = useState<ContactSubject>(() => defaultSubjectForRole(userRole));
  const [stageOrStationName, setStageOrStationName] = useState('');
  const [message, setMessage] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [responseMsg, setResponseMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setSubject(defaultSubjectForRole(userRole));
  }, [userRole]);

  useEffect(() => {
    const allowed = new Set(subjectOptions.map((o) => o.value));
    if (!allowed.has(subject)) {
      setSubject(subjectOptions[0]?.value ?? 'general');
    }
  }, [subject, subjectOptions]);

  const isUpgradeSubject = subject === 'studio_upgrade' || subject === 'radio_upgrade';
  const isAccountSupportSubject = subject === 'studio_support' || subject === 'radio_support';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResponseMsg(null);

    if (!name.trim() || !email.trim() || !message.trim()) {
      setResponseMsg({ type: 'error', text: 'Please fill in all required fields.' });
      setIsLoading(false);
      return;
    }

    if (isUpgradeSubject && !stageOrStationName.trim()) {
      setResponseMsg({ type: 'error', text: 'Stage or station name is required for promotion requests.' });
      setIsLoading(false);
      return;
    }

    if (subject === 'radio_support' && !stageOrStationName.trim()) {
      setResponseMsg({ type: 'error', text: 'Please enter your radio station name.' });
      setIsLoading(false);
      return;
    }

    try {
      if (subject === 'studio_upgrade') {
        const res = await fetch('/api/auth/request-artist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            stage_name: stageOrStationName.trim(),
            bio: `[Requesting Studio Admin Role] ${message.trim()}`,
          }),
        });

        if (res.ok) {
          setResponseMsg({
            type: 'success',
            text: 'Your Studio Admin request was submitted successfully! It is pending administrator approval.',
          });
          setStageOrStationName('');
          setMessage('');
        } else {
          const data = await res.json();
          throw new Error(data.detail || 'Failed to submit request.');
        }
      } else if (subject === 'radio_upgrade') {
        const res = await fetch('/api/auth/request-radio-admin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            station_name: stageOrStationName.trim(),
            message: message.trim(),
          }),
        });

        if (res.ok) {
          setResponseMsg({
            type: 'success',
            text: 'Your Radio Admin request was submitted successfully! It is pending administrator approval.',
          });
          setStageOrStationName('');
          setMessage('');
        } else {
          const data = await res.json();
          throw new Error(data.detail || 'Failed to submit request.');
        }
      } else {
        setResponseMsg({
          type: 'error',
          text: 'Online contact for this subject is not available yet. Please email support from your account email address.',
        });
      }
    } catch (err: unknown) {
      setResponseMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong. Please connect to internet and try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sidebar = isStudioAdmin ? (
    <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4">
      <h3 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
        <Music className="w-4.5 h-4.5" /> Studio admin support
      </h3>
      <p className="text-[11.5px] leading-relaxed text-slate-400 font-sans">
        Use this form for studio account issues: track uploads, quality checks, studio profile, licence documents, wallet payouts, or account status.
      </p>
      {studioName && (
        <p className="text-[11px] text-slate-500 font-semibold">
          Signed in as studio: <span className="text-slate-300">{studioName}</span>
        </p>
      )}
    </div>
  ) : isRadioAdmin ? (
    <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4">
      <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
        <Radio className="w-4.5 h-4.5" /> Radio admin support
      </h3>
      <p className="text-[11.5px] leading-relaxed text-slate-400 font-sans">
        Use this form for radio account issues: station profile, stream keys, broadcaster setup, listener revenue, wallet payouts, or account status.
      </p>
    </div>
  ) : (
    <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4">
      <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
        <ShieldCheck className="w-4.5 h-4.5" /> Promotion workflow
      </h3>
      <p className="text-[11.5px] leading-relaxed text-slate-400 font-sans">
        Listeners can apply to become a <strong>Studio Admin</strong> (to upload lossy/lossless audio tracks) or a{' '}
        <strong>Radio Admin</strong> (to provision continuous FM streams).
      </p>
      <p className="text-[11.5px] leading-relaxed text-slate-400 font-sans">
        Once approved, you will unlock specialized administrative panels directly inside your dashboard.
      </p>
    </div>
  );

  const formTitle = isStudioAdmin
    ? 'Studio admin account support'
    : isRadioAdmin
      ? 'Radio admin account support'
      : 'Send support or promotion request';

  const messageLabel =
    subject === 'general'
      ? 'Your message'
      : isAccountSupportSubject
        ? 'Describe your account issue'
        : 'Describe your studio, stream setups, and brief bio';

  const messagePlaceholder =
    subject === 'studio_support'
      ? 'e.g. track stuck in analysis, studio profile disabled, wallet withdrawal question…'
      : subject === 'radio_support'
        ? 'e.g. stream key issue, station appeal, wallet payout, broadcaster connection…'
        : subject === 'general'
          ? 'How can we help you today?'
          : 'Submit details about your audio catalogs or stream sources…';

  if (isPlatformAdmin) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl space-y-10 pb-10">
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Mail className="w-8 h-8 text-rose-400 animate-pulse" /> Contact Support Hub
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        <div className="md:col-span-4 space-y-6">{sidebar}</div>

        <div className="md:col-span-8 glass-card p-8 rounded-3xl border border-rose-500/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

          <h3 className="text-xs font-extrabold text-rose-455 uppercase tracking-widest flex items-center gap-1.5 mb-6">
            <MessageSquare className="w-4.5 h-4.5 text-rose-400" /> {formTitle}
          </h3>

          {responseMsg && (
            <div
              className={`p-4 rounded-xl text-xs flex items-center gap-2 font-semibold font-sans mb-6 ${
                responseMsg.type === 'success'
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450'
                  : 'bg-rose-500/10 border border-rose-500/20 text-rose-455'
              }`}
            >
              {responseMsg.type === 'success' ? (
                <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4.5 h-4.5 text-rose-400 flex-shrink-0" />
              )}
              <span>{responseMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 text-xs font-sans">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-350 block">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-350 block">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-350 block">Inquiry Type / Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value as ContactSubject)}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition cursor-pointer font-bold"
              >
                {subjectOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-300">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {subject === 'studio_support' && studioName && (
              <div className="p-4 bg-slate-950/45 border border-cyan-500/15 rounded-2xl space-y-1">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                  <Music className="w-4 h-4" />
                  <span>Your studio</span>
                </div>
                <p className="text-sm font-bold text-slate-200">{studioName}</p>
              </div>
            )}

            {isUpgradeSubject && (
              <div className="space-y-1 p-4 bg-slate-950/45 border border-white/3 rounded-2xl space-y-4 animate-page-entry">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  {subject === 'studio_upgrade' ? (
                    <>
                      <Music className="w-4 h-4 text-cyan-400" />
                      <span>Studio Admin Registration Details</span>
                    </>
                  ) : (
                    <>
                      <Radio className="w-4 h-4 text-indigo-400" />
                      <span>Radio Admin Registration Details</span>
                    </>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-350 block">
                    {subject === 'studio_upgrade' ? 'Stage Name / Studio Brand' : 'Radio Station Name'}
                  </label>
                  <input
                    type="text"
                    value={stageOrStationName}
                    onChange={(e) => setStageOrStationName(e.target.value)}
                    placeholder={subject === 'studio_upgrade' ? 'e.g. DJ Resonance' : 'e.g. Chill Beats FM'}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition"
                    required
                  />
                </div>
              </div>
            )}

            {subject === 'radio_support' && (
              <div className="space-y-1 p-4 bg-slate-950/45 border border-indigo-500/15 rounded-2xl space-y-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                  <Radio className="w-4 h-4" />
                  <span>Your radio station</span>
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-350 block">Station name</label>
                  <input
                    type="text"
                    value={stageOrStationName}
                    onChange={(e) => setStageOrStationName(e.target.value)}
                    placeholder="e.g. Chill Beats FM"
                    className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-bold text-slate-350 block">{messageLabel}</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder={messagePlaceholder}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition resize-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold py-2.5 px-6 rounded-xl shadow-lg transition duration-300 flex items-center gap-2 cursor-pointer"
            >
              {isLoading ? 'Sending...' : 'Send Request'}
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
