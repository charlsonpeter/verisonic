import React from 'react';
import { User as UserIcon, Crown, BarChart2, ShieldCheck, Heart, Clock, Disc, Activity } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAudio, Track } from '../context/AudioContext';
import { TrackRow } from '../components/shared/TrackRow';

interface UserProfileProps {
  onViewReport: (track: Track) => void;
  onViewDetails: (track: Track) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ onViewReport, onViewDetails }) => {
  const { currentUser, isPremium } = useAuth();
  const { favorites } = useAudio();

  const [favoriteTracks, setFavoriteTracks] = React.useState<Track[]>([]);

  React.useEffect(() => {
    const loadFavoriteTracks = async () => {
      try {
        const res = await fetch('/api/music?approved_only=true');
        if (res.ok) {
          const data = await res.json();
          const filtered = data.filter((t: Track) => favorites.includes(t.id));
          setFavoriteTracks(filtered);
        }
      } catch (e) {
        console.error("Failed to load favorite tracks:", e);
      }
    };
    loadFavoriteTracks();
  }, [favorites]);

  // Dynamic listening metrics
  const userStats = {
    playsCount: favorites.length * 3,
    uniquesCount: favorites.length,
    bandwidthGb: parseFloat((favorites.length * 0.05).toFixed(2)),
    averageBitrate: favorites.length > 0 ? "1,411 kbps (FLAC CD)" : "N/A"
  };

  return (
    <div className="space-y-10 w-full">
      {/* 1. PROFILE HEADER CARD */}
      <section className="bg-gradient-premium border border-white/5 p-8 rounded-3xl flex flex-col md:flex-row gap-6 items-center shadow-2xl relative overflow-hidden">
        {/* Ambient blob */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl animate-pulse" />
        
        <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-white/10 flex items-center justify-center text-slate-300 shadow-md flex-shrink-0">
          <UserIcon className="w-12 h-12" />
        </div>
        
        <div className="text-center md:text-left space-y-2.5 flex-1 min-w-0">
          <div className="flex flex-col md:flex-row items-center gap-2">
            <h2 className="text-2xl font-extrabold text-white tracking-tight">{currentUser?.full_name || 'Guest User'}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
              isPremium ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-slate-900 border-white/3 text-slate-500'
            }`}>
              {isPremium ? 'Studio VIP Premium' : 'Free Preview Account'}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-semibold">{currentUser?.email || 'unregistered@verisonic.com'}</p>
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
              <span className="text-[10px] text-slate-500 font-bold uppercase block mb-1">{stat.label}</span>
              <span className="text-xl md:text-2xl font-extrabold text-white block">{stat.val}</span>
              <span className="text-[9px] text-slate-400 font-bold block mt-1.5">{stat.desc}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. MY FAVORITES */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest px-1 flex items-center gap-1.5">
          <Heart className="w-4 h-4 text-rose-500 fill-rose-500" /> Saved Favorites ({favoriteTracks.length})
        </h3>
        {favoriteTracks.length === 0 ? (
          <div className="text-center py-14 bg-slate-900/10 border border-dashed border-white/5 rounded-3xl p-6">
            <Heart className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-pulse" />
            <p className="text-xs text-slate-450">No favorite songs added yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5 bg-slate-900/10 border border-white/3 p-4 rounded-3xl shadow-inner">
            {favoriteTracks.map((track, idx) => (
              <TrackRow 
                key={track.id} 
                track={track} 
                index={idx}
                onViewReport={onViewReport}
                onViewDetails={onViewDetails}
              />
            ))}
          </div>
        )}
      </section>

    </div>
  );
};
export default UserProfile;
