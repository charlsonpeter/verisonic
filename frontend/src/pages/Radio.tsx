import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Radio as RadioIcon, RadioIcon as LiveIcon, Plus, Info, RefreshCw, Sparkles, Download, Eye, EyeOff, Copy, Check, Edit2, Save, X, Play, Pause, Users, Headphones, Calendar } from 'lucide-react';
import { useAudio, RadioStation } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { RadioCard } from '../components/shared/RadioCard';
import { showError, showConfirm } from '../utils/swal';

const API_URL = '/api';

export const Radio: React.FC = () => {
  const { playRadioStation, activeRadioStation } = useAudio();
  const { token, currentUser, checkRadioStationStatus } = useAuth();
  
  // Radio states
  const [stations, setStations] = useState<RadioStation[]>([]);
  
  // Creation state
  const [newStationName, setNewStationName] = useState('');
  const [newStationDesc, setNewStationDesc] = useState('');
  const [newStationStreamUrl, setNewStationStreamUrl] = useState('');
  const [newStationCategory, setNewStationCategory] = useState('');
  const [newStationLicence, setNewStationLicence] = useState('');
  const [newStationStreetAddress, setNewStationStreetAddress] = useState('');
  const [newStationCity, setNewStationCity] = useState('');
  const [newStationStateProvince, setNewStationStateProvince] = useState('');
  const [newStationPostalCode, setNewStationPostalCode] = useState('');
  const [newStationCountry, setNewStationCountry] = useState('');
  const [newStationPhone, setNewStationPhone] = useState('');
  const [newStationEmail, setNewStationEmail] = useState('');
  const [newStationWebsite, setNewStationWebsite] = useState('');
  const [newStationBroadcastFrequency, setNewStationBroadcastFrequency] = useState('');
  const [newStationLanguages, setNewStationLanguages] = useState('');
  const [newStationSocialTwitter, setNewStationSocialTwitter] = useState('');
  const [newStationSocialInstagram, setNewStationSocialInstagram] = useState('');

  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showKeyMap, setShowKeyMap] = useState<Record<number, boolean>>({});
  const [isRegeneratingKey, setIsRegeneratingKey] = useState<Record<number, boolean>>({});
  const [copiedKeyMap, setCopiedKeyMap] = useState<Record<number, boolean>>({});

  // Program and RJ metadata editing states
  interface ProgramDetail {
    title: string;
    rj: string;
    timeFrom: string;
    timeTo: string;
  }

  const getTimezoneOffsetMs = (timeZone: string, date = new Date()): number => {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric"
      });
      const parts = formatter.format(date);
      const match = parts.match(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/);
      if (!match) return 0;
      const [_, month, day, year, hour, minute, second] = match.map(Number);
      const tzUtcVal = Date.UTC(year, month - 1, day, hour, minute, second);
      return Math.round((tzUtcVal - date.getTime()) / 60000) * 60000;
    } catch (e) {
      console.error("Failed to get timezone offset:", e);
      return 0;
    }
  };

  const convertStationTimeToUtc = (timeStr: string, timeZone: string): string => {
    if (!timeStr) return '00:00';
    if (!timeZone || timeZone === 'UTC') return timeStr;
    try {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const now = new Date();
      const offsetMs = getTimezoneOffsetMs(timeZone, now);
      
      const baseUtc = Date.UTC(2026, 0, 1, hours, minutes, 0, 0);
      const realUtcDate = new Date(baseUtc - offsetMs);
      
      const utcHours = String(realUtcDate.getUTCHours()).padStart(2, '0');
      const utcMinutes = String(realUtcDate.getUTCMinutes()).padStart(2, '0');
      return `${utcHours}:${utcMinutes}`;
    } catch (e) {
      return timeStr;
    }
  };

  const convertUtcToStationTime = (utcTimeStr: string, timeZone: string): string => {
    if (!utcTimeStr) return '00:00';
    if (!timeZone || timeZone === 'UTC') return utcTimeStr;
    try {
      const [hours, minutes] = utcTimeStr.split(':').map(Number);
      const now = new Date();
      const offsetMs = getTimezoneOffsetMs(timeZone, now);
      
      const baseUtc = Date.UTC(2026, 0, 1, hours, minutes, 0, 0);
      const localDate = new Date(baseUtc + offsetMs);
      
      const hh = String(localDate.getUTCHours()).padStart(2, '0');
      const mm = String(localDate.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch (e) {
      return utcTimeStr;
    }
  };

  const utcTimeToLocalTime = (utcTimeStr: string): string => {
    if (!utcTimeStr) return '00:00';
    try {
      const [utcHours, utcMinutes] = utcTimeStr.split(':').map(Number);
      const date = new Date();
      date.setUTCHours(utcHours, utcMinutes, 0, 0);
      const localHours = String(date.getHours()).padStart(2, '0');
      const localMinutes = String(date.getMinutes()).padStart(2, '0');
      return `${localHours}:${localMinutes}`;
    } catch (e) {
      return utcTimeStr;
    }
  };

  const getActiveProgram = (programs: ProgramDetail[], timeZone: string) => {
    if (!programs || programs.length === 0) return null;
    
    let currentMinutes = 0;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        hour: "numeric",
        minute: "numeric"
      });
      const parts = formatter.format(new Date());
      const [h, m] = parts.split(':').map(Number);
      currentMinutes = h * 60 + m;
    } catch (e) {
      const now = new Date();
      currentMinutes = now.getHours() * 60 + now.getMinutes();
    }
    
    for (const prog of programs) {
      if (!prog.timeFrom || !prog.timeTo) continue;
      try {
        const [fromH, fromM] = prog.timeFrom.split(':').map(Number);
        const [toH, toM] = prog.timeTo.split(':').map(Number);
        const fromMinutes = fromH * 60 + fromM;
        const toMinutes = toH * 60 + toM;
        
        if (toMinutes > fromMinutes) {
          if (currentMinutes >= fromMinutes && currentMinutes <= toMinutes) {
            return prog;
          }
        } else {
          if (currentMinutes >= fromMinutes || currentMinutes <= toMinutes) {
            return prog;
          }
        }
      } catch (e) {
        continue;
      }
    }
    return programs[0];
  };

  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editProgramTitle, setEditProgramTitle] = useState('');
  const [editRjName, setEditRjName] = useState('');
  const [editRjDetails, setEditRjDetails] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editLicence, setEditLicence] = useState('');
  const [editStreetAddress, setEditStreetAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editStateProvince, setEditStateProvince] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editBroadcastFrequency, setEditBroadcastFrequency] = useState('');
  const [editLanguages, setEditLanguages] = useState('');
  const [editSocialTwitter, setEditSocialTwitter] = useState('');
  const [editSocialInstagram, setEditSocialInstagram] = useState('');
  const [editPrograms, setEditPrograms] = useState<ProgramDetail[]>([]);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  const startEditingMetadata = (st: any) => {
    setEditProgramTitle(st.current_program_title || '');
    setEditRjName(st.rj_name || '');
    setEditRjDetails(st.rj_details || '');
    setEditCategory(st.category || '');
    setEditLicence(st.licence || '');
    setEditStreetAddress(st.street_address || '');
    setEditCity(st.city || '');
    setEditStateProvince(st.state_province || '');
    setEditPostalCode(st.postal_code || '');
    setEditCountry(st.country || '');
    setEditPhone(st.phone || '');
    setEditEmail(st.email || '');
    setEditWebsite(st.website || '');
    setEditBroadcastFrequency(st.broadcast_frequency || '');
    setEditLanguages(st.languages || '');
    setEditSocialTwitter(st.social_twitter || '');
    setEditSocialInstagram(st.social_instagram || '');
    let initialPrograms: ProgramDetail[] = [];
    if (st.programs_list) {
      try {
        const parsed = JSON.parse(st.programs_list);
        if (Array.isArray(parsed)) {
          initialPrograms = parsed.map((p: any) => ({
            title: p.title || '',
            rj: p.rj || '',
            timeFrom: convertUtcToStationTime(p.timeFrom, st.timezone),
            timeTo: convertUtcToStationTime(p.timeTo, st.timezone)
          }));
        }
      } catch (e) {
        console.warn("Failed to parse programs_list:", e);
      }
    }
    if (initialPrograms.length === 0) {
      initialPrograms = [{
        title: st.current_program_title || '',
        rj: st.rj_name || '',
        timeFrom: '09:00',
        timeTo: '17:00'
      }];
    }
    setEditPrograms(initialPrograms);
    setIsEditingMetadata(true);
  };

  const handleSaveMetadata = async (stationId: number) => {
    setIsSavingMetadata(true);
    try {
      const station = stations.find(s => s.id === stationId);
      const stationTimezone = station?.timezone || 'UTC';

      const activeProg = getActiveProgram(editPrograms, stationTimezone);
      const utcPrograms = editPrograms.map(p => ({
        title: p.title,
        rj: p.rj,
        timeFrom: convertStationTimeToUtc(p.timeFrom, stationTimezone),
        timeTo: convertStationTimeToUtc(p.timeTo, stationTimezone)
      }));

      const res = await fetch(`${API_URL}/radio/${stationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_program_title: activeProg?.title || '',
          rj_name: activeProg?.rj || '',
          rj_details: editRjDetails,
          category: editCategory,
          licence: editLicence,
          street_address: editStreetAddress,
          city: editCity,
          state_province: editStateProvince,
          postal_code: editPostalCode,
          country: editCountry,
          phone: editPhone,
          email: editEmail,
          website: editWebsite,
          broadcast_frequency: editBroadcastFrequency,
          languages: editLanguages,
          social_twitter: editSocialTwitter,
          social_instagram: editSocialInstagram,
          programs_list: JSON.stringify(utcPrograms)
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
      if (!successful) {
        console.error("Fallback copy failed");
      }
    } catch (err) {
      console.error("Fallback copy threw exception:", err);
    }
    document.body.removeChild(textArea);
    onSuccess();
  };

  const handleCopyKey = (stationId: number, key: string) => {
    const onSuccess = () => {
      setCopiedKeyMap(prev => ({ ...prev, [stationId]: true }));
      setTimeout(() => {
        setCopiedKeyMap(prev => ({ ...prev, [stationId]: false }));
      }, 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(key)
        .then(onSuccess)
        .catch(err => {
          console.warn("Clipboard API failed, trying fallback:", err);
          fallbackCopyText(key, onSuccess);
        });
    } else {
      fallbackCopyText(key, onSuccess);
    }
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

  useEffect(() => {
    if (isEditingMetadata) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isEditingMetadata]);


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
          stream_url: newStationStreamUrl || null,
          category: newStationCategory || null,
          licence: newStationLicence || null,
          street_address: newStationStreetAddress || null,
          city: newStationCity || null,
          state_province: newStationStateProvince || null,
          postal_code: newStationPostalCode || null,
          country: newStationCountry || null,
          phone: newStationPhone || null,
          email: newStationEmail || null,
          website: newStationWebsite || null,
          broadcast_frequency: newStationBroadcastFrequency || null,
          languages: newStationLanguages || null,
          social_twitter: newStationSocialTwitter || null,
          social_instagram: newStationSocialInstagram || null
        })
      });
      if (res.ok) {
        setNewStationName('');
        setNewStationDesc('');
        setNewStationStreamUrl('');
        setNewStationCategory('');
        setNewStationLicence('');
        setNewStationStreetAddress('');
        setNewStationCity('');
        setNewStationStateProvince('');
        setNewStationPostalCode('');
        setNewStationCountry('');
        setNewStationPhone('');
        setNewStationEmail('');
        setNewStationWebsite('');
        setNewStationBroadcastFrequency('');
        setNewStationLanguages('');
        setNewStationSocialTwitter('');
        setNewStationSocialInstagram('');
        fetchRadioStations();
        if (checkRadioStationStatus) {
          await checkRadioStationStatus();
        }
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
        category: newStationCategory || undefined,
        licence: newStationLicence || undefined,
        street_address: newStationStreetAddress || undefined,
        city: newStationCity || undefined,
        state_province: newStationStateProvince || undefined,
        postal_code: newStationPostalCode || undefined,
        country: newStationCountry || undefined,
        phone: newStationPhone || undefined,
        email: newStationEmail || undefined,
        website: newStationWebsite || undefined,
        broadcast_frequency: newStationBroadcastFrequency || undefined,
        languages: newStationLanguages || undefined,
        social_twitter: newStationSocialTwitter || undefined,
        social_instagram: newStationSocialInstagram || undefined
      };
      setStations([...stations, newSt]);
      setNewStationName('');
      setNewStationDesc('');
      setNewStationStreamUrl('');
      setNewStationCategory('');
      setNewStationLicence('');
      setNewStationStreetAddress('');
      setNewStationCity('');
      setNewStationStateProvince('');
      setNewStationPostalCode('');
      setNewStationCountry('');
      setNewStationPhone('');
      setNewStationEmail('');
      setNewStationWebsite('');
      setNewStationBroadcastFrequency('');
      setNewStationLanguages('');
      setNewStationSocialTwitter('');
      setNewStationSocialInstagram('');
      if (checkRadioStationStatus) {
        checkRadioStationStatus();
      }
    } finally {
      setIsCreating(false);
    }
  };

  const myStation = stations.find(s => s.owner_id === currentUser?.id);
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
        <div className="flex items-center gap-3">
          {currentUser?.role === 'radio_admin' && myStation && !isEditingMetadata && (
            <button
              onClick={() => startEditingMetadata(myStation)}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-slate-400 hover:text-white transition"
              title="Programs"
            >
              <Calendar className="w-4 h-4 text-rose-400" />
            </button>
          )}
          <button 
            onClick={fetchRadioStations} 
            disabled={isLoading}
            className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-slate-400 hover:text-white transition"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
          </button>
        </div>
      </div>



      {/* Radio Admin Setup and Dashboard Widgets */}
      {currentUser && (
        <>
          {/* Case 1: User is Radio Admin and does NOT have a station yet -> show Registration Form */}
          {currentUser.role === 'radio_admin' && !hasStation && (
            <div className="max-w-4xl animate-fade-in">
              <form onSubmit={handleCreateStation} className="glass-card p-6 rounded-3xl space-y-4 border border-rose-500/10 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-rose-455 uppercase tracking-widest flex items-center gap-1 mb-4 font-sans">
                    <Plus className="w-4 h-4" /> Register Your Live Radio Station Node
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Section 1: Core Station Info */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest border-b border-white/5 pb-1 font-sans">Core Info</h4>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Station Name *</label>
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
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Description *</label>
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
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Category</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Chillout, Pop, Classical" 
                          value={newStationCategory}
                          onChange={(e) => setNewStationCategory(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Licence</label>
                        <input 
                          type="text" 
                          placeholder="License/Permit number" 
                          value={newStationLicence}
                          onChange={(e) => setNewStationLicence(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Frequency</label>
                        <input 
                          type="text" 
                          placeholder="e.g. 98.1 FM, Web Only" 
                          value={newStationBroadcastFrequency}
                          onChange={(e) => setNewStationBroadcastFrequency(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Languages</label>
                        <input 
                          type="text" 
                          placeholder="e.g. English, Spanish" 
                          value={newStationLanguages}
                          onChange={(e) => setNewStationLanguages(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Stream URL (Optional)</label>
                        <input 
                          type="text" 
                          placeholder="Stream URL (Optional)" 
                          value={newStationStreamUrl}
                          onChange={(e) => setNewStationStreamUrl(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                    </div>

                    {/* Section 2: Address Details */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest border-b border-white/5 pb-1 font-sans">Location Details</h4>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Street Address</label>
                        <input 
                          type="text" 
                          placeholder="Street Address" 
                          value={newStationStreetAddress}
                          onChange={(e) => setNewStationStreetAddress(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">City</label>
                        <input 
                          type="text" 
                          placeholder="City" 
                          value={newStationCity}
                          onChange={(e) => setNewStationCity(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">State/Province</label>
                        <input 
                          type="text" 
                          placeholder="State/Province" 
                          value={newStationStateProvince}
                          onChange={(e) => setNewStationStateProvince(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Postal/Zip Code</label>
                        <input 
                          type="text" 
                          placeholder="Postal Code" 
                          value={newStationPostalCode}
                          onChange={(e) => setNewStationPostalCode(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Country</label>
                        <input 
                          type="text" 
                          placeholder="Country" 
                          value={newStationCountry}
                          onChange={(e) => setNewStationCountry(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                    </div>

                    {/* Section 3: Contact & Socials */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest border-b border-white/5 pb-1 font-sans">Contact & Socials</h4>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Phone Number</label>
                        <input 
                          type="text" 
                          placeholder="Phone Number" 
                          value={newStationPhone}
                          onChange={(e) => setNewStationPhone(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Contact Email</label>
                        <input 
                          type="email" 
                          placeholder="Contact Email" 
                          value={newStationEmail}
                          onChange={(e) => setNewStationEmail(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Website URL</label>
                        <input 
                          type="text" 
                          placeholder="Website URL" 
                          value={newStationWebsite}
                          onChange={(e) => setNewStationWebsite(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Twitter Handle</label>
                        <input 
                          type="text" 
                          placeholder="@handle" 
                          value={newStationSocialTwitter}
                          onChange={(e) => setNewStationSocialTwitter(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Instagram Handle</label>
                        <input 
                          type="text" 
                          placeholder="@handle" 
                          value={newStationSocialInstagram}
                          onChange={(e) => setNewStationSocialInstagram(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <button 
                  type="submit" 
                  disabled={isCreating}
                  className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold py-3 px-5 rounded-xl shadow-lg transition duration-300 mt-6 uppercase tracking-wider cursor-pointer"
                >
                  {isCreating ? 'Provisioning...' : 'Provision Radio Node'}
                </button>
              </form>
            </div>
          )}


          {/* Case 3: User is Radio Admin and already has a station -> show custom Station Manager Dashboard */}
          {currentUser.role === 'radio_admin' && hasStation && (
            <div className="space-y-6 w-full animate-fade-in">
              {stations.filter(s => s.owner_id === currentUser.id).map(st => {
                const isLive = st.stream_url?.includes('/live');
                
                return (
                  <div key={st.id} className="space-y-6">
                    {/* Dashboard Header Bar */}
                    <div className="glass-card p-6 rounded-3xl border border-rose-500/10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-tr from-rose-600 to-pink-600 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg shadow-rose-500/10 flex-shrink-0">
                          <RadioIcon className="w-7 h-7 text-white animate-pulse" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-white tracking-tight">{st.name}</h3>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full lg:w-auto justify-end">
                        <div className="text-left lg:text-right font-sans space-y-0.5 max-w-xs md:max-w-md">
                          <p 
                            key={st.current_program_title || 'default'}
                            className="text-lg font-black animate-color-shift leading-tight truncate animate-page-entry"
                          >
                            {st.current_program_title || 'N/A (Default Broadcast)'}
                          </p>
                          <p className="text-xs font-semibold text-rose-400">
                            {st.rj_name ? `RJ ${st.rj_name}` : 'No RJ Scheduled'}
                          </p>
                        </div>

                      </div>
                    </div>

                    {/* Collapsible Editor Card in Modal */}
                    {isEditingMetadata && createPortal(
                      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                        {/* Backdrop overlay */}
                        <div 
                          className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-pointer"
                          onClick={() => setIsEditingMetadata(false)} 
                        />
                        {/* Modal Container */}
                        {/* Modal Container */}
                        <div className="bg-slate-900 border border-white/10 rounded-3xl p-6 shadow-2xl relative w-full max-w-4xl max-h-[85vh] h-[85vh] flex flex-col animate-scale-up font-sans">
                          
                          {/* Modal Header */}
                          <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <h3 className="text-sm font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-rose-455" /> Edit Station Schedule Details
                            </h3>
                            <button
                              onClick={() => setIsEditingMetadata(false)}
                              className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>

                          {/* Modal Body */}
                          <div className="flex-1 flex flex-col min-h-0 my-4 border border-white/5 bg-slate-950/40 p-4 rounded-2xl">
                            <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-3 flex-shrink-0">
                              <h4 className="text-[10px] font-extrabold text-rose-455 uppercase tracking-widest font-sans">
                                Program Details List
                              </h4>
                              <button
                                type="button"
                                onClick={() => setEditPrograms([...editPrograms, { title: '', rj: '', timeFrom: '09:00', timeTo: '17:00' }])}
                                className="px-2.5 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase rounded-lg transition"
                              >
                                + Add Program
                              </button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                {(() => {
                                  const timezone = st.timezone || 'UTC';
                                  const activeProg = getActiveProgram(editPrograms, timezone);
                                  return editPrograms.map((prog, index) => {
                                    const isActive = activeProg && 
                                      prog.title === activeProg.title && 
                                      prog.rj === activeProg.rj && 
                                      prog.timeFrom === activeProg.timeFrom && 
                                      prog.timeTo === activeProg.timeTo;

                                    return (
                                      <div 
                                        key={index} 
                                        data-program-index={index}
                                        className={`flex flex-col md:flex-row gap-3 p-3 rounded-xl border relative items-end transition-all duration-300 ${
                                          isActive 
                                            ? 'bg-rose-950/20 border-rose-500/35 shadow-lg shadow-rose-950/40' 
                                            : 'bg-slate-950 border-white/5'
                                        }`}
                                      >
                                        <div className="flex-1 w-full space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Program Title</label>
                                          <input
                                            type="text"
                                            placeholder="Morning Beats..."
                                            value={prog.title}
                                            onChange={(e) => {
                                              const updated = [...editPrograms];
                                              updated[index].title = e.target.value;
                                              setEditPrograms(updated);
                                            }}
                                            className="w-full bg-slate-900 border border-white/5 text-xs p-2 rounded-lg outline-none focus:border-rose-500 text-slate-200 transition"
                                          />
                                        </div>
                                        <div className="flex-1 w-full space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">RJ Name</label>
                                          <input
                                            type="text"
                                            placeholder="RJ Alex..."
                                            value={prog.rj}
                                            onChange={(e) => {
                                              const updated = [...editPrograms];
                                              updated[index].rj = e.target.value;
                                              setEditPrograms(updated);
                                            }}
                                            className="w-full bg-slate-900 border border-white/5 text-xs p-2 rounded-lg outline-none focus:border-rose-500 text-slate-200 transition"
                                          />
                                        </div>
                                        <div className="w-full md:w-28 space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Time From</label>
                                          <input
                                            type="time"
                                            value={prog.timeFrom}
                                            onChange={(e) => {
                                              const updated = [...editPrograms];
                                              updated[index].timeFrom = e.target.value;
                                              setEditPrograms(updated);
                                            }}
                                            className="w-full bg-slate-900 border border-white/5 text-xs p-2 rounded-lg outline-none focus:border-rose-500 text-slate-200 transition"
                                          />
                                        </div>
                                        <div className="w-full md:w-28 space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Time To</label>
                                          <input
                                            type="time"
                                            value={prog.timeTo}
                                            onChange={(e) => {
                                              const updated = [...editPrograms];
                                              updated[index].timeTo = e.target.value;
                                              setEditPrograms(updated);
                                            }}
                                            className="w-full bg-slate-900 border border-white/5 text-xs p-2 rounded-lg outline-none focus:border-rose-500 text-slate-200 transition"
                                          />
                                        </div>
                                    
                                    {editPrograms.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = editPrograms.filter((_, i) => i !== index);
                                          setEditPrograms(updated);
                                        }}
                                        className="px-2.5 py-2 bg-slate-905 hover:bg-rose-950/40 border border-white/5 text-rose-500 hover:text-rose-400 text-[10px] rounded-lg transition font-sans font-bold uppercase cursor-pointer"
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>

                          {/* Modal Footer */}
                          <div className="flex gap-3 justify-end border-t border-white/5 pt-4">
                            <button
                              type="button"
                              onClick={() => setIsEditingMetadata(false)}
                              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-white/5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition text-slate-400 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={isSavingMetadata}
                              onClick={() => handleSaveMetadata(st.id)}
                              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider transition text-white cursor-pointer"
                            >
                              {isSavingMetadata ? 'Saving...' : 'Save Metadata'}
                            </button>
                          </div>

                        </div>
                      </div>,
                      document.body
                    )}

                    {/* Stats Cards & Metadata Manager Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                      
                      {/* Full-width Stats Info */}
                      <div className="lg:col-span-12 space-y-6">
                        
                        {/* Stats Widgets */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                          <div className="glass-card p-5 rounded-2xl border border-white/5 space-y-1 font-sans relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-16 h-16 bg-rose-600/5 rounded-full blur-xl pointer-events-none" />
                            <span className="text-[10px] text-rose-455 font-extrabold uppercase tracking-widest block">Active Status</span>
                            <span className={`text-xl font-extrabold block uppercase ${isLive ? 'text-emerald-455 animate-pulse' : 'text-amber-505'}`}>
                              {isLive ? 'Live Broadcasting' : 'Standby (Offline)'}
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
                      <span className="font-bold text-slate-300">{st.stream_url?.includes('/live') ? 'Live Broadcast Source' : st.stream_url ? 'Continuous FM Feed' : 'None (Offline)'}</span>
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
