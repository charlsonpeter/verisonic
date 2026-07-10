import React from 'react';

interface AnalyticsData {
  total_plays: number;
  total_listeners: number;
  total_tracks: number;
  bandwidth_gb: number;
  quality_distribution: { studio: number; good: number; average: number; poor: number };
  popular_tracks: Array<{ id: number; title: string; artist_name: string; play_count: number }>;
}

interface AdminAnalyticsProps {
  analyticsData: AnalyticsData | null;
  onLoad: () => void;
}

export const AdminAnalytics: React.FC<AdminAnalyticsProps> = ({ analyticsData, onLoad }) => (
  <div className="space-y-6 font-sans">
    <div>
      <h2 className="text-3xl font-extrabold tracking-tight text-white mb-1">System Metrics</h2>
      <p className="text-sm text-slate-400">Acoustic check stats, unique listener counts, and bandwidth loads.</p>
    </div>

    {!analyticsData ? (
      <button onClick={onLoad} className="px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold">
        Load Stats
      </button>
    ) : (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { label: 'Plays Count', val: analyticsData.total_plays },
            { label: 'Unique Users', val: analyticsData.total_listeners },
            { label: 'Library Songs', val: analyticsData.total_tracks },
            { label: 'Bandwidth Used', val: `${analyticsData.bandwidth_gb} GB` },
          ].map((s, idx) => (
            <div key={idx} className="glass-card rounded-2xl p-5 border-white/5 shadow-inner">
              <span className="text-[10px] text-rose-400 font-extrabold uppercase block mb-1">{s.label}</span>
              <span className="text-2xl font-extrabold text-white">{s.val}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div className="glass-card rounded-3xl p-6 border-white/5">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-5">Verified Acoustic Spread</h3>
            <div className="space-y-4">
              {[
                { label: 'Studio (>85 score)', key: 'studio' as const },
                { label: 'Good (71-85 score)', key: 'good' as const },
              ].map(({ label, key }) => (
                <div key={key}>
                  <div className="flex justify-between mb-1 font-semibold text-slate-350">
                    <span>{label}</span>
                    <span>{analyticsData.quality_distribution[key]} tracks</span>
                  </div>
                  <div className="h-1.5 bg-slate-950 border border-white/3 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${key === 'studio' ? 'bg-emerald-500' : 'bg-cyan-500'}`}
                      style={{
                        width: `${(analyticsData.quality_distribution[key] / Math.max(analyticsData.total_tracks, 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card rounded-3xl p-6 border-white/5">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest mb-5">Broadcast Plays Leaderboard</h3>
            <div className="space-y-3">
              {analyticsData.popular_tracks.map((t, idx) => (
                <div key={t.id} className="flex justify-between items-center bg-slate-950/45 p-3 rounded-xl border border-white/3">
                  <span className="font-extrabold text-rose-400 text-[10px]">#0{idx + 1}</span>
                  <span className="font-bold text-slate-200 truncate max-w-[150px]">{t.title}</span>
                  <span className="bg-rose-500/10 text-rose-300 font-bold px-2 py-0.5 rounded-full text-[8.5px] border border-rose-500/15">
                    {t.play_count} plays
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
  </div>
);
