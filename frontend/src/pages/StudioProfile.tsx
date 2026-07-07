import React from 'react';
import { Disc } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const StudioProfile: React.FC = () => {
  const { currentUser, token, fetchCurrentUser } = useAuth();
  const [studioName, setStudioName] = React.useState(currentUser?.artist_profile?.stage_name || currentUser?.full_name || '');
  const [studioBio, setStudioBio] = React.useState(currentUser?.artist_profile?.bio || '');
  const [profileMessage, setProfileMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSavingStudio, setIsSavingStudio] = React.useState(false);

  React.useEffect(() => {
    if (currentUser) {
      setStudioName(currentUser.artist_profile?.stage_name || currentUser.full_name || '');
      setStudioBio(currentUser.artist_profile?.bio || '');
    }
  }, [currentUser]);

  const handleUpdateStudioProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioName.trim() || !studioBio.trim()) {
      setProfileMessage({ type: 'error', text: 'Studio Name and Bio are required.' });
      return;
    }
    setIsSavingStudio(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/auth/request-artist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          stage_name: studioName.trim(),
          bio: studioBio.trim()
        })
      });
      if (res.ok) {
        setProfileMessage({ type: 'success', text: 'Studio profile saved successfully!' });
        if (fetchCurrentUser) await fetchCurrentUser();
      } else {
        const errorData = await res.json();
        setProfileMessage({ type: 'error', text: errorData.detail || 'Failed to save studio profile.' });
      }
    } catch (e) {
      setProfileMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSavingStudio(false);
    }
  };

  return (
    <div className="space-y-10 w-full animate-page-entry">
      <form onSubmit={handleUpdateStudioProfile} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
        <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans pt-1">
          <Disc className="w-4.5 h-4.5" /> Studio Profile Settings
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

        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-5 shadow-xl font-sans">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block text-xs">Studio / Stage Name</label>
              <input
                type="text"
                placeholder="Enter stage or label name..."
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block text-xs">Studio Bio & Description</label>
              <textarea
                placeholder="Describe your studio, label, or artist credentials..."
                value={studioBio}
                onChange={(e) => setStudioBio(e.target.value)}
                rows={5}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition resize-none font-sans"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <button 
            type="submit"
            disabled={isSavingStudio}
            className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
          >
            {isSavingStudio ? 'Saving Details...' : 'Save Studio Details'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudioProfile;
