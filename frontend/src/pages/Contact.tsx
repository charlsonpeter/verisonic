import React, { useState } from 'react';
import { Mail, MessageSquare, Send, Sparkles, CheckCircle2, ShieldCheck, Radio, Music, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Contact: React.FC = () => {
  const { token, currentUser } = useAuth();
  
  const [name, setName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [subject, setSubject] = useState('general'); // general, studio_upgrade, radio_upgrade
  const [stageOrStationName, setStageOrStationName] = useState('');
  const [message, setMessage] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [responseMsg, setResponseMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setResponseMsg(null);

    // Validate inputs
    if (!name.trim() || !email.trim() || !message.trim()) {
      setResponseMsg({ type: 'error', text: 'Please fill in all required fields.' });
      setIsLoading(false);
      return;
    }

    if (subject !== 'general' && !stageOrStationName.trim()) {
      setResponseMsg({ type: 'error', text: 'Stage or Station name is required for promotion requests.' });
      setIsLoading(false);
      return;
    }

    try {
      if (subject === 'studio_upgrade' || subject === 'radio_upgrade') {
        // Send details to request-artist endpoint to register upgrade details
        const res = await fetch('/api/auth/request-artist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            stage_name: stageOrStationName.trim(),
            bio: `[Requesting ${subject === 'studio_upgrade' ? 'Studio Admin' : 'Radio Admin'} Role] ${message.trim()}`
          })
        });

        if (res.ok) {
          setResponseMsg({
            type: 'success',
            text: `Your ${subject === 'studio_upgrade' ? 'Studio Admin' : 'Radio Admin'} request was submitted successfully! It is pending administrator approval.`
          });
          setStageOrStationName('');
          setMessage('');
        } else {
          const data = await res.json();
          throw new Error(data.detail || 'Failed to submit request.');
        }
      } else {
        // Mock sending general support email
        await new Promise(r => setTimeout(r, 1200));
        setResponseMsg({
          type: 'success',
          text: 'Thank you for your message! Our engineering support team will contact you shortly.'
        });
        setMessage('');
      }
    } catch (err: any) {
      setResponseMsg({
        type: 'error',
        text: err.message || 'Something went wrong. Please connect to internet and try again.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-4xl space-y-10 pb-10">
      {/* Title Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <Mail className="w-8 h-8 text-rose-400 animate-pulse" /> Contact Support Hub
        </h2>
        <p className="text-sm text-slate-400 mt-1">Submit technical questions or request platform role upgrades to manage studios or live streams.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Form Info */}
        <div className="md:col-span-4 space-y-6">
          <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <ShieldCheck className="w-4.5 h-4.5" /> Promotion Workflow
            </h3>
            <p className="text-[11.5px] leading-relaxed text-slate-400 font-sans">
              Listeners can apply to become a <strong>Studio Admin</strong> (to upload lossy/lossless audio tracks) or a <strong>Radio Admin</strong> (to provision continuous FM streams).
            </p>
            <p className="text-[11.5px] leading-relaxed text-slate-400 font-sans">
              Once approved, you will unlock specialized administrative panels directly inside your dashboard.
            </p>
          </div>
        </div>

        {/* Right Column: Main Contact Form Card */}
        <div className="md:col-span-8 glass-card p-8 rounded-3xl border border-rose-500/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <h3 className="text-xs font-extrabold text-rose-455 uppercase tracking-widest flex items-center gap-1.5 mb-6">
            <MessageSquare className="w-4.5 h-4.5 text-rose-400" /> Send support or promotion request
          </h3>

          {responseMsg && (
            <div className={`p-4 rounded-xl text-xs flex items-center gap-2 font-semibold font-sans mb-6 ${
              responseMsg.type === 'success' 
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450' 
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-455'
            }`}>
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
                onChange={(e) => setSubject(e.target.value)}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition cursor-pointer font-bold"
              >
                <option value="general" className="bg-slate-950 text-slate-300">General Support / Inquiries</option>
                <option value="studio_upgrade" className="bg-slate-950 text-cyan-300">Request Role Upgrade: Studio Admin</option>
                <option value="radio_upgrade" className="bg-slate-950 text-indigo-300">Request Role Upgrade: Radio Admin</option>
              </select>
            </div>

            {/* Dynamic upgrading fields */}
            {subject !== 'general' && (
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
                    placeholder={subject === 'studio_upgrade' ? "e.g. DJ Resonance" : "e.g. Chill Beats FM"}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-300 transition"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="font-bold text-slate-350 block">
                {subject === 'general' ? 'Your Message' : 'Describe your studio, stream setups, and brief bio'}
              </label>
              <textarea 
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                placeholder={subject === 'general' ? "How can we help you today?" : "Submit details about your audio catalogs or stream sources..."}
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
