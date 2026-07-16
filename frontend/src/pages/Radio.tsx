import React, { useState, useEffect } from 'react';
import { Radio as RadioIcon, RadioIcon as LiveIcon, Plus, Sparkles, X, Users, Calendar, Play, Pause, Wifi, MapPin } from 'lucide-react';
import { useAudio, RadioStation } from '../context/AudioContext';
import { useAuth } from '../context/AuthContext';
import { RadioCard, RadioTile } from '../components/shared/RadioCard';
import { AppModal } from '../components/shared/AppModal';
import { TimePicker } from '../components/shared/TimePicker';
import { showError } from '../utils/swal';
import { fetchBroadcastKey, getAccessToken } from '../utils/authTokens';
import { RadioPageSkeleton } from '../components/shared/skeleton';

const API_URL = '/api';

const mobileScrollStrip =
  'flex md:hidden items-start gap-3 overflow-x-auto pb-1 -mx-6 px-6 scroll-px-6 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

export const Radio: React.FC = () => {
  const { playRadioStation, activeRadioStation, isPlaying, togglePlay } = useAudio();
  const { token, currentUser, isLoading: isAuthLoading, checkRadioStationStatus, hasRadioStation } = useAuth();

  // Radio states
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Creation state
  const [newStationName, setNewStationName] = useState('');
  const [newStationDesc, setNewStationDesc] = useState('');
  const [newStationStreamUrl, setNewStationStreamUrl] = useState('');
  const [newStationCategory, setNewStationCategory] = useState('');
  const [newStationLicence, setNewStationLicence] = useState('');
  const [newStationLicenceFile, setNewStationLicenceFile] = useState<File | null>(null);
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

  // Connection credentials (broadcaster ingest)
  const [showCredentialsMap, setShowCredentialsMap] = useState<Record<number, boolean>>({});
  const [broadcastKeyMap, setBroadcastKeyMap] = useState<Record<number, string>>({});
  const [copiedKeyMap, setCopiedKeyMap] = useState<Record<number, boolean>>({});
  const [isRegeneratingKey, setIsRegeneratingKey] = useState<Record<number, boolean>>({});

  const fallbackCopyText = (text: string, onSuccess: () => void) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      if (document.execCommand('copy')) onSuccess();
    } catch {
      // ignore
    }
    document.body.removeChild(textArea);
  };

  const handleCopy = (text: string, id: number) => {
    const onSuccess = () => {
      setCopiedKeyMap(prev => ({ ...prev, [id]: true }));
      setTimeout(() => setCopiedKeyMap(prev => ({ ...prev, [id]: false })), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopyText(text, onSuccess));
    } else {
      fallbackCopyText(text, onSuccess);
    }
  };

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

  const handleRegenerateKey = async (stationId: number) => {
    setIsRegeneratingKey(prev => ({ ...prev, [stationId]: true }));
    try {
      const res = await fetch(`${API_URL}/radio/${stationId}/regenerate-key`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token || getAccessToken() || ''}` },
      });
      if (res.ok) {
        const updatedStation = await res.json();
        setStations(prev => prev.map(s => (s.id === stationId ? updatedStation : s)));
        const key = await fetchBroadcastKey(stationId);
        if (key) {
          setBroadcastKeyMap(prev => ({ ...prev, [stationId]: key }));
        }
      } else {
        const err = await res.json();
        showError('Error', err.detail || 'Failed to regenerate key.');
      }
    } catch {
      showError('Error', 'Connection failed.');
    } finally {
      setIsRegeneratingKey(prev => ({ ...prev, [stationId]: false }));
    }
  };

  // ── Program / Schedule editing ────────────────────────────────────────────
  interface ProgramDetail {
    title: string;
    rj: string;
    timeFrom: string;
    timeTo: string;
  }

  const getTimezoneOffsetMs = (timeZone: string, date = new Date()): number => {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric'
      });
      const parts = formatter.format(date);
      const match = parts.match(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/);
      if (!match) return 0;
      const [_, month, day, year, hour, minute, second] = match.map(Number);
      const tzUtcVal = Date.UTC(year, month - 1, day, hour, minute, second);
      return Math.round((tzUtcVal - date.getTime()) / 60000) * 60000;
    } catch (e) {
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
      return `${String(realUtcDate.getUTCHours()).padStart(2, '0')}:${String(realUtcDate.getUTCMinutes()).padStart(2, '0')}`;
    } catch (e) { return timeStr; }
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
      return `${String(localDate.getUTCHours()).padStart(2, '0')}:${String(localDate.getUTCMinutes()).padStart(2, '0')}`;
    } catch (e) { return utcTimeStr; }
  };

  const getActiveProgram = (programs: ProgramDetail[], timeZone: string) => {
    if (!programs || programs.length === 0) return null;
    let currentMinutes = 0;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: 'numeric', minute: 'numeric' });
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
          if (currentMinutes >= fromMinutes && currentMinutes <= toMinutes) return prog;
        } else {
          if (currentMinutes >= fromMinutes || currentMinutes <= toMinutes) return prog;
        }
      } catch (e) { continue; }
    }
    return programs[0];
  };

  // Which station's schedule modal is open
  const [editingStationId, setEditingStationId] = useState<number | null>(null);
  const [editPrograms, setEditPrograms] = useState<ProgramDetail[]>([]);
  const [editRjDetails, setEditRjDetails] = useState('');
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);

  const startEditingMetadata = (st: any) => {
    setEditRjDetails(st.rj_details || '');
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
        console.warn('Failed to parse programs_list:', e);
      }
    }
    if (initialPrograms.length === 0) {
      initialPrograms = [{ title: st.current_program_title || '', rj: st.rj_name || '', timeFrom: '09:00', timeTo: '17:00' }];
    }
    setEditPrograms(initialPrograms);
    setEditingStationId(st.id);
  };

  const handleSaveMetadata = async (stationId: number) => {
    setIsSavingMetadata(true);
    try {
      const station = stations.find(s => s.id === stationId);
      const stationTimezone = station?.timezone || 'UTC';
      const activeProg = getActiveProgram(editPrograms, stationTimezone);
      const utcPrograms = editPrograms.map(p => ({
        title: p.title, rj: p.rj,
        timeFrom: convertStationTimeToUtc(p.timeFrom, stationTimezone),
        timeTo: convertStationTimeToUtc(p.timeTo, stationTimezone)
      }));
      const res = await fetch(`${API_URL}/radio/${stationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          current_program_title: activeProg?.title || '',
          rj_name: activeProg?.rj || '',
          rj_details: editRjDetails,
          programs_list: JSON.stringify(utcPrograms)
        })
      });
      if (res.ok) {
        setEditingStationId(null);
        fetchRadioStations();
      } else {
        showError('Save Failed', 'Failed to save program details.');
      }
    } catch (e) {
      showError('Save Failed', 'Failed to save program details.');
    } finally {
      setIsSavingMetadata(false);
    }
  };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const hasStation = stations.some(s => s.owner_id === currentUser?.id);
  const filteredStations = stations;

  const fetchRadioStations = async () => {
    setIsLoading(true);
    try {
      const authToken = token;
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};
      const res = await fetch(`${API_URL}/radio`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStations(data);
      } else { throw new Error(); }
    } catch (e) {
      console.error('Failed to fetch radio stations:', e);
      setStations([]);
    } finally {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  };

  useEffect(() => {
    if (isAuthLoading) return;
    fetchRadioStations();
    const interval = setInterval(fetchRadioStations, 5000);
    return () => clearInterval(interval);
  }, [token, isAuthLoading]);

  useEffect(() => {
    if (editingStationId !== null) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => { document.body.classList.remove('overflow-hidden'); };
  }, [editingStationId]);

  // ── Station creation ──────────────────────────────────────────────────────
  const resetCreationForm = () => {
    setNewStationName(''); setNewStationDesc(''); setNewStationStreamUrl('');
    setNewStationCategory(''); setNewStationLicence(''); setNewStationLicenceFile(null); setNewStationStreetAddress('');
    setNewStationCity(''); setNewStationStateProvince(''); setNewStationPostalCode('');
    setNewStationCountry(''); setNewStationPhone(''); setNewStationEmail('');
    setNewStationWebsite(''); setNewStationBroadcastFrequency(''); setNewStationLanguages('');
    setNewStationSocialTwitter(''); setNewStationSocialInstagram('');
  };

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName || !newStationDesc) return;
    setIsCreating(true);
    try {
      const res = await fetch(`${API_URL}/radio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: newStationName, description: newStationDesc,
          stream_url: newStationStreamUrl || null,
          category: newStationCategory || null, licence: newStationLicence || null,
          street_address: newStationStreetAddress || null, city: newStationCity || null,
          state_province: newStationStateProvince || null, postal_code: newStationPostalCode || null,
          country: newStationCountry || null, phone: newStationPhone || null,
          email: newStationEmail || null, website: newStationWebsite || null,
          broadcast_frequency: newStationBroadcastFrequency || null,
          languages: newStationLanguages || null,
          social_twitter: newStationSocialTwitter || null,
          social_instagram: newStationSocialInstagram || null
        })
      });
      if (res.ok) {
        const saved = await res.json();
        if (newStationLicenceFile && saved?.id) {
          const formData = new FormData();
          formData.append('file', newStationLicenceFile);
          await fetch(`${API_URL}/radio/${saved.id}/licence-document`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
        }
        resetCreationForm();
        fetchRadioStations();
        if (checkRadioStationStatus) await checkRadioStationStatus();
      }
    } catch (e) {
      // Offline fallback
      const newSt: RadioStation = {
        id: stations.length + 1, name: newStationName, description: newStationDesc,
        cover_art_url: 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?auto=format&fit=crop&q=80&w=200',
        stream_url: newStationStreamUrl || 'https://pub1.freefm.lk/1.aac',
        current_track_title: 'Virtual Test Program', current_track_artist: 'VeriSonic Node',
        listeners_count: 100,
        category: newStationCategory || undefined, licence: newStationLicence || undefined,
        street_address: newStationStreetAddress || undefined, city: newStationCity || undefined,
        state_province: newStationStateProvince || undefined, postal_code: newStationPostalCode || undefined,
        country: newStationCountry || undefined, phone: newStationPhone || undefined,
        email: newStationEmail || undefined, website: newStationWebsite || undefined,
        broadcast_frequency: newStationBroadcastFrequency || undefined,
        languages: newStationLanguages || undefined,
        social_twitter: newStationSocialTwitter || undefined,
        social_instagram: newStationSocialInstagram || undefined
      };
      setStations([...stations, newSt]);
      resetCreationForm();
      if (checkRadioStationStatus) checkRadioStationStatus();
    } finally {
      setIsCreating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (isAuthLoading || isInitialLoad) {
    return (
      <RadioPageSkeleton
        isRadioAdmin={currentUser?.role === 'radio_admin'}
        hasStation={hasRadioStation}
      />
    );
  }

  return (
    <div className="space-y-6 md:space-y-10 w-full">

      {/* Page Title */}
      <div className="hidden md:block">
        <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <RadioIcon className="w-8 h-8 text-rose-400 animate-pulse" /> Radio Stations
        </h2>
      </div>

      {/* Radio Admin widgets */}
      {currentUser && (
        <>
          {/* ── Case 1: No station yet → Registration Form ───────────────── */}
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
                      {[
                        { label: 'Station Name *', placeholder: 'Station Name', value: newStationName, onChange: setNewStationName, required: true },
                        { label: 'Description *', placeholder: 'Acoustic description', value: newStationDesc, onChange: setNewStationDesc, required: true },
                        { label: 'Category', placeholder: 'e.g. Chillout, Pop, Classical', value: newStationCategory, onChange: setNewStationCategory },
                        { label: 'Licence', placeholder: 'License/Permit number', value: newStationLicence, onChange: setNewStationLicence },
                        { label: 'Frequency', placeholder: 'e.g. 98.1 FM, Web Only', value: newStationBroadcastFrequency, onChange: setNewStationBroadcastFrequency },
                        { label: 'Stream URL (Optional)', placeholder: 'Stream URL (Optional)', value: newStationStreamUrl, onChange: setNewStationStreamUrl },
                      ].map(field => (
                        <div key={field.label} className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">{field.label}</label>
                          <input type="text" placeholder={field.placeholder} value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans"
                            required={field.required} />
                        </div>
                      ))}
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Languages</label>
                        <input type="text" placeholder="e.g. English, Spanish" value={newStationLanguages}
                          onChange={(e) => setNewStationLanguages(e.target.value)}
                          className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">Licence Document</label>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                          onChange={(e) => setNewStationLicenceFile(e.target.files?.[0] || null)}
                          className="w-full text-[10px] text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-800 file:text-slate-200"
                        />
                        <p className="text-[9px] text-slate-550">PDF or image, max 10 MB.</p>
                      </div>
                    </div>

                    {/* Section 2: Address Details */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest border-b border-white/5 pb-1 font-sans">Location Details</h4>
                      {[
                        { label: 'Street Address', placeholder: 'Street Address', value: newStationStreetAddress, onChange: setNewStationStreetAddress },
                        { label: 'City', placeholder: 'City', value: newStationCity, onChange: setNewStationCity },
                        { label: 'State/Province', placeholder: 'State/Province', value: newStationStateProvince, onChange: setNewStationStateProvince },
                        { label: 'Postal/Zip Code', placeholder: 'Postal Code', value: newStationPostalCode, onChange: setNewStationPostalCode },
                        { label: 'Country', placeholder: 'Country', value: newStationCountry, onChange: setNewStationCountry },
                      ].map(field => (
                        <div key={field.label} className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">{field.label}</label>
                          <input type="text" placeholder={field.placeholder} value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans" />
                        </div>
                      ))}
                    </div>

                    {/* Section 3: Contact & Socials */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-extrabold text-rose-400 uppercase tracking-widest border-b border-white/5 pb-1 font-sans">Contact & Socials</h4>
                      {[
                        { label: 'Phone Number', placeholder: 'Phone Number', value: newStationPhone, onChange: setNewStationPhone, type: 'text' },
                        { label: 'Contact Email', placeholder: 'Contact Email', value: newStationEmail, onChange: setNewStationEmail, type: 'email' },
                        { label: 'Website URL', placeholder: 'Website URL', value: newStationWebsite, onChange: setNewStationWebsite, type: 'text' },
                        { label: 'Twitter Handle', placeholder: '@handle', value: newStationSocialTwitter, onChange: setNewStationSocialTwitter, type: 'text' },
                        { label: 'Instagram Handle', placeholder: '@handle', value: newStationSocialInstagram, onChange: setNewStationSocialInstagram, type: 'text' },
                      ].map(field => (
                        <div key={field.label} className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block font-sans">{field.label}</label>
                          <input type={field.type} placeholder={field.placeholder} value={field.value}
                            onChange={(e) => field.onChange(e.target.value)}
                            className="w-full bg-slate-950 border border-white/5 text-xs p-3 rounded-xl outline-none focus:border-rose-500 text-slate-300 transition font-sans" />
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
                <button type="submit" disabled={isCreating}
                  className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold py-3 px-5 rounded-xl shadow-lg transition duration-300 mt-6 uppercase tracking-wider cursor-pointer">
                  {isCreating ? 'Provisioning...' : 'Provision Radio Node'}
                </button>
              </form>
            </div>
          )}

          {/* ── Case 3: Radio Admin with stations → Live Monitor Dashboard ─ */}
          {currentUser.role === 'radio_admin' && hasStation && (
            <div className="space-y-4 md:space-y-5 w-full animate-fade-in">

              <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-widest font-sans">
                Your Station Nodes — Live Monitor
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {stations.filter(s => s.owner_id === currentUser.id).map(st => {
                  const isLive = st.stream_url?.includes('/live');
                  const timezone = (st as any).timezone || 'UTC';

                  // Determine active program from programs_list
                  let programs: { title: string; rj: string; timeFrom: string; timeTo: string }[] = [];
                  if ((st as any).programs_list) {
                    try {
                      const parsed = JSON.parse((st as any).programs_list);
                      if (Array.isArray(parsed)) programs = parsed;
                    } catch (_) {}
                  }
                  const activeProg = getActiveProgram(programs, timezone);

                  return (
                    <div key={st.id} className="glass-card rounded-3xl border border-white/5 overflow-hidden flex flex-col relative">

                      {/* Live status accent bar */}
                      <div className={`h-1 w-full ${isLive ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-amber-500/40 to-amber-600/20'}`} />

                      {/* Card Header */}
                      <div className="p-5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 bg-gradient-to-tr from-rose-600 to-pink-600 rounded-2xl flex items-center justify-center border border-white/10 shadow-lg shadow-rose-500/10 flex-shrink-0">
                            <RadioIcon className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-base font-black text-white tracking-tight leading-tight">{st.name}</h3>
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider ${isLive ? 'text-emerald-400' : 'text-amber-500'}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
                              {isLive ? 'Live Broadcasting' : 'Standby'}
                            </span>
                          </div>
                        </div>

                      <div className="flex items-center gap-2">
                        {/* Play / Pause listen button */}
                        <button
                          onClick={() => {
                            if (activeRadioStation?.id === st.id) {
                              togglePlay();
                            } else {
                              playRadioStation(st);
                            }
                          }}
                          title={activeRadioStation?.id === st.id && isPlaying ? 'Pause' : 'Listen Live'}
                          className={`p-2.5 rounded-xl border transition flex-shrink-0 ${
                            activeRadioStation?.id === st.id && isPlaying
                              ? 'bg-rose-600 hover:bg-rose-500 border-rose-500/30 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 border-white/5 text-slate-400 hover:text-rose-400'
                          }`}
                        >
                          {activeRadioStation?.id === st.id && isPlaying
                            ? <Pause className="w-4 h-4" />
                            : <Play className="w-4 h-4" />}
                        </button>

                        {/* Schedule editor button */}
                        <button
                          onClick={() => startEditingMetadata(st)}
                          title="Edit Schedule"
                          className="p-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-slate-400 hover:text-rose-400 transition flex-shrink-0"
                        >
                          <Calendar className="w-4 h-4" />
                        </button>
                      </div>
                      </div>

                      {/* Now Playing strip — only when live broadcasting */}
                      {isLive && (
                        <div className="mx-5 mb-4 bg-slate-950/60 border border-white/5 rounded-2xl px-4 py-3 space-y-0.5">
                          <p className="text-[9px] text-rose-455 font-extrabold uppercase tracking-widest">Now On Air</p>
                          <p className="text-sm font-extrabold text-white truncate leading-snug animate-color-shift">
                            {st.current_program_title || activeProg?.title || 'N/A (Default Broadcast)'}
                          </p>
                          <p className="text-[10px] text-rose-400 font-semibold">
                            {st.rj_name ? `RJ ${st.rj_name}` : activeProg?.rj ? `RJ ${activeProg.rj}` : 'No RJ Scheduled'}
                          </p>
                        </div>
                      )}

                      {/* Stats Row */}
                      <div className="grid grid-cols-3 gap-0 border-t border-white/5 font-sans">
                        <div className="p-4 space-y-0.5 border-r border-white/5">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Listeners</p>
                          <p className="text-sm font-extrabold text-white flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-500" />
                            {st.listeners_count || 0}
                          </p>
                        </div>
                        <div className="p-4 space-y-0.5 border-r border-white/5">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Category</p>
                          <p className="text-sm font-extrabold text-white capitalize truncate">{st.category || '—'}</p>
                        </div>
                        <div className="p-4 space-y-0.5">
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Frequency</p>
                          <p className="text-sm font-extrabold text-white truncate">{(st as any).broadcast_frequency || '—'}</p>
                        </div>
                      </div>

                      {/* Broadcaster connection settings */}
                      {st.is_active && (
                        <div className="border-t border-white/5 p-5 space-y-3 font-sans">
                          <button
                            type="button"
                            onClick={() => toggleCredentials(st.id)}
                            className={`w-full py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                              showCredentialsMap[st.id]
                                ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                                : 'bg-slate-900 hover:bg-slate-800 border-white/5 text-slate-300'
                            }`}
                          >
                            <Wifi className="w-3.5 h-3.5" /> Connection Settings
                          </button>

                          {showCredentialsMap[st.id] && (
                            <div className="space-y-4 animate-slide-down">
                              <div className="space-y-1">
                                <h4 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Stream Ingestion Node</h4>
                                <p className="text-[11px] text-slate-405 leading-normal">
                                  Copy your personal stream key into the Desktop Broadcaster app to go live.
                                </p>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9.5px] font-bold text-slate-555 uppercase block">Stream Key</label>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    readOnly
                                    value={broadcastKeyMap[st.id] || ''}
                                    className="w-full bg-slate-950 border border-white/5 text-[10px] p-2.5 rounded-xl text-white font-mono font-semibold outline-none tracking-wider"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(broadcastKeyMap[st.id] || '', st.id)}
                                    className="px-3 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-405 hover:text-white rounded-xl transition cursor-pointer font-bold text-[10px]"
                                  >
                                    {copiedKeyMap[st.id] ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                              </div>

                              <button
                                type="button"
                                disabled={isRegeneratingKey[st.id]}
                                onClick={() => handleRegenerateKey(st.id)}
                                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-rose-455 font-bold border border-rose-500/10 hover:border-rose-500/30 rounded-xl transition text-[10px] uppercase tracking-wider"
                              >
                                {isRegeneratingKey[st.id] ? 'Regenerating...' : 'Regenerate Stream Key'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="px-5 py-3 border-t border-white/5 flex items-center gap-1.5 text-[10px] text-slate-400 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate">
                          {st.city ? `${st.city}, ${st.country || ''}` : 'No location set'}
                        </span>
                      </div>

                      <AppModal
                        open={editingStationId === st.id}
                        onClose={() => setEditingStationId(null)}
                        maxWidth="4xl"
                        showGradient={false}
                        panelClassName="bg-slate-900 max-h-[85vh] h-[85vh] flex flex-col animate-scale-up font-sans"
                        bodyClassName="flex-1 flex flex-col min-h-0 p-0"
                        header={(
                          <h3 className="text-sm font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-rose-455" /> Edit Schedule — {st.name}
                          </h3>
                        )}
                        footer={(
                          <>
                            <button
                              type="button"
                              onClick={() => setEditingStationId(null)}
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
                              {isSavingMetadata ? 'Saving...' : 'Save Schedule'}
                            </button>
                          </>
                        )}
                      >
                            <div className="flex-1 flex flex-col min-h-0 mx-6 my-4 border border-white/5 bg-slate-950/40 p-4 rounded-2xl">
                              <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-3 flex-shrink-0">
                                <h4 className="text-[10px] font-extrabold text-rose-455 uppercase tracking-widest font-sans">Program Details List</h4>
                                <button type="button"
                                  onClick={() => setEditPrograms([...editPrograms, { title: '', rj: '', timeFrom: '09:00', timeTo: '17:00' }])}
                                  className="px-2.5 py-1.5 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-[9px] font-bold uppercase rounded-lg transition">
                                  + Add Program
                                </button>
                              </div>
                              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                {(() => {
                                  const activeProg = getActiveProgram(editPrograms, timezone);
                                  return editPrograms.map((prog, index) => {
                                    const isActive = activeProg &&
                                      prog.title === activeProg.title &&
                                      prog.rj === activeProg.rj &&
                                      prog.timeFrom === activeProg.timeFrom &&
                                      prog.timeTo === activeProg.timeTo;
                                    return (
                                      <div key={index}
                                        className={`flex flex-col md:flex-row gap-3 p-3 rounded-xl border relative items-end transition-all duration-300 ${isActive ? 'bg-rose-950/20 border-rose-500/35 shadow-lg shadow-rose-950/40' : 'bg-slate-950 border-white/5'}`}>
                                        <div className="flex-1 w-full space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Program Title</label>
                                          <input type="text" placeholder="Morning Beats..." value={prog.title}
                                            onChange={(e) => { const u = [...editPrograms]; u[index].title = e.target.value; setEditPrograms(u); }}
                                            className="w-full bg-slate-900 border border-white/5 text-xs p-2 rounded-lg outline-none focus:border-rose-500 text-slate-200 transition" />
                                        </div>
                                        <div className="flex-1 w-full space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">RJ Name</label>
                                          <input type="text" placeholder="RJ Alex..." value={prog.rj}
                                            onChange={(e) => { const u = [...editPrograms]; u[index].rj = e.target.value; setEditPrograms(u); }}
                                            className="w-full bg-slate-900 border border-white/5 text-xs p-2 rounded-lg outline-none focus:border-rose-500 text-slate-200 transition" />
                                        </div>
                                        <div className="w-full md:w-28 space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Time From</label>
                                          <TimePicker
                                            value={prog.timeFrom}
                                            onChange={(timeFrom) => {
                                              const u = [...editPrograms];
                                              u[index].timeFrom = timeFrom;
                                              setEditPrograms(u);
                                            }}
                                            size="xs"
                                            buttonClassName="bg-slate-900 border-white/5 rounded-lg outline-none focus:border-rose-500"
                                          />
                                        </div>
                                        <div className="w-full md:w-28 space-y-1">
                                          <label className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Time To</label>
                                          <TimePicker
                                            value={prog.timeTo}
                                            onChange={(timeTo) => {
                                              const u = [...editPrograms];
                                              u[index].timeTo = timeTo;
                                              setEditPrograms(u);
                                            }}
                                            size="xs"
                                            min={prog.timeFrom || undefined}
                                            buttonClassName="bg-slate-900 border-white/5 rounded-lg outline-none focus:border-rose-500"
                                          />
                                        </div>
                                        {editPrograms.length > 1 && (
                                          <button type="button"
                                            onClick={() => setEditPrograms(editPrograms.filter((_, i) => i !== index))}
                                            className="px-2.5 py-2 bg-slate-905 hover:bg-rose-950/40 border border-white/5 text-rose-500 hover:text-rose-400 text-[10px] rounded-lg transition font-sans font-bold uppercase cursor-pointer">
                                            Delete
                                          </button>
                                        )}
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            </div>
                      </AppModal>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Case 3.5: Platform Admin with a station → Info panel ──────── */}
          {currentUser.role === 'admin' && hasStation && (
            <div className="max-w-xl animate-fade-in">
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
                      <span className="font-bold text-slate-300">
                        {st.stream_url?.includes('/live') ? 'Live Broadcast Source' : st.stream_url ? 'Continuous FM Feed' : 'None (Offline)'}
                      </span>
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

      {/* Public station list for all non-radio-admin users */}
      {currentUser?.role !== 'radio_admin' && (
        filteredStations.length === 0 ? (
          <div className="glass-card border border-white/5 rounded-3xl p-8 md:p-16 text-center max-w-xl animate-pulse">
            <LiveIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-xs">No live stations matching selection found.</p>
          </div>
        ) : (
          <>
            <div className={mobileScrollStrip}>
              {filteredStations.map((st) => (
                <RadioTile key={st.id} station={st} />
              ))}
            </div>
            <div className="hidden md:grid md:grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredStations.map((st) => (
                <RadioCard key={st.id} station={st} />
              ))}
            </div>
          </>
        )
      )}

    </div>
  );
};
