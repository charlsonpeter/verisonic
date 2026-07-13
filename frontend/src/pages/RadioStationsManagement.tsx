import React, { useState, useCallback } from 'react';
import { Radio, Settings, Edit2, ArrowLeft, Ban, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm, showError, showSuccess } from '../utils/swal';
import Swal from 'sweetalert2';
import { TableSkeleton } from '../components/shared/skeleton';
import { LicenceDocumentLink } from '../components/shared/LicenceDocumentUpload';
import { useLazyList, DEFAULT_LAZY_PAGE_SIZE } from '../hooks/useLazyList';
import { LazyListSentinel } from '../components/shared/LazyListSentinel';

interface RadioStationRow {
  id: number;
  name: string;
  description?: string;
  category?: string;
  licence?: string;
  licence_document_url?: string;
  city?: string;
  country?: string;
  is_active: boolean;
  reactivation_requested?: boolean;
  disabled_reason?: string;
  reactivation_reason?: string;
  owner_name?: string;
  owner_email?: string;
  street_address?: string;
  state_province?: string;
  postal_code?: string;
  phone?: string;
  email?: string;
  website?: string;
  broadcast_frequency?: string;
  languages?: string;
  social_twitter?: string;
  social_instagram?: string;
  stream_url?: string;
}

const emptyForm = {
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
  is_active: true,
};

const statusBadge = (station: RadioStationRow) => {
  if (!station.is_active && station.reactivation_requested) {
    return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
  }
  if (station.is_active) {
    return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450';
  }
  return 'bg-rose-500/10 border-rose-500/25 text-rose-400';
};

const statusLabel = (station: RadioStationRow) => {
  if (!station.is_active && station.reactivation_requested) return 'Pending Appeal';
  return station.is_active ? 'Active' : 'Disabled';
};

export const RadioStationsManagement: React.FC = () => {
  const { token } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [editingStationId, setEditingStationId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'pending'>('all');
  const [formValues, setFormValues] = useState(emptyForm);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [licenceDocumentUrl, setLicenceDocumentUrl] = useState<string | null>(null);

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || ''}`,
  };

  const stationsList = useLazyList<RadioStationRow>({
    fetchPage: useCallback(async (offset, limit) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/radio/admin?${params}`, { headers: authHeaders });
      if (!res.ok) return { items: [], hasMore: false };
      const data = await res.json();
      return { items: data.items, hasMore: data.has_more };
    }, [token, searchQuery, statusFilter]),
    resetKey: viewMode === 'list' ? `${searchQuery}-${statusFilter}` : null,
    enabled: viewMode === 'list' && !!token,
    pageSize: DEFAULT_LAZY_PAGE_SIZE,
  });

  const stations = stationsList.items;
  const isLoading = stationsList.loading;

  const fetchStations = () => stationsList.reload();

  const handleEditClick = (station: RadioStationRow) => {
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
      is_active: station.is_active !== undefined ? station.is_active : true,
    });
    setMessage(null);
    setLicenceDocumentUrl(station.licence_document_url || null);
    setViewMode('edit');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.name.trim() || !formValues.description.trim()) {
      setMessage({ type: 'error', text: 'Station Name and Description are required.' });
      return;
    }
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/radio/${editingStationId}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify(formValues),
      });
      if (res.ok) {
        await fetchStations();
        setMessage({ type: 'success', text: 'Station details updated successfully!' });
        setTimeout(() => {
          setViewMode('list');
          setMessage(null);
        }, 1500);
      } else {
        const err = await res.json();
        setMessage({ type: 'error', text: err.detail || 'Request failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisableStation = async (station: RadioStationRow) => {
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
        if (!value) return 'Deactivation reason is required!';
      },
    });

    if (reason) {
      try {
        const res = await fetch(`/api/radio/${station.id}`, {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify({ is_active: false, disabled_reason: reason }),
        });
        if (res.ok) {
          await fetchStations();
          setFormValues((prev) => ({ ...prev, is_active: false }));
          showSuccess('Station Disabled');
        } else {
          showError('Failed to disable station');
        }
      } catch {
        showError('Connection failed');
      }
    }
  };

  const handleEnableStation = async (station: RadioStationRow) => {
    const confirmed = await showConfirm(
      'Enable Radio Station',
      `Are you sure you want to reactivate ${station.name}?`,
      'Yes, reactivate',
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/radio/${station.id}`, {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ is_active: true }),
      });
      if (res.ok) {
        await fetchStations();
        setFormValues((prev) => ({ ...prev, is_active: true }));
      } else {
        showError('Failed to enable station');
      }
    } catch {
      showError('Connection failed');
    }
  };

  const filteredStations = stations;

  return (
    <div className="space-y-8 w-full max-w-[90rem] animate-page-entry font-sans">
      <div className="flex justify-between items-center">
        <div className="hidden md:block">
          <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <Radio className="w-8 h-8 text-rose-455 animate-pulse" /> Radio Stations
          </h2>
        </div>
        {viewMode === 'edit' && (
          <button
            type="button"
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

      {viewMode === 'list' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/10 border border-white/3 p-4 rounded-2xl shadow-inner text-xs items-center justify-between">
            <input
              type="text"
              placeholder="Search by station, owner, licence, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 max-w-md bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition text-xs"
            />
            <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="bg-slate-950 border border-white/5 rounded-xl p-2.5 outline-none focus:border-rose-500 text-slate-205 transition text-xs min-w-[140px]"
              >
                <option value="all">All Stations</option>
                <option value="active">Active Only</option>
                <option value="disabled">Disabled Only</option>
                <option value="pending">Pending Appeal</option>
              </select>
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto rounded-3xl border border-white/5 bg-slate-900/10 backdrop-blur-md">
            {isLoading ? (
              <TableSkeleton rows={6} columns={8} variant="generic" />
            ) : filteredStations.length === 0 ? (
              <p className="p-8 text-xs text-slate-500 text-center font-bold">No stations found.</p>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
                    <th className="p-5">Station</th>
                    <th className="p-5">Frequency</th>
                    <th className="p-5">Location</th>
                    <th className="p-5">Category</th>
                    <th className="p-5">Owner</th>
                    <th className="p-5">Licence</th>
                    <th className="p-5">Status</th>
                    <th className="p-5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredStations.map((station) => (
                    <tr key={station.id} className="hover:bg-slate-900/20 transition">
                      <td className="p-5">
                        <div className="font-bold text-slate-200">{station.name}</div>
                      </td>
                      <td className="p-5 text-slate-300">
                        {station.broadcast_frequency || 'Web Station'}
                      </td>
                      <td className="p-5 text-slate-300">
                        {station.city ? `${station.city}, ${station.country || ''}` : '—'}
                      </td>
                      <td className="p-5 text-slate-300">
                        {station.category || '—'}
                      </td>
                      <td className="p-5">
                        <div className="font-bold text-slate-200">{station.owner_name || 'Unassigned'}</div>
                        <div className="text-[10px] text-slate-455 mt-0.5">{station.owner_email || '—'}</div>
                      </td>
                      <td className="p-5 max-w-[160px]">
                        <span className="text-slate-300 line-clamp-2">{station.licence || '—'}</span>
                        <LicenceDocumentLink url={station.licence_document_url} />
                      </td>
                      <td className="p-5">
                        <span className={`px-2 py-0.5 border rounded-full text-[9px] font-extrabold uppercase ${statusBadge(station)}`}>
                          {statusLabel(station)}
                        </span>
                      </td>
                      <td className="p-5">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditClick(station)}
                            className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-emerald-450 transition cursor-pointer"
                            title="Edit station"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {station.is_active ? (
                            <button
                              type="button"
                              onClick={() => void handleDisableStation(station)}
                              className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-rose-400 transition cursor-pointer"
                              title="Disable station"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleEnableStation(station)}
                              className="p-2 bg-slate-900 border border-white/5 rounded-xl text-slate-400 hover:text-emerald-450 transition cursor-pointer"
                              title="Enable station"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <LazyListSentinel
              hasMore={stationsList.hasMore}
              loading={stationsList.loadingMore}
              onLoadMore={stationsList.loadMore}
            />
          </div>

          <div className="md:hidden space-y-3">
            {isLoading ? (
              <p className="text-xs text-slate-500 text-center py-8">Loading stations...</p>
            ) : filteredStations.length === 0 ? (
              <p className="p-8 text-xs text-slate-500 text-center font-bold">No stations found.</p>
            ) : (
              filteredStations.map((station) => (
                <div key={station.id} className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200">{station.name}</div>
                    </div>
                    <span className={`px-2 py-0.5 border rounded-full text-[9px] font-extrabold uppercase flex-shrink-0 ${statusBadge(station)}`}>
                      {statusLabel(station)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 text-[10px] text-slate-400">
                    <div><span className="text-slate-550 font-bold uppercase">Frequency: </span>{station.broadcast_frequency || 'Web Station'}</div>
                    <div><span className="text-slate-550 font-bold uppercase">Location: </span>{station.city ? `${station.city}, ${station.country || ''}` : '—'}</div>
                    <div><span className="text-slate-550 font-bold uppercase">Category: </span>{station.category || '—'}</div>
                    <div><span className="text-slate-550 font-bold uppercase">Owner: </span>{station.owner_name || 'Unassigned'} · {station.owner_email || '—'}</div>
                    <div><span className="text-slate-550 font-bold uppercase">Licence: </span>{station.licence || '—'} {station.licence_document_url && (<a href={station.licence_document_url} target="_blank" rel="noopener noreferrer" className="text-rose-400 ml-1">[Doc]</a>)}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditClick(station)}
                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-[10px] font-bold text-slate-350 hover:text-white uppercase tracking-wider flex items-center justify-center gap-1 transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>
                    {station.is_active ? (
                      <button
                        type="button"
                        onClick={() => void handleDisableStation(station)}
                        className="flex-1 py-2.5 bg-rose-950/30 hover:bg-rose-900/40 rounded-xl border border-rose-500/20 text-[10px] font-bold text-rose-400 uppercase tracking-wider flex items-center justify-center gap-1 transition"
                      >
                        <Ban className="w-3.5 h-3.5" /> Disable
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleEnableStation(station)}
                        className="flex-1 py-2.5 bg-emerald-950/30 hover:bg-emerald-900/40 rounded-xl border border-emerald-500/20 text-[10px] font-bold text-emerald-450 uppercase tracking-wider flex items-center justify-center gap-1 transition"
                      >
                        <Check className="w-3.5 h-3.5" /> Enable
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
            <LazyListSentinel
              hasMore={stationsList.hasMore}
              loading={stationsList.loadingMore}
              onLoadMore={stationsList.loadMore}
            />
          </div>
        </div>
      )}

      {viewMode === 'edit' && (
        <form onSubmit={handleSubmit} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
          <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 pt-1">
            <Settings className="w-4.5 h-4.5" /> Update Radio Station Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            <div className="space-y-8">
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Core Info</h3>
                <div className="grid grid-cols-1 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Station Name *</label>
                    <input type="text" name="name" value={formValues.name} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" required />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Description *</label>
                    <textarea name="description" value={formValues.description} onChange={handleInputChange} rows={2} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition resize-none" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Category</label>
                      <input type="text" name="category" value={formValues.category} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Frequency</label>
                      <input type="text" name="broadcast_frequency" value={formValues.broadcast_frequency} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Languages</label>
                      <input type="text" name="languages" value={formValues.languages} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">Licence Info</label>
                      <input type="text" name="licence" value={formValues.licence} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                    </div>
                  </div>
                  {editingStationId && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block text-xs">
                        Licence Document
                      </label>
                      {licenceDocumentUrl ? (
                        <LicenceDocumentLink url={licenceDocumentUrl} className="text-[10px]" />
                      ) : (
                        <p className="text-[10px] text-slate-500">No document uploaded by station owner.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Location Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Street Address</label>
                    <input type="text" name="street_address" value={formValues.street_address} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                  </div>
                  {(['city', 'state_province', 'postal_code', 'country'] as const).map((field) => (
                    <div key={field} className="space-y-1.5">
                      <label className="font-bold text-slate-400 uppercase tracking-wider block">{field.replace('_', ' ')}</label>
                      <input type="text" name={field} value={formValues[field]} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Contact & Socials</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {(['phone', 'email', 'website', 'social_twitter', 'social_instagram'] as const).map((field) => (
                  <div key={field} className={`space-y-1.5 ${field === 'website' ? 'sm:col-span-2' : ''}`}>
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">{field.replace('_', ' ')}</label>
                    <input type="text" name={field} value={formValues[field]} onChange={handleInputChange} className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4 pt-2 flex-wrap">
            <button type="button" onClick={() => { setViewMode('list'); setMessage(null); }} className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-400 hover:text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer">
              Cancel
            </button>
            {formValues.is_active ? (
              <button
                type="button"
                onClick={() => {
                  const current = stations.find((s) => s.id === editingStationId);
                  if (current) void handleDisableStation(current);
                }}
                className="px-8 py-3.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 text-rose-400 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
              >
                Disable Station
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const current = stations.find((s) => s.id === editingStationId);
                  if (current) void handleEnableStation(current);
                }}
                className="px-8 py-3.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-450 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
              >
                Enable Station
              </button>
            )}
            <button type="submit" disabled={isSaving} className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer">
              {isSaving ? 'Saving Details...' : 'Save Station Details'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default RadioStationsManagement;
