import React, { useState, useEffect } from 'react';
import { Radio as RadioIcon, RadioIcon as LiveIcon, Plus, Info, RefreshCw, Sparkles, Download, Eye, EyeOff, Copy, Check, Edit2, Save, X, Play, Pause, Users, Headphones } from 'lucide-react';
import { useAudio, RadioStation } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { RadioCard } from '../components/shared/RadioCard';
import { showError, showConfirm } from '../utils/swal';

const API_URL = '/api';

export const Radio: React.FC = () => {
  const { playRadioStation, activeRadioStation } = useAudio();
  const { token, currentUser } = useAuth();
  
  // Radio states
  const [stations, setStations] = useState<RadioStation[]>([]);
  
  // Creation state
  const [newStationName, setNewStationName] = useState('');
  const [newStationDesc, setNewStationDesc] = useState('');
  const [newStationStreamUrl, setNewStationStreamUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showKeyMap, setShowKeyMap] = useState<Record<number, boolean>>({});
  const [isRegeneratingKey, setIsRegeneratingKey] = useState<Record<number, boolean>>({});
  const [copiedKeyMap, setCopiedKeyMap] = useState<Record<number, boolean>>({});

  // Program and RJ metadata editing states
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editProgramTitle, setEditProgramTitle] = useState('');
  const [editRjName, setEditRjName] = useState('');
  const [editRjDetails, setEditRjDetails] = useState('');
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  const startEditingMetadata = (st: any) => {
    setEditProgramTitle(st.current_program_title || '');
    setEditRjName(st.rj_name || '');
    setEditRjDetails(st.rj_details || '');
    setIsEditingMetadata(true);
  };

  const handleSaveMetadata = async (stationId: number) => {
    setIsSavingMetadata(true);
    try {
      const res = await fetch(`${API_URL}/radio/${stationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_program_title: editProgramTitle,
          rj_name: editRjName,
          rj_details: editRjDetails
        })
      });
      if (res.ok) {
        setIsEditingMetadata(false);
        fetchRadioStations();
      } else {
        showError("Save Failed", "Failed to save program details.");
      }
    } catch (e) {
      console.error("Failed to save program details:", e);
      showError("Save Failed", "Failed to save program details.");
    } finally {
      setIsSavingMetadata(false);
    }
  };

  const handleRegenerateKey = async (stationId: number) => {
    const confirmed = await showConfirm(
      "Regenerate Stream Key?",
      "Are you sure you want to regenerate your Stream Key? Your current live broadcaster connection will disconnect!",
      "Yes, regenerate"
    );
    if (!confirmed) return;
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



  const hasStation = stations.some(s => s.owner_id === currentUser?.id);

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
        listeners_count: 100
      };
      setStations([...stations, newSt]);
      setNewStationName('');
      setNewStationDesc('');
      setNewStationStreamUrl('');
    } finally {
      setIsCreating(false);
    }
  };

  const filteredStations = stations;

  return (
    <div className="space-y-10 w-full">
      {/* Page Title */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <RadioIcon className="w-8 h-8 text-rose-400 animate-pulse" /> Live Radio Dashboard
          </h2>
          <p className="text-sm text-slate-400 mt-1">Tune into live digital radio streams and audiophile feeds.</p>
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



      {/* Radio Admin Setup and Dashboard Widgets */}
      {currentUser && (
        <>
          {/* Case 1: User is Radio Admin and does NOT have a station yet -> show Registration Form */}
          {currentUser.role === 'radio_admin' && !hasStation && (
            <div className="max-w-3xl animate-fade-in">
              <form onSubmit={handleCreateStation} className="glass-card p-6 rounded-3xl space-y-4 border border-rose-500/10 flex flex-col justify-between min-h-[350px]">
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

          {/* Case 3: User is Radio Admin and already has a station -> show custom Station Manager Dashboard */}
          {currentUser.role === 'radio_admin' && hasStation && (
            <div className="space-y-6 w-full animate-fade-in">
              {stations.filter(s => s.owner_id === currentUser.id).map(st => {
                const isLive = st.stream_url?.includes('/live');
                
                return (
                  <div key={st.id} className="space-y-6">
                    {/* Dashboard Header Bar */}
                    <div className="glass-card p-6 rounded-3xl border border-rose-500/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-tr from-rose-600 to-pink-600 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg shadow-rose-500/10">
                          <RadioIcon className="w-7 h-7 text-white animate-pulse" />
                        </div>
                        <div>
                          <span className="px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-full text-[9px] text-rose-400 font-extrabold uppercase tracking-wider block w-max mb-1.5 font-sans">
                            Station Manager
                          </span>
                          <h3 className="text-2xl font-black text-white tracking-tight">{st.name}</h3>
                        </div>
                      </div>
                    </div>

                    {/* Stats Cards & Metadata Manager Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      
                      {/* Full-width Stats & Program Info */}
                      <div className="lg:col-span-12 space-y-6">
                        
                        {/* Stats Widgets */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-1 font-sans relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-600/5 rounded-full blur-xl pointer-events-none" />
                            <span className="text-[10px] text-rose-455 font-extrabold uppercase tracking-widest block">Active Status</span>
                            <span className={`text-xl font-extrabold block uppercase ${isLive ? 'text-emerald-455 animate-pulse' : 'text-amber-505'}`}>
                              {isLive ? 'Live Broadcasting' : 'Standby (Auto-DJ)'}
                            </span>
                          </div>

                          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-1 font-sans relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-600/5 rounded-full blur-xl pointer-events-none" />
                            <span className="text-[10px] text-rose-455 font-extrabold uppercase tracking-widest block">Listening Counts</span>
                            <span className="text-xl font-extrabold text-white flex items-center gap-1.5">
                              <Users className="w-5 h-5 text-slate-500" />
                              {st.listeners_count || 0} listeners
                            </span>
                          </div>

                          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-1 font-sans relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-600/5 rounded-full blur-xl pointer-events-none" />
                            <span className="text-[10px] text-rose-455 font-extrabold uppercase tracking-widest block">Category</span>
                            <span className="text-xl font-extrabold text-white capitalize">
                              {st.category || 'Ambient'}
                            </span>
                          </div>
                        </div>

                        {/* Current Program Details Card */}
                        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-5">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                              <Sparkles className="w-4 h-4 text-rose-400" /> Current Program & RJ Details
                            </h4>
                            {!isEditingMetadata && (
                              <button
                                onClick={() => startEditingMetadata(st)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-xl transition text-slate-300"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Edit Details
                              </button>
                            )}
                          </div>

                          {isEditingMetadata ? (
                            <div className="space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Program/Show Title</label>
                                  <input
                                    type="text"
                                    placeholder="Morning Beats, Evening Chill..."
                                    value={editProgramTitle}
                                    onChange={(e) => setEditProgramTitle(e.target.value)}
                                    className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-200 transition font-sans"
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Radio Jockey (RJ) Name</label>
                                  <input
                                    type="text"
                                    placeholder="RJ Sarah, RJ Alex..."
                                    value={editRjName}
                                    onChange={(e) => setEditRjName(e.target.value)}
                                    className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-200 transition font-sans"
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">RJ Bio & Show Details</label>
                                <textarea
                                  placeholder="Provide short details about the host and program contents..."
                                  value={editRjDetails}
                                  onChange={(e) => setEditRjDetails(e.target.value)}
                                  rows={3}
                                  className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-200 transition font-sans resize-none"
                                />
                              </div>
                              <div className="flex gap-3 justify-end pt-2">
                                <button
                                  type="button"
                                  onClick={() => setIsEditingMetadata(false)}
                                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition text-slate-400"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isSavingMetadata}
                                  onClick={() => handleSaveMetadata(st.id)}
                                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider transition text-white"
                                >
                                  {isSavingMetadata ? 'Saving...' : 'Save Metadata'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-905/45 p-5 border border-white/3 rounded-2xl font-sans">
                              <div className="space-y-3">
                                <div>
                                  <span className="text-[10px] text-slate-505 font-bold uppercase tracking-wider block">Program Title</span>
                                  <p className="text-sm font-bold text-slate-200 mt-0.5">{st.current_program_title || 'N/A (Default Broadcast)'}</p>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-505 font-bold uppercase tracking-wider block">Radio Jockey (RJ)</span>
                                  <p className="text-sm font-bold text-rose-400 mt-0.5">{st.rj_name || 'N/A'}</p>
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-505 font-bold uppercase tracking-wider block">RJ Bio & Show Details</span>
                                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-semibold">
                                  {st.rj_details || 'No host bio details provided for the active session. Click Edit Details to update.'}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Case 3.5: User is Platform Admin and already has a station -> show simple info panel */}
          {currentUser.role === 'admin' && hasStation && (
            <div className="max-w-xl animate-fade-in">
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
                  <div className="bg-slate-905/45 p-4 border border-white/3 rounded-2xl text-[11px] space-y-1.5 font-sans">
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">Node Status:</span>
                      <span className="font-bold text-emerald-400 uppercase">Online (Active)</span>
                    </div>
                    <div className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-550">Stream Type:</span>
                      <span className="font-bold text-slate-300">{st.stream_url?.includes('/live') ? 'Live Broadcast Source' : st.stream_url ? 'Continuous FM Feed' : 'Auto-DJ Playlist'}</span>
                    </div>
                    {st.stream_url && !st.stream_url.includes('/live') && (
                      <div className="flex justify-between">
                        <span className="text-slate-550">Endpoint URL:</span>
                        <span className="font-bold text-rose-300 truncate max-w-[180px]" title={st.stream_url}>{st.stream_url}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Broadcasting Stations List */}
      {currentUser?.role !== 'radio_admin' && (
        filteredStations.length === 0 ? (
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
        )
      )}


    </div>
  );
};
