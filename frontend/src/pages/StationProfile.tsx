import React, { useState, useEffect } from 'react';
import { Settings, Plus, Edit2, ArrowLeft, Radio, Info, MapPin, Globe, Eye, EyeOff, Copy, Check, RefreshCw, Wifi } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm, showError } from '../utils/swal';
import Swal from 'sweetalert2';

interface StationProfileProps {
  onNavigate?: (tab: string) => void;
}

export const StationProfile: React.FC<StationProfileProps> = ({ onNavigate }) => {
  const { currentUser, token, checkRadioStationStatus } = useAuth();
  const userRole = currentUser?.real_role || currentUser?.role;
  const isSuperAdmin = userRole === 'admin';
  const [myStations, setMyStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'edit' | 'add'>('list');
  const [editingStationId, setEditingStationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'pending'>('all');
  
  // Credentials & Settings Subsections per Station Card
  const [showCredentialsMap, setShowCredentialsMap] = useState<Record<number, boolean>>({});
  const [copiedKeyMap, setCopiedKeyMap] = useState<Record<number, boolean>>({});
  const [isRegeneratingKey, setIsRegeneratingKey] = useState<Record<number, boolean>>({});

  const [formValues, setFormValues] = useState({
    name: '',
    description: '',
    stream_url: '',
    category: '',
    licence: '',
    street_address: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    broadcast_frequency: '',
    languages: '',
    social_twitter: '',
    social_instagram: '',
    is_active: true
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchStations = async () => {
    setIsLoading(true);
    const userRole = currentUser?.real_role || currentUser?.role;
    if (userRole !== 'radio_admin' && userRole !== 'admin') {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/radio');
      if (res.ok) {
        const data = await res.json();
        // Filter stations owned by this user
        let stationsList = [];
        if (userRole === 'admin') {
          stationsList = data;
        } else {
          stationsList = data.filter((s: any) => s.owner_id === currentUser?.id);
        }
        setMyStations(stationsList);
      }
    } catch (e) {
      console.error("Failed to fetch stations for profile:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStationsSilently = async () => {
    const userRole = currentUser?.real_role || currentUser?.role;
    if (userRole !== 'radio_admin' && userRole !== 'admin') {
      return;
    }
    try {
      const res = await fetch('/api/radio');
      if (res.ok) {
        const data = await res.json();
        let stationsList = [];
        if (userRole === 'admin') {
          stationsList = data;
        } else {
          stationsList = data.filter((s: any) => s.owner_id === currentUser?.id);
        }
        setMyStations(stationsList);
      }
    } catch (e) {
      console.error("Failed to silently fetch stations:", e);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [currentUser]);

  // Automatically refresh stations list if any connection key is expired (to trigger auto-regeneration on the backend)
  useEffect(() => {
    const checkExpiry = () => {
      let hasExpiredKey = false;
      myStations.forEach(station => {
        if (station.stream_key) {
          const parts = station.stream_key.split('_');
          if (parts.length >= 4) {
            const timestamp = parseInt(parts[parts.length - 1], 10);
            const now = Math.floor(Date.now() / 1000);
            if (now - timestamp >= 300) { // 5 minutes expiry
              hasExpiredKey = true;
            }
          }
        }
      });
      if (hasExpiredKey) {
        console.log("Detected expired stream key, silently auto-refreshing/regenerating key on server...");
        fetchStationsSilently();
      }
    };

    // Check key expiration every 5 seconds
    const interval = setInterval(checkExpiry, 5000);
    return () => clearInterval(interval);
  }, [myStations]);

  const handleEditClick = (station: any) => {
    setEditingStationId(station.id);
    setFormValues({
      name: station.name || '',
      description: station.description || '',
      stream_url: station.stream_url || '',
      category: station.category || '',
      licence: station.licence || '',
      street_address: station.street_address || '',
      city: station.city || '',
      state_province: station.state_province || '',
      postal_code: station.postal_code || '',
      country: station.country || '',
      phone: station.phone || '',
      email: station.email || '',
      website: station.website || '',
      broadcast_frequency: station.broadcast_frequency || '',
      languages: station.languages || '',
      social_twitter: station.social_twitter || '',
      social_instagram: station.social_instagram || '',
      is_active: station.is_active !== undefined ? station.is_active : true
    });
    setMessage(null);
    setViewMode('edit');
  };

  const handleAddNewClick = () => {
    setEditingStationId(null);
    setFormValues({
      name: '',
      description: '',
      stream_url: '',
      category: '',
      licence: '',
      street_address: '',
      city: '',
      state_province: '',
      postal_code: '',
      country: '',
      phone: '',
      email: '',
      website: '',
      broadcast_frequency: '',
      languages: '',
      social_twitter: '',
      social_instagram: '',
      is_active: true
    });
    setMessage(null);
    setViewMode('add');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.name.trim() || !formValues.description.trim()) {
      setMessage({ type: 'error', text: 'Station Name and Description are required.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);

    const isEdit = viewMode === 'edit';
    const url = isEdit ? `/api/radio/${editingStationId}` : '/api/radio';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(formValues)
      });

      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: isEdit ? 'Station details updated successfully!' : 'Station registered successfully!' 
        });
        await fetchStations();
        if (checkRadioStationStatus) {
          await checkRadioStationStatus();
        }
        // Return to list after a small delay
        setTimeout(() => {
          setViewMode('list');
          setMessage(null);
        }, 1500);
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.detail || 'Request failed.' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisableStation = async (station: any) => {
    const { value: reason } = await Swal.fire({
      title: 'Disable Radio Station',
      text: 'Please enter a reason for disabling this station:',
      input: 'text',
      inputPlaceholder: 'Reason for deactivation...',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#334155',
      background: '#0f172a',
      color: '#fff',
      inputValidator: (value) => {
        if (!value) {
          return 'Deactivation reason is required!';
        }
      }
    });

    if (reason) {
      try {
        const res = await fetch(`/api/radio/${station.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({
            is_active: false,
            disabled_reason: reason
          })
        });
        if (res.ok) {
          await fetchStations();
          Swal.fire({
            icon: 'success',
            title: 'Station Disabled',
            background: '#0f172a',
            color: '#fff',
            confirmButtonColor: '#e11d48'
          });
        } else {
          showError("Failed to disable station");
        }
      } catch {
        showError("Connection failed");
      }
    }
  };

  const handleEnableStation = async (station: any) => {
    const confirmed = await showConfirm(
      'Enable Radio Station',
      `Are you sure you want to reactivate ${station.name}?`,
      'Yes, reactivate'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/radio/${station.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          is_active: true
        })
      });
      if (res.ok) {
        await fetchStations();
      } else {
        showError("Failed to enable station");
      }
    } catch {
      showError("Connection failed");
    }
  };

  const handleRequestReactivation = async (station: any) => {
    const { value: reason } = await Swal.fire({
      title: 'Request Reactivation',
      text: 'Please enter a proper justification/reason for reactivating the station:',
      input: 'textarea',
      inputPlaceholder: 'Reason details...',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#334155',
      background: '#0f172a',
      color: '#fff',
      inputValidator: (value) => {
        if (!value) {
          return 'Reactivation justification is required!';
        }
      }
    });

    if (reason) {
      try {
        const res = await fetch(`/api/radio/${station.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({
            reactivation_reason: reason,
            reactivation_requested: true
          })
        });
        if (res.ok) {
          await fetchStations();
          Swal.fire({
            icon: 'success',
            title: 'Request Submitted',
            text: 'Reactivation request sent successfully to super admins.',
            background: '#0f172a',
            color: '#fff',
            confirmButtonColor: '#e11d48'
          });
        } else {
          showError("Failed to submit request");
        }
      } catch {
        showError("Connection failed");
      }
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

  const handleCopy = (text: string, id: number) => {
    const onSuccess = () => {
      setCopiedKeyMap(prev => ({ ...prev, [id]: true }));
      setTimeout(() => setCopiedKeyMap(prev => ({ ...prev, [id]: false })), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(onSuccess)
        .catch(err => {
          console.warn("Clipboard API failed, trying fallback:", err);
          fallbackCopyText(text, onSuccess);
        });
    } else {
      fallbackCopyText(text, onSuccess);
    }
  };

  const handleRegenerateKey = async (stationId: number) => {
    setIsRegeneratingKey(prev => ({ ...prev, [stationId]: true }));
    try {
      const res = await fetch(`/api/radio/${stationId}/regenerate-key`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        }
      });
      if (res.ok) {
        const updatedStation = await res.json();
        setMyStations(prev => prev.map(s => s.id === stationId ? updatedStation : s));
      } else {
        const err = await res.json();
        showError('Error', err.detail || 'Failed to regenerate key.');
      }
    } catch (e) {
      showError('Error', 'Connection failed.');
    } finally {
      setIsRegeneratingKey(prev => ({ ...prev, [stationId]: false }));
    }
  };

  const filteredStations = myStations.filter((station) => {
    const matchesSearch = station.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (station.category && station.category.toLowerCase().includes(searchQuery.toLowerCase()));
      
    if (statusFilter === 'active') {
      return matchesSearch && station.is_active;
    } else if (statusFilter === 'disabled') {
      return matchesSearch && !station.is_active;
    } else if (statusFilter === 'pending') {
      return matchesSearch && !station.is_active && station.reactivation_requested;
    }
    return matchesSearch;
  });

  return (
    <div className="space-y-8 w-full animate-page-entry font-sans">
      
      {/* Title Header */}
      <div className="flex justify-between items-center">
        <div className="hidden md:block">
          <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Radio className="w-8 h-8 text-rose-455 animate-pulse" /> Station Profiles
          </h2>
        </div>

        {viewMode === 'list' && (
          <button
            onClick={handleAddNewClick}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-bold text-white shadow-lg transition"
          >
            <Plus className="w-4 h-4" /> Add Station
          </button>
        )}

        {viewMode !== 'list' && (
          <button
            onClick={() => { setViewMode('list'); setMessage(null); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Back to List
          </button>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-2xl text-xs font-semibold max-w-2xl shadow-md ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450' 
            : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* 1. LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/10 border border-white/3 p-4 rounded-2xl shadow-inner font-sans text-xs items-center justify-between">
            <div className="flex flex-1 w-full gap-3">
              <input
                type="text"
                placeholder="Search stations by name or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 max-w-md bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition text-xs"
              />
            </div>
            <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-white/5 rounded-xl p-2.5 outline-none focus:border-rose-500 text-slate-205 transition text-xs min-w-[140px] font-sans"
              >
                <option value="all">All Stations</option>
                <option value="active">Active Only</option>
                <option value="disabled">Disabled Only</option>
                <option value="pending">Pending Appeal</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {isLoading ? (
              <p className="text-slate-500 text-xs py-8 col-span-2 text-center font-sans">Loading station profiles...</p>
            ) : myStations.length === 0 ? (
              <div className="glass-card p-12 rounded-3xl border border-white/5 text-center col-span-2 space-y-4">
                <Info className="w-12 h-12 text-rose-400/50 mx-auto" />
                <h3 className="text-sm font-bold text-slate-200">No Stations Registered</h3>
                <p className="text-xs text-slate-555 max-w-sm mx-auto leading-relaxed">
                  You have not registered any live radio stations yet. Register your first station node to start broadcasting.
                </p>
                <button 
                  onClick={handleAddNewClick}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                >
                  Register First Station
                </button>
              </div>
            ) : filteredStations.length === 0 ? (
              <div className="glass-card p-12 rounded-3xl border border-white/5 text-center col-span-2 space-y-4">
                <Info className="w-12 h-12 text-rose-400/50 mx-auto" />
                <h3 className="text-sm font-bold text-slate-200">No Match Found</h3>
                <p className="text-xs text-slate-555 max-w-sm mx-auto leading-relaxed">
                  No registered stations match your current search query or status filter criteria.
                </p>
              </div>
            ) : (
              filteredStations.map((station) => (
                <div 
                  key={station.id}
                className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 hover:border-rose-500/20 transition duration-300 relative group overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-rose-600/5 rounded-full blur-2xl pointer-events-none group-hover:bg-rose-600/10 transition-all duration-700" />
                
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-rose-500/10 border border-rose-500/20 rounded-full text-[9px] text-rose-400 font-extrabold uppercase tracking-wide">
                      {station.broadcast_frequency || 'Web Station'}
                    </span>
                    <h3 className="text-lg font-extrabold text-white tracking-tight">{station.name}</h3>
                    <p className="text-xs text-slate-450 line-clamp-2 leading-relaxed">{station.description}</p>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2 py-0.5 border rounded-full text-[9px] font-extrabold uppercase tracking-wide ${
                      station.is_active 
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450' 
                        : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                    }`}>
                      {station.is_active ? 'Active' : 'Disabled'}
                    </span>
                    <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-white/5">
                      <Radio className="w-5 h-5 text-rose-455" />
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3 grid grid-cols-2 gap-3 text-[10px] text-slate-400">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{station.city ? `${station.city}, ${station.country || ''}` : 'No address set'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Globe className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                    <span className="truncate">{station.category || 'General Broadcast'}</span>
                  </div>
                </div>

                {/* Disabled Warning/Appeals Box */}
                {(!station.is_active || station.reactivation_requested) && (
                  <div className={`p-3.5 rounded-2xl border text-xs font-sans space-y-2 ${
                    station.reactivation_requested
                      ? 'bg-amber-500/5 border-amber-500/15 text-amber-400'
                      : 'bg-rose-500/5 border-rose-500/15 text-rose-400'
                  }`}>
                    <div className="font-extrabold flex items-center gap-1.5 uppercase text-[9px] tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                      {station.reactivation_requested 
                        ? 'Reactivation Review Pending' 
                        : 'Station is Disabled'}
                    </div>
                    {station.disabled_reason && (
                      <div>
                        <span className="font-extrabold uppercase text-[8px] text-slate-500 block">Deactivation Reason</span>
                        <span className="text-[10px] text-slate-300 leading-normal block">{station.disabled_reason}</span>
                      </div>
                    )}
                    {station.reactivation_reason && (
                      <div className="pt-1 border-t border-white/5">
                        <span className="font-extrabold uppercase text-[8px] text-slate-500 block">Reactivation Appeal Reason</span>
                        <span className="text-[10px] text-slate-300 leading-normal block">{station.reactivation_reason}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {(station.is_active || isSuperAdmin) && (
                    <button
                      onClick={() => handleEditClick(station)}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-[10px] font-bold text-slate-350 hover:text-white uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  )}
                  {!isSuperAdmin && !station.is_active && !station.reactivation_requested && (
                    <button
                      type="button"
                      onClick={() => handleRequestReactivation(station)}
                      className="w-full py-2.5 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-500/25 text-amber-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                    >
                      Request Reactivation
                    </button>
                  )}
                  {currentUser && (currentUser.real_role || currentUser.role) !== 'admin' && station.is_active && (
                    <button
                      onClick={() => setShowCredentialsMap(prev => ({ ...prev, [station.id]: !prev[station.id] }))}
                      className={`flex-1 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer border ${
                        showCredentialsMap[station.id] 
                          ? 'bg-rose-500/10 border-rose-500/25 text-rose-400' 
                          : 'bg-slate-900 hover:bg-slate-800 border-white/5 text-slate-300'
                      }`}
                    >
                      <Wifi className="w-3.5 h-3.5" /> Connection Settings
                    </button>
                  )}
                </div>

                {/* Connection Settings Expandable Panel */}
                {currentUser && (currentUser.real_role || currentUser.role) !== 'admin' && showCredentialsMap[station.id] && (
                  <div className="border-t border-white/5 pt-4 mt-3 space-y-4 animate-slide-down font-sans">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-rose-400 uppercase tracking-widest block">Stream Ingestion Node</h4>
                      <p className="text-[11px] text-slate-405 leading-normal">
                        Copy your personal stream key into your PyQt5 desktop broadcaster application or encoder to stream live.
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      {/* Stream Key */}
                      <div className="space-y-1">
                        <label className="text-[9.5px] font-bold text-slate-555 uppercase block">Stream Key</label>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            value={station.stream_key || ''} 
                            readOnly 
                            className="w-full bg-slate-950 border border-white/5 text-[10px] p-2.5 rounded-xl text-white font-mono font-semibold outline-none tracking-wider"
                          />
                          <button
                            type="button"
                            onClick={() => handleCopy(station.stream_key || '', station.id)}
                            className="px-3 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-405 hover:text-white rounded-xl transition cursor-pointer font-bold text-[10px]"
                          >
                            {copiedKeyMap[station.id] ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      {/* Regenerate Button */}
                      <button
                        type="button"
                        disabled={isRegeneratingKey[station.id]}
                        onClick={() => handleRegenerateKey(station.id)}
                        className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-rose-455 font-bold border border-rose-500/10 hover:border-rose-500/30 rounded-xl transition text-[10px] uppercase tracking-wider"
                      >
                        {isRegeneratingKey[station.id] ? 'Regenerating...' : 'Regenerate Stream Key'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          </div>
        </div>
      )}

      {/* 2. ADD / EDIT FORM VIEW */}
      {viewMode !== 'list' && (
        <form onSubmit={handleSubmit} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
          <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans pt-1">
            <Settings className="w-4.5 h-4.5" /> 
            {viewMode === 'edit' ? 'Update Radio Station Details' : 'Register New Station Node'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            
            {/* Left Column */}
            <div className="space-y-8">
              
              {/* Core Info */}
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  Core Info
                </h3>
                <div className="grid grid-cols-1 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Station Name *</label>
                    <input
                      type="text"
                      name="name"
                      placeholder="e.g. Echo FM"
                      value={formValues.name}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Description *</label>
                    <textarea
                      name="description"
                      placeholder="e.g. Premium lossless continuous stream from Berlin"
                      value={formValues.description}
                      onChange={handleInputChange}
                      rows={2}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition resize-none"
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Category</label>
                      <input
                        type="text"
                        name="category"
                        placeholder="e.g. Ambient, Pop"
                        value={formValues.category}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Frequency</label>
                      <input
                        type="text"
                        name="broadcast_frequency"
                        placeholder="e.g. 98.1 FM, Web Only"
                        value={formValues.broadcast_frequency}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Languages</label>
                      <input
                        type="text"
                        name="languages"
                        placeholder="e.g. English, German"
                        value={formValues.languages}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Licence info</label>
                      <input
                        type="text"
                        name="licence"
                        placeholder="Licence identification"
                        value={formValues.licence}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                      />
                    </div>
                  </div>
                  {viewMode === 'add' && (
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Stream URL (Optional)</label>
                      <input
                        type="text"
                        name="stream_url"
                        placeholder="e.g. https://domain.com/live"
                        value={formValues.stream_url}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Location details */}
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  Location Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Street Address</label>
                    <input
                      type="text"
                      name="street_address"
                      placeholder="Street Address"
                      value={formValues.street_address}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">City</label>
                    <input
                      type="text"
                      name="city"
                      placeholder="City"
                      value={formValues.city}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">State / Province</label>
                    <input
                      type="text"
                      name="state_province"
                      placeholder="State / Province"
                      value={formValues.state_province}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Postal Code</label>
                    <input
                      type="text"
                      name="postal_code"
                      placeholder="Postal Code"
                      value={formValues.postal_code}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Country</label>
                    <input
                      type="text"
                      name="country"
                      placeholder="Country"
                      value={formValues.country}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column */}
            <div className="space-y-8">
              
              {/* Contact Details */}
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  Contact & Socials
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Phone Number</label>
                    <input
                      type="text"
                      name="phone"
                      placeholder="Phone"
                      value={formValues.phone}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="Email"
                      value={formValues.email}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Website</label>
                    <input
                      type="text"
                      name="website"
                      placeholder="Website URL"
                      value={formValues.website}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Twitter</label>
                    <input
                      type="text"
                      name="social_twitter"
                      placeholder="@handle"
                      value={formValues.social_twitter}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Instagram</label>
                    <input
                      type="text"
                      name="social_instagram"
                      placeholder="@handle"
                      value={formValues.social_instagram}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => { setViewMode('list'); setMessage(null); }}
              className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
            >
              Cancel
            </button>

            {/* Super Admin Disable/Enable inside Edit Page */}
            {viewMode === 'edit' && isSuperAdmin && (
              formValues.is_active ? (
                <button
                  type="button"
                  onClick={async () => {
                    const currentStation = myStations.find(s => s.id === editingStationId);
                    if (currentStation) {
                      await handleDisableStation(currentStation);
                      setFormValues(prev => ({ ...prev, is_active: false }));
                    }
                  }}
                  className="px-8 py-3.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-400 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
                >
                  Disable Station
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const currentStation = myStations.find(s => s.id === editingStationId);
                    if (currentStation) {
                      await handleEnableStation(currentStation);
                      setFormValues(prev => ({ ...prev, is_active: true }));
                    }
                  }}
                  className="px-8 py-3.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-450 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
                >
                  Enable Station
                </button>
              )
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
            >
              {isSaving 
                ? 'Saving Details...' 
                : viewMode === 'edit' ? 'Save Station Details' : 'Register Station Node'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default StationProfile;
