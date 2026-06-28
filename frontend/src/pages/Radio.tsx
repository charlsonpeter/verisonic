import React, { useState, useEffect } from 'react';
import { Radio as RadioIcon, RadioIcon as LiveIcon, Plus, Info, RefreshCw, Sparkles, Download, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useAudio, RadioStation } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { RadioCard } from '../components/shared/RadioCard';

const API_URL = '/api';

export const Radio: React.FC = () => {
  const { playRadioStation, activeRadioStation } = useAudio();
  const { token, currentUser } = useAuth();
  
  // Radio states
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  
  // Creation state
  const [newStationName, setNewStationName] = useState('');
  const [newStationDesc, setNewStationDesc] = useState('');
  const [newStationCategory, setNewStationCategory] = useState('Pop');
  const [newStationStreamUrl, setNewStationStreamUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showKeyMap, setShowKeyMap] = useState<Record<number, boolean>>({});
  const [isRegeneratingKey, setIsRegeneratingKey] = useState<Record<number, boolean>>({});
  const [copiedKeyMap, setCopiedKeyMap] = useState<Record<number, boolean>>({});

  const handleRegenerateKey = async (stationId: number) => {
    if (!window.confirm("Are you sure you want to regenerate your Stream Key? Your current live broadcaster connection will disconnect!")) {
      return;
    }
    setIsRegeneratingKey(prev => ({ ...prev, [stationId]: true }));
    try {
      const res = await fetch(`${API_URL}/radio/${stationId}/regenerate-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        fetchRadioStations();
      }
    } catch (e) {
      console.error("Failed to regenerate stream key:", e);
    } finally {
      setIsRegeneratingKey(prev => ({ ...prev, [stationId]: false }));
    }
  };

  const handleCopyKey = (stationId: number, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKeyMap(prev => ({ ...prev, [stationId]: true }));
    setTimeout(() => {
      setCopiedKeyMap(prev => ({ ...prev, [stationId]: false }));
    }, 2000);
  };

  const categories = ['All', 'Pop', 'Rock', 'Jazz', 'Classical', 'Ambient', 'News'];

  const hasStation = stations.some(s => s.owner_id === currentUser?.id);

  const softwareDownloadWidget = (
    <div className="glass-card p-6 rounded-3xl border border-rose-500/10 space-y-4">
      <h3 className="text-sm font-bold text-rose-455 uppercase tracking-widest flex items-center gap-1.5 font-sans">
        <Download className="w-5 h-5 text-rose-400" /> VeriSonic Broadcast Link Software
      </h3>
      <p className="text-[11px] text-slate-400 leading-relaxed font-sans font-semibold">
        Install the VeriSonic background broadcast service to stream system audio or microphone input direct to your live radio feed.
      </p>
      <div className="bg-slate-955/45 p-4 border border-white/3 rounded-2xl flex flex-col gap-3">
        <div className="flex items-center justify-between text-[10px] font-sans">
          <span className="text-slate-500 font-bold uppercase">Detected Platform:</span>
          <span className="font-bold text-rose-400 uppercase">{
            (() => {
              const ua = window.navigator.userAgent.toLowerCase();
              if (ua.includes('android')) return 'Android';
              if (ua.includes('linux')) return 'Linux';
              if (ua.includes('mac')) return 'macOS';
              if (ua.includes('win')) return 'Windows';
              return 'Windows';
            })()
          }</span>
        </div>
        <a
          href={`/downloads/verisonic_broadcaster_${
            (() => {
              const ua = window.navigator.userAgent.toLowerCase();
              if (ua.includes('android')) return 'android';
              if (ua.includes('linux')) return 'linux';
              if (ua.includes('mac')) return 'macos';
              if (ua.includes('win')) return 'windows';
              return 'windows';
            })()
          }.zip`}
          onClick={(e) => {
            e.preventDefault();
            const ua = window.navigator.userAgent.toLowerCase();
            let os = 'Windows';
            if (ua.includes('android')) os = 'Android';
            else if (ua.includes('linux')) os = 'Linux';
            else if (ua.includes('mac')) os = 'macOS';
            alert(`Initiating download: VeriSonic Broadcast Link background service for ${os}.`);
          }}
          className="flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition duration-300 uppercase tracking-wider cursor-pointer"
        >
          Download for Default Platform (Recommended)
        </a>
      </div>
      <div className="space-y-1.5 pt-1 font-sans">
        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Alternative Installers:</span>
        <div className="flex gap-2 flex-wrap">
          {['Windows', 'macOS', 'Linux', 'Android'].map((platform) => {
            const ua = window.navigator.userAgent.toLowerCase();
            const isCurrent = (platform === 'Windows' && ua.includes('win')) ||
                              (platform === 'macOS' && ua.includes('mac')) ||
                              (platform === 'Linux' && ua.includes('linux')) ||
                              (platform === 'Android' && ua.includes('android'));
            if (isCurrent) return null;
            return (
              <a
                key={platform}
                href={`/downloads/verisonic_broadcaster_${platform.toLowerCase()}.zip`}
                onClick={(e) => {
                  e.preventDefault();
                  alert(`Initiating download: VeriSonic Broadcast Link installer for ${platform}.`);
                }}
                className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg text-[9.5px] font-semibold border border-white/5 cursor-pointer"
              >
                {platform}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );

  const fetchRadioStations = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/radio`);
      if (res.ok) {
        const data = await res.json();
        setStations(data);
      } else {
        throw new Error();
      }
    } catch (e) {
      console.error("Failed to fetch radio stations:", e);
      setStations([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRadioStations();
    const interval = setInterval(fetchRadioStations, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName || !newStationDesc) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/radio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: newStationName, 
          description: newStationDesc,
          category: newStationCategory,
          stream_url: newStationStreamUrl || null
        })
      });
      if (res.ok) {
        setNewStationName('');
        setNewStationDesc('');
        setNewStationStreamUrl('');
        fetchRadioStations();
      }
    } catch (e) {
      // Offline fallback: simulate station adding
      const newSt: RadioStation = {
        id: stations.length + 1,
        name: newStationName,
        description: newStationDesc,
        cover_art_url: 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?auto=format&fit=crop&q=80&w=200',
        stream_url: newStationStreamUrl || 'https://pub1.freefm.lk/1.aac',
        current_track_title: "Virtual Test Program",
        current_track_artist: "VeriSonic Node",
        listeners_count: 100,
        category: newStationCategory
      };
      setStations([...stations, newSt]);
      setNewStationName('');
      setNewStationDesc('');
      setNewStationStreamUrl('');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredStations = activeCategory === 'All' 
    ? stations 
    : stations.filter(s => s.category?.toLowerCase() === activeCategory.toLowerCase());

  return (
    <div className="space-y-10 w-full">
      {/* Page Title */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <RadioIcon className="w-8 h-8 text-rose-400 animate-pulse" /> Live Radio Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">Tune into synchronized time-offset digital streams playing validated music.</p>
        </div>
        <button 
          onClick={fetchRadioStations} 
          disabled={isLoading}
          className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-slate-400 hover:text-white transition"
          title="Refresh List"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
        </button>
      </div>

      {/* Category filters */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 border-b border-white/3">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex-shrink-0 border uppercase tracking-wider ${
              activeCategory === cat 
                ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/15' 
                : 'bg-slate-900/40 text-slate-455 border-white/5 hover:text-slate-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Radio Admin Setup and Dashboard Widgets */}
      {currentUser && (
        <>
          {/* Case 1: User is Radio Admin and does NOT have a station yet -> show Registration Form + Download Widget in a 2-column layout */}
          {currentUser.role === 'radio_admin' && !hasStation && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start animate-fade-in">
              <form onSubmit={handleCreateStation} className="glass-card p-6 rounded-3xl space-y-4 border border-rose-500/10 flex flex-col justify-between h-full min-h-[350px]">
                <div>
                  <h3 className="text-xs font-bold text-rose-455 uppercase tracking-widest flex items-center gap-1 mb-4 font-sans">
                    <Plus className="w-4 h-4" /> Register Your Live Radio Station Node
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Station Name</label>
                      <input 
                        type="text" 
                        placeholder="Station Name" 
                        value={newStationName}
                        onChange={(e) => setNewStationName(e.target.value)}
                        className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description</label>
                      <input 
                        type="text" 
                        placeholder="Acoustic description" 
                        value={newStationDesc}
                        onChange={(e) => setNewStationDesc(e.target.value)}
                        className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Stream URL (Optional)</label>
                      <input 
                        type="text" 
                        placeholder="Stream URL (Optional)" 
                        value={newStationStreamUrl}
                        onChange={(e) => setNewStationStreamUrl(e.target.value)}
                        className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Category</label>
                      <select
                        value={newStationCategory}
                        onChange={(e) => setNewStationCategory(e.target.value)}
                        className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-rose-350 font-bold tracking-wide cursor-pointer font-sans"
                      >
                        {categories.filter(c => c !== 'All').map(c => <option key={c} value={c} className="bg-slate-950 text-slate-300 font-sans">{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isCreating}
                  className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold py-3 px-5 rounded-xl shadow-lg transition duration-300 mt-4 uppercase tracking-wider cursor-pointer"
                >
                  {isCreating ? 'Provisioning...' : 'Provision Radio Node'}
                </button>
              </form>

              {softwareDownloadWidget}
            </div>
          )}

          {/* Case 2: User is Admin -> show only Registration Form */}
          {currentUser.role === 'admin' && !hasStation && (
            <form onSubmit={handleCreateStation} className="glass-card p-6 rounded-3xl max-w-3xl space-y-4 border border-rose-500/10">
              <h3 className="text-xs font-bold text-rose-455 uppercase tracking-widest flex items-center gap-1 font-sans">
                <Plus className="w-4 h-4" /> Register New Live Station Node
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <input 
                  type="text" 
                  placeholder="Station Name" 
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  className="bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition"
                  required
                />
                <input 
                  type="text" 
                  placeholder="Acoustic description" 
                  value={newStationDesc}
                  onChange={(e) => setNewStationDesc(e.target.value)}
                  className="bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition"
                  required
                />
                <input 
                  type="text" 
                  placeholder="Stream URL (Optional)" 
                  value={newStationStreamUrl}
                  onChange={(e) => setNewStationStreamUrl(e.target.value)}
                  className="bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition"
                />
                <select
                  value={newStationCategory}
                  onChange={(e) => setNewStationCategory(e.target.value)}
                  className="bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-rose-300 font-bold tracking-wide cursor-pointer"
                >
                  {categories.filter(c => c !== 'All').map(c => <option key={c} value={c} className="bg-slate-950 text-slate-300">{c}</option>)}
                </select>
              </div>
              <button 
                type="submit" 
                disabled={isCreating}
                className="bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold py-2.5 px-5 rounded-xl shadow-lg transition duration-300 cursor-pointer"
              >
                {isCreating ? 'Provisioning...' : 'Provision Radio Node'}
              </button>
            </form>
          )}

          {/* Case 3: User is Radio Admin and already has a station -> show Station Control Panel + Download Widget in a 2-column layout */}
          {(currentUser.role === 'radio_admin' || currentUser.role === 'admin') && hasStation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-fade-in">
              
              {/* Station Info Panel */}
              {stations.filter(s => s.owner_id === currentUser.id).map(st => (
                <div key={st.id} className="glass-card p-6 rounded-3xl border border-rose-500/10 space-y-4">
                  <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-full text-[9px] text-rose-400 font-extrabold uppercase font-sans">
                    Your Radio Node
                  </span>
                  <div>
                    <h3 className="text-xl font-bold text-slate-200">{st.name}</h3>
                    <p className="text-xs text-slate-400 mt-1">{st.description}</p>
                  </div>
                  <div className="bg-slate-955/45 p-4 border border-white/3 rounded-2xl text-[11px] space-y-1.5 font-sans">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">Node Status:</span>
                      <span className="font-bold text-emerald-400 uppercase">Online (Active)</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">Stream Type:</span>
                      <span className="font-bold text-slate-300">{st.stream_url?.includes('/live') ? 'Live Broadcast Source' : st.stream_url ? 'Continuous FM Feed' : 'Auto-DJ Playlist'}</span>
                    </div>
                    {st.stream_url && !st.stream_url.includes('/live') && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Endpoint URL:</span>
                        <span className="font-bold text-rose-300 truncate max-w-[180px]" title={st.stream_url}>{st.stream_url}</span>
                      </div>
                    )}
                  </div>

                  {/* Broadcaster Connection Settings */}
                  <div className="border-t border-white/5 pt-4 space-y-3.5">
                    <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                      Live Broadcaster Connection
                    </h4>
                    
                    {/* Status Display */}
                    <div className="flex items-center justify-between bg-slate-950/40 px-3.5 py-2.5 rounded-xl border border-white/3 text-[11px] font-sans">
                      <span className="text-slate-500 font-medium">Broadcaster Status:</span>
                      {st.stream_url?.includes('/live') ? (
                        <span className="flex items-center gap-1.5 font-bold text-emerald-400 uppercase animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Live Streaming
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 font-bold text-amber-500 uppercase">
                          <span className="w-2 h-2 rounded-full bg-amber-500"></span> Standby (Auto-DJ)
                        </span>
                      )}
                    </div>

                    {/* Stream URL */}
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block">Stream URL</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/radio/stream/ws`}
                          className="w-full bg-slate-950/80 border border-white/5 text-[10px] p-2.5 rounded-xl text-slate-400 font-mono outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/radio/stream/ws`);
                            alert("Stream URL copied to clipboard!");
                          }}
                          className="px-3 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                          title="Copy Stream URL"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Stream Key */}
                    <div className="space-y-1">
                      <label className="text-[9.5px] font-bold text-slate-500 uppercase tracking-wider block">Stream Key / Connection ID</label>
                      <div className="flex gap-2">
                        <input
                          type={showKeyMap[st.id] ? 'text' : 'password'}
                          readOnly
                          value={st.stream_key || ''}
                          className="w-full bg-slate-950/80 border border-white/5 text-[10px] p-2.5 rounded-xl text-rose-300 font-mono outline-none tracking-wider"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeyMap(prev => ({ ...prev, [st.id]: !prev[st.id] }))}
                          className="px-3 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                          title={showKeyMap[st.id] ? 'Hide Stream Key' : 'Show Stream Key'}
                        >
                          {showKeyMap[st.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyKey(st.id, st.stream_key || '')}
                          className="px-3 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white rounded-xl transition cursor-pointer"
                          title="Copy Stream Key"
                        >
                          {copiedKeyMap[st.id] ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* Regenerate Key button */}
                    <button
                      type="button"
                      disabled={isRegeneratingKey[st.id]}
                      onClick={() => handleRegenerateKey(st.id)}
                      className="w-full bg-slate-900 hover:bg-slate-800 text-[10px] text-rose-400 font-bold py-2 px-4 rounded-xl border border-rose-500/10 hover:border-rose-500/30 transition text-center uppercase tracking-wider cursor-pointer"
                    >
                      {isRegeneratingKey[st.id] ? 'Regenerating...' : 'Regenerate Stream Key'}
                    </button>
                  </div>

                </div>
              ))}

              {softwareDownloadWidget}

            </div>
          )}
        </>
      )}

      {/* Broadcasting Stations List */}
      {filteredStations.length === 0 ? (
        <div className="glass-card border border-white/5 rounded-3xl p-16 text-center max-w-xl animate-pulse">
          <LiveIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-xs">No live stations matching selection found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredStations.map((st) => (
            <RadioCard key={st.id} station={st} />
          ))}
        </div>
      )}

      {/* Info notice box */}
      <div className="bg-slate-900/10 border border-white/3 p-5 rounded-3xl flex gap-3 text-xs leading-relaxed text-slate-400 max-w-2xl">
        <Info className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
        <div>
          <strong className="text-slate-300">Synchronized Time Tuning:</strong> VeriSonic radio broadcasts use synchronized server-side timestamps. When you tune in, our streaming node computes the audio playback offsets mathematically to align your receiver client with all active listeners globally.
        </div>
      </div>

    </div>
  );
};
