import React, { useState, useEffect } from 'react';
import { Plus, Edit2, ArrowLeft, Radio, Info, MapPin, Globe, Wifi, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showError, showSuccess } from '../utils/swal';
import { fetchBroadcastKey } from '../utils/authTokens';
import Swal from 'sweetalert2';
import { CardGridSkeleton } from '../components/shared/skeleton';
import { LicenceDocumentUpload } from '../components/shared/LicenceDocumentUpload';
import { CoverImageUpload } from '../components/shared/CoverImageUpload';
import { ListSearchInput } from '../components/shared/ListSearchInput';
import {
  FREQUENCY_BANDS,
  BAND_RANGES,
  formatBroadcastFrequency,
  isFrequencyBand,
  validateBroadcastFrequency,
} from '../utils/broadcastFrequency';

const fieldClass =
  'w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition text-xs disabled:opacity-50 disabled:cursor-not-allowed';
const labelClass = 'font-bold text-slate-400 uppercase tracking-wider block text-xs mb-1.5';

interface StationProfileProps {
  onNavigate?: (tab: string) => void;
}

export const StationProfile: React.FC<StationProfileProps> = ({ onNavigate }) => {
  const { currentUser, token, checkRadioStationStatus } = useAuth();
  const userRole = currentUser?.real_role || currentUser?.role;
  const [myStations, setMyStations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'edit' | 'add'>('list');
  const [editingStationId, setEditingStationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'pending'>('all');
  
  // Credentials & Settings Subsections per Station Card
  const [showCredentialsMap, setShowCredentialsMap] = useState<Record<number, boolean>>({});
  const [broadcastKeyMap, setBroadcastKeyMap] = useState<Record<number, string>>({});
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
    frequency_band: '',
    broadcast_frequency: '',
    languages: '',
    social_twitter: '',
    social_instagram: '',
    is_active: true
  });

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [licenceDocumentUrl, setLicenceDocumentUrl] = useState<string | null>(null);
  const [coverArtUrl, setCoverArtUrl] = useState<string | null>(null);

  const fetchStations = async () => {
    setIsLoading(true);
    const userRole = currentUser?.real_role || currentUser?.role;
    if (userRole !== 'radio_admin') {
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/radio');
      if (res.ok) {
        const data = await res.json();
        setMyStations(data.filter((s: any) => s.owner_id === currentUser?.id));
      }
    } catch (e) {
      console.error("Failed to fetch stations for profile:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStationsSilently = async () => {
    const userRole = currentUser?.real_role || currentUser?.role;
    if (userRole !== 'radio_admin') {
      return;
    }
    try {
      const res = await fetch('/api/radio');
      if (res.ok) {
        const data = await res.json();
        setMyStations(data.filter((s: any) => s.owner_id === currentUser?.id));
      }
    } catch (e) {
      console.error("Failed to silently fetch stations:", e);
    }
  };

  useEffect(() => {
    fetchStations();
  }, [currentUser]);

  // Stream keys are fetched on demand via /broadcast-key when credentials are opened.

  const toggleCredentials = async (stationId: number) => {
    const willOpen = !showCredentialsMap[stationId];
    setShowCredentialsMap(prev => ({ ...prev, [stationId]: willOpen }));
    if (willOpen && !broadcastKeyMap[stationId]) {
      const key = await fetchBroadcastKey(stationId);
      if (key) {
        setBroadcastKeyMap(prev => ({ ...prev, [stationId]: key }));
      }
    }
  };

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
      frequency_band: station.frequency_band || '',
      broadcast_frequency: station.broadcast_frequency || '',
      languages: station.languages || '',
      social_twitter: station.social_twitter || '',
      social_instagram: station.social_instagram || '',
      is_active: station.is_active !== undefined ? station.is_active : true
    });
    setMessage(null);
    setLicenceDocumentUrl(station.licence_document_url || null);
    setCoverArtUrl(station.cover_art_url || null);
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
      frequency_band: '',
      broadcast_frequency: '',
      languages: '',
      social_twitter: '',
      social_instagram: '',
      is_active: true
    });
    setMessage(null);
    setLicenceDocumentUrl(null);
    setCoverArtUrl(null);
    setViewMode('add');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'frequency_band' && !value) {
        next.broadcast_frequency = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.name.trim() || !formValues.description.trim()) {
      setMessage({ type: 'error', text: 'Station Name and Description are required.' });
      return;
    }
    const frequencyError = validateBroadcastFrequency(
      formValues.frequency_band,
      formValues.broadcast_frequency,
    );
    if (frequencyError) {
      setMessage({ type: 'error', text: frequencyError });
      return;
    }
    setIsSaving(true);
    setMessage(null);

    const isEdit = viewMode === 'edit';
    const url = isEdit ? `/api/radio/${editingStationId}` : '/api/radio';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      // Radio admins cannot set is_active / disable fields — strip them from the payload.
      const { is_active: _isActive, ...profilePayload } = formValues;
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify(profilePayload)
      });

      if (res.ok) {
        await fetchStations();
        if (checkRadioStationStatus) {
          await checkRadioStationStatus();
        }
        onNavigate?.('radio');
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
            'Authorization': `Bearer ${token || ''}`
          },
          body: JSON.stringify({
            reactivation_reason: reason,
            reactivation_requested: true
          })
        });
        if (res.ok) {
          await fetchStations();
          showSuccess(
            'Request Submitted',
            'Reactivation request sent successfully to super admins.',
          );
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
          'Authorization': `Bearer ${token || ''}`
        }
      });
      if (res.ok) {
        const updatedStation = await res.json();
        setMyStations(prev => prev.map(s => s.id === stationId ? updatedStation : s));
        const key = await fetchBroadcastKey(stationId);
        if (key) {
          setBroadcastKeyMap(prev => ({ ...prev, [stationId]: key }));
        }
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
            <div className="flex w-full gap-3">
              <ListSearchInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search stations by name or category..."
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
              <CardGridSkeleton count={2} />
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
                      {formatBroadcastFrequency(station.frequency_band, station.broadcast_frequency)}
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
                  {station.is_active && (
                    <button
                      onClick={() => handleEditClick(station)}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-[10px] font-bold text-slate-350 hover:text-white uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                    </button>
                  )}
                  {!station.is_active && !station.reactivation_requested && (
                    <button
                      type="button"
                      onClick={() => handleRequestReactivation(station)}
                      className="w-full py-2.5 bg-amber-950/20 hover:bg-amber-900/30 border border-amber-500/25 text-amber-400 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                    >
                      Request Reactivation
                    </button>
                  )}
                  {station.is_active && (
                    <button
                      onClick={() => toggleCredentials(station.id)}
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
                {showCredentialsMap[station.id] && (
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
                            value={broadcastKeyMap[station.id] || ''} 
                            readOnly 
                            className="w-full bg-slate-950 border border-white/5 text-[10px] p-2.5 rounded-xl text-white font-mono font-semibold outline-none tracking-wider"
                          />
                          <button
                            type="button"
                            onClick={() => handleCopy(broadcastKeyMap[station.id] || '', station.id)}
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
        <form onSubmit={handleSubmit} className="bg-slate-900/10 border border-white/5 p-6 rounded-3xl shadow-inner space-y-6 max-w-5xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 flex-wrap">
              <Settings className="w-4 h-4" />
              {viewMode === 'edit' ? 'Update Station Details' : 'Register Station'}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] font-bold text-rose-300 normal-case tracking-normal tabular-nums">
                {formatBroadcastFrequency(formValues.frequency_band, formValues.broadcast_frequency)}
              </span>
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => { setViewMode('list'); setMessage(null); }}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white font-bold text-xs rounded-xl transition uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition uppercase tracking-wider cursor-pointer"
              >
                {isSaving ? 'Saving...' : viewMode === 'edit' ? 'Save Details' : 'Register Station'}
              </button>
            </div>
          </div>

          {/* Core: cover + identity + on-air */}
          <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-5 shadow-xl">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Station Profile</h3>

            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <CoverImageUpload
                uploadUrl={
                  viewMode === 'edit' && editingStationId
                    ? `/api/radio/${editingStationId}/cover`
                    : undefined
                }
                coverUrl={coverArtUrl}
                token={token}
                disabled={viewMode !== 'edit' || !editingStationId}
                className="w-28 h-28 sm:w-32 sm:h-32"
                onUploaded={setCoverArtUrl}
              />
              <div className="flex-1 w-full min-w-0 space-y-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Station Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formValues.name}
                    onChange={handleInputChange}
                    className={fieldClass}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Description *</label>
                  <textarea
                    name="description"
                    value={formValues.description}
                    onChange={handleInputChange}
                    rows={2}
                    className={`${fieldClass} resize-none`}
                    required
                  />
                </div>
                {viewMode === 'add' && (
                  <p className="text-[10px] text-slate-500">
                    Cover art can be uploaded after the station is registered.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 border-t border-white/5">
              <div className="space-y-1.5">
                <label className={labelClass}>Band</label>
                <select
                  name="frequency_band"
                  value={formValues.frequency_band}
                  onChange={handleInputChange}
                  className={fieldClass}
                >
                  <option value="">Web</option>
                  {FREQUENCY_BANDS.map((band) => (
                    <option key={band} value={band}>{band}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>
                  Frequency
                  {isFrequencyBand(formValues.frequency_band)
                    ? ` (${BAND_RANGES[formValues.frequency_band].unit})`
                    : ''}
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  name="broadcast_frequency"
                  value={formValues.broadcast_frequency}
                  onChange={handleInputChange}
                  placeholder={
                    isFrequencyBand(formValues.frequency_band)
                      ? `${BAND_RANGES[formValues.frequency_band].min}–${BAND_RANGES[formValues.frequency_band].max}`
                      : '—'
                  }
                  disabled={!formValues.frequency_band}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Category</label>
                <input
                  type="text"
                  name="category"
                  value={formValues.category}
                  onChange={handleInputChange}
                  placeholder="e.g. Pop, News"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Languages</label>
                <input
                  type="text"
                  name="languages"
                  value={formValues.languages}
                  onChange={handleInputChange}
                  placeholder="e.g. English"
                  className={fieldClass}
                />
              </div>
            </div>

            {viewMode === 'add' && (
              <div className="space-y-1.5">
                <label className={labelClass}>Stream URL</label>
                <input
                  type="text"
                  name="stream_url"
                  value={formValues.stream_url}
                  onChange={handleInputChange}
                  placeholder="Optional stream URL"
                  className={fieldClass}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="space-y-6">
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Location Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className={labelClass}>Street Address</label>
                    <input type="text" name="street_address" value={formValues.street_address} onChange={handleInputChange} className={fieldClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>City</label>
                    <input type="text" name="city" value={formValues.city} onChange={handleInputChange} className={fieldClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>State</label>
                    <input type="text" name="state_province" value={formValues.state_province} onChange={handleInputChange} className={fieldClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Postal</label>
                    <input type="text" name="postal_code" value={formValues.postal_code} onChange={handleInputChange} className={fieldClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Country</label>
                    <input type="text" name="country" value={formValues.country} onChange={handleInputChange} className={fieldClass} />
                  </div>
                </div>
              </div>

              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Licence</h3>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Licence Info</label>
                    <input
                      type="text"
                      name="licence"
                      value={formValues.licence}
                      onChange={handleInputChange}
                      placeholder="Licence / permit number"
                      className={fieldClass}
                    />
                  </div>
                  {viewMode === 'edit' && editingStationId ? (
                    <LicenceDocumentUpload
                      uploadUrl={`/api/radio/${editingStationId}/licence-document`}
                      documentUrl={licenceDocumentUrl}
                      token={token}
                      onUploaded={setLicenceDocumentUrl}
                    />
                  ) : (
                    <p className="text-[10px] text-slate-500">
                      Document upload is available after registration.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Contact & Socials</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>Phone</label>
                  <input type="text" name="phone" value={formValues.phone} onChange={handleInputChange} className={fieldClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Email</label>
                  <input type="email" name="email" value={formValues.email} onChange={handleInputChange} className={fieldClass} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Website</label>
                  <input type="text" name="website" value={formValues.website} onChange={handleInputChange} className={fieldClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Twitter</label>
                  <input type="text" name="social_twitter" value={formValues.social_twitter} onChange={handleInputChange} className={fieldClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Instagram</label>
                  <input type="text" name="social_instagram" value={formValues.social_instagram} onChange={handleInputChange} className={fieldClass} />
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

export default StationProfile;
