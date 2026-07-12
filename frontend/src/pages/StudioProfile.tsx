import React, { useState, useEffect } from 'react';
import { Disc, Settings, Edit2, Info, BookOpen, AlertTriangle, MapPin, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm, showError, showSuccess } from '../utils/swal';
import Swal from 'sweetalert2';
import { CardGridSkeleton } from '../components/shared/skeleton';

const emptyStudioForm = {
  stage_name: '',
  bio: '',
  licence: '',
  street_address: '',
  city: '',
  state_province: '',
  postal_code: '',
  country: '',
  phone: '',
  email: '',
  website: '',
  social_twitter: '',
  social_instagram: '',
  is_active: true,
};

const studioFormFromProfile = (profile: Record<string, unknown> | null | undefined, fallbackName = '') => ({
  stage_name: (profile?.stage_name as string) || fallbackName,
  bio: (profile?.bio as string) || '',
  licence: (profile?.licence as string) || '',
  street_address: (profile?.street_address as string) || '',
  city: (profile?.city as string) || '',
  state_province: (profile?.state_province as string) || '',
  postal_code: (profile?.postal_code as string) || '',
  country: (profile?.country as string) || '',
  phone: (profile?.phone as string) || '',
  email: (profile?.email as string) || '',
  website: (profile?.website as string) || '',
  social_twitter: (profile?.social_twitter as string) || '',
  social_instagram: (profile?.social_instagram as string) || '',
  is_active: profile?.is_active !== undefined ? Boolean(profile.is_active) : true,
});

export const StudioProfile: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { currentUser, token, fetchCurrentUser, hasStudioProfileComplete } = useAuth();

  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingStudio, setIsSavingStudio] = useState(false);
  const [formValues, setFormValues] = useState(emptyStudioForm);

  const [studios, setStudios] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [editingStudioId, setEditingStudioId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'pending'>('all');

  const isSuperAdmin = currentUser && (currentUser.real_role || currentUser.role) === 'admin';
  const isOnboarding = !isSuperAdmin && !hasStudioProfileComplete;

  useEffect(() => {
    if (currentUser && !isSuperAdmin) {
      setFormValues(
        studioFormFromProfile(
          currentUser.artist_profile,
          currentUser.full_name || '',
        ),
      );
    }
  }, [currentUser, isSuperAdmin]);

  const fetchStudios = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/admin/studios', {
        headers: {
          Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setStudios(data);
      }
    } catch (e) {
      console.error('Failed to fetch studios:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchStudios();
    }
  }, [currentUser, isSuperAdmin]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const validateRequiredStudioFields = () => {
    const required = [
      { key: 'stage_name', label: 'Studio Name' },
      { key: 'bio', label: 'Studio Bio' },
      { key: 'city', label: 'City' },
      { key: 'country', label: 'Country' },
      { key: 'phone', label: 'Phone Number' },
      { key: 'email', label: 'Email Address' },
    ] as const;
    const missing = required.filter(({ key }) => !formValues[key].trim());
    if (missing.length > 0) {
      setProfileMessage({
        type: 'error',
        text: `Please fill required fields: ${missing.map((f) => f.label).join(', ')}.`,
      });
      return false;
    }
    return true;
  };

  const handleUpdateStudioProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRequiredStudioFields()) return;

    setIsSavingStudio(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/auth/studio-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(formValues),
      });
      if (res.ok) {
        if (fetchCurrentUser) await fetchCurrentUser();
        if (!isSuperAdmin) {
          onNavigate?.('track-list');
          return;
        }
        setProfileMessage({
          type: 'success',
          text: 'Studio profile saved successfully!',
        });
      } else {
        const errorData = await res.json();
        setProfileMessage({ type: 'error', text: errorData.detail || 'Failed to save studio profile.' });
      }
    } catch {
      setProfileMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSavingStudio(false);
    }
  };

  const handleDisableStudio = async (studio: any) => {
    const { value: reason } = await Swal.fire({
      title: 'Disable Music Studio',
      text: 'Please enter a reason for disabling this studio:',
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
        const res = await fetch(`/api/auth/admin/studios/${studio.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({ is_active: false, disabled_reason: reason }),
        });
        if (res.ok) {
          await fetchStudios();
          showSuccess('Studio Disabled');
        } else {
          showError('Failed to disable studio');
        }
      } catch {
        showError('Connection failed');
      }
    }
  };

  const handleEnableStudio = async (studio: any) => {
    const confirmed = await showConfirm(
      'Enable Music Studio',
      `Are you sure you want to reactivate ${studio.stage_name}?`,
      'Yes, reactivate',
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/auth/admin/studios/${studio.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({ is_active: true }),
      });
      if (res.ok) {
        await fetchStudios();
      } else {
        showError('Failed to enable studio');
      }
    } catch {
      showError('Connection failed');
    }
  };

  const handleRequestStudioReactivation = async () => {
    const { value: reason } = await Swal.fire({
      title: 'Request Reactivation',
      text: 'Please enter a proper justification/reason for reactivating your studio profile:',
      input: 'textarea',
      inputPlaceholder: 'Reason details...',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#334155',
      background: '#0f172a',
      color: '#fff',
      inputValidator: (value) => {
        if (!value) return 'Reactivation justification is required!';
      },
    });

    if (reason) {
      try {
        const res = await fetch('/api/auth/request-reactivation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({ reason }),
        });
        if (res.ok) {
          if (fetchCurrentUser) await fetchCurrentUser();
          showSuccess('Appeal Submitted', 'Reactivation request sent successfully to super admins.');
        } else {
          showError('Failed to submit request');
        }
      } catch {
        showError('Connection failed');
      }
    }
  };

  const handleEditStudioClick = (studio: any) => {
    setEditingStudioId(studio.id);
    setFormValues(studioFormFromProfile(studio));
    setProfileMessage(null);
    setViewMode('edit');
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValues.stage_name.trim() || !formValues.bio.trim()) {
      setProfileMessage({ type: 'error', text: 'Studio Name and Bio are required.' });
      return;
    }
    setIsSavingStudio(true);
    setProfileMessage(null);
    try {
      const res = await fetch(`/api/auth/admin/studios/${editingStudioId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify(formValues),
      });
      if (res.ok) {
        setProfileMessage({ type: 'success', text: 'Studio details updated successfully!' });
        await fetchStudios();
        setTimeout(() => {
          setViewMode('list');
          setProfileMessage(null);
        }, 1500);
      } else {
        const errorData = await res.json();
        setProfileMessage({ type: 'error', text: errorData.detail || 'Failed to update studio details.' });
      }
    } catch {
      setProfileMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSavingStudio(false);
    }
  };

  const filteredStudios = studios.filter((studio) => {
    const matchesSearch = studio.stage_name.toLowerCase().includes(searchQuery.toLowerCase());
    if (statusFilter === 'active') return matchesSearch && studio.is_active;
    if (statusFilter === 'disabled') return matchesSearch && !studio.is_active;
    if (statusFilter === 'pending') return matchesSearch && !studio.is_active && studio.reactivation_requested;
    return matchesSearch;
  });

  const renderStudioFormFields = (disabled = false) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
      <div className="space-y-8">
        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Core Info</h3>
          <div className="grid grid-cols-1 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Studio Name *</label>
              <input
                type="text"
                name="stage_name"
                value={formValues.stage_name}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Studio Bio *</label>
              <textarea
                name="bio"
                value={formValues.bio}
                onChange={handleInputChange}
                disabled={disabled}
                rows={4}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition resize-none disabled:opacity-30"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Licence Info</label>
              <input
                type="text"
                name="licence"
                placeholder="Business or registration details"
                value={formValues.licence}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
              />
            </div>
          </div>
        </div>

        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Location Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Street Address</label>
              <input
                type="text"
                name="street_address"
                value={formValues.street_address}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">City *</label>
              <input
                type="text"
                name="city"
                value={formValues.city}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">State / Province</label>
              <input
                type="text"
                name="state_province"
                value={formValues.state_province}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Postal Code</label>
              <input
                type="text"
                name="postal_code"
                value={formValues.postal_code}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Country *</label>
              <input
                type="text"
                name="country"
                value={formValues.country}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
                required
              />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest">Contact & Socials</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Phone Number *</label>
              <input
                type="text"
                name="phone"
                value={formValues.phone}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Email Address *</label>
              <input
                type="email"
                name="email"
                value={formValues.email}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Website</label>
              <input
                type="text"
                name="website"
                value={formValues.website}
                onChange={handleInputChange}
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
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
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
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
                disabled={disabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (isSuperAdmin) {
    return (
      <div className="space-y-10 w-full animate-page-entry font-sans">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div className="hidden md:block">
            <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <Disc className="w-8 h-8 text-rose-400" /> Music Studios
            </h2>
          </div>
        </div>

        {profileMessage && (
          <div className={`p-4 rounded-2xl text-xs font-semibold max-w-xl shadow-md ${
            profileMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {profileMessage.text}
          </div>
        )}

        {viewMode === 'list' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-4 bg-slate-900/10 border border-white/3 p-4 rounded-2xl shadow-inner font-sans text-xs items-center justify-between">
              <div className="flex flex-1 w-full gap-3">
                <input
                  type="text"
                  placeholder="Search studios by stage name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 max-w-md bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition text-xs"
                />
              </div>
              <div className="flex gap-2 items-center w-full sm:w-auto justify-end">
                <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Filter Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="bg-slate-950 border border-white/5 rounded-xl p-2.5 outline-none focus:border-rose-500 text-slate-205 transition text-xs min-w-[140px] font-sans"
                >
                  <option value="all">All Studios</option>
                  <option value="active">Active Only</option>
                  <option value="disabled">Disabled Only</option>
                  <option value="pending">Pending Appeal</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              {isLoading ? (
                <CardGridSkeleton count={2} />
              ) : filteredStudios.length === 0 ? (
                <div className="glass-card p-12 rounded-3xl border border-white/5 text-center col-span-2 space-y-4">
                  <Info className="w-12 h-12 text-rose-400/50 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-200">No Match Found</h3>
                  <p className="text-xs text-slate-555 max-w-sm mx-auto leading-relaxed">
                    No registered music studios match your current search query or status filter criteria.
                  </p>
                </div>
              ) : (
                filteredStudios.map((studio) => (
                  <div
                    key={studio.id}
                    className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 hover:border-rose-500/20 transition duration-300 relative group overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-600/5 rounded-full blur-2xl pointer-events-none group-hover:bg-rose-600/10 transition-all duration-700" />

                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <h3 className="text-lg font-extrabold text-white tracking-tight">{studio.stage_name}</h3>
                        <p className="text-xs text-slate-455 line-clamp-2 leading-relaxed">{studio.bio || 'No bio description set yet.'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 border rounded-full text-[9px] font-extrabold uppercase tracking-wide ${
                          studio.is_active
                            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-450'
                            : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                        }`}>
                          {studio.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center border border-white/5">
                          <Disc className="w-5 h-5 text-rose-455" />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-white/5 pt-3 flex gap-3 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                        <span className="truncate">{studio.city ? `${studio.city}, ${studio.country || ''}` : 'No address set'}</span>
                      </div>
                    </div>

                    {(!studio.is_active || studio.reactivation_requested) && (
                      <div className={`p-3.5 rounded-2xl border text-xs font-sans space-y-2 ${
                        studio.reactivation_requested
                          ? 'bg-amber-500/5 border-amber-500/15 text-amber-400'
                          : 'bg-rose-500/5 border-rose-500/15 text-rose-400'
                      }`}>
                        <div className="font-extrabold flex items-center gap-1.5 uppercase text-[9px] tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                          {studio.reactivation_requested ? 'Reactivation Review Pending' : 'Studio is Disabled'}
                        </div>
                        {studio.disabled_reason && (
                          <div>
                            <span className="font-extrabold uppercase text-[8px] text-slate-550 block">Deactivation Reason</span>
                            <span className="text-[10px] text-slate-300 leading-normal block">{studio.disabled_reason}</span>
                          </div>
                        )}
                        {studio.reactivation_reason && (
                          <div className="pt-1 border-t border-white/5">
                            <span className="font-extrabold uppercase text-[8px] text-slate-550 block">Reactivation Appeal Reason</span>
                            <span className="text-[10px] text-slate-300 leading-normal block">{studio.reactivation_reason}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="border-t border-white/5 pt-3 flex gap-3 text-[10px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                        <span>Studio ID: #{studio.id}</span>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                      {(studio.is_active || isSuperAdmin) && (
                        <button
                          onClick={() => handleEditStudioClick(studio)}
                          className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 rounded-xl border border-white/5 text-[10px] font-bold text-slate-350 hover:text-white uppercase tracking-wider flex items-center justify-center gap-1 transition cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Edit Studio
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {viewMode === 'edit' && (
          <form onSubmit={handleAdminSubmit} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
            <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 pt-1">
              <Settings className="w-4.5 h-4.5" /> Edit Music Studio Details
            </h3>
            {renderStudioFormFields()}
            <div className="flex justify-center gap-4 pt-2 flex-wrap">
              <button
                type="button"
                onClick={() => { setViewMode('list'); setProfileMessage(null); }}
                className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-405 hover:text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>
              {formValues.is_active ? (
                <button
                  type="button"
                  onClick={async () => {
                    const currentStudio = studios.find((s) => s.id === editingStudioId);
                    if (currentStudio) {
                      await handleDisableStudio(currentStudio);
                      setFormValues((prev) => ({ ...prev, is_active: false }));
                    }
                  }}
                  className="px-8 py-3.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/20 text-rose-400 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
                >
                  Disable Studio
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    const currentStudio = studios.find((s) => s.id === editingStudioId);
                    if (currentStudio) {
                      await handleEnableStudio(currentStudio);
                      setFormValues((prev) => ({ ...prev, is_active: true }));
                    }
                  }}
                  className="px-8 py-3.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/20 text-emerald-450 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
                >
                  Enable Studio
                </button>
              )}
              <button
                type="submit"
                disabled={isSavingStudio}
                className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
              >
                {isSavingStudio ? 'Saving Details...' : 'Save Studio Details'}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  const isStudioDisabled = currentUser?.artist_profile?.is_active === false;
  const isAppealPending = currentUser?.artist_profile?.reactivation_requested === true;

  return (
    <div className="space-y-10 w-full animate-page-entry font-sans">
      {isOnboarding && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-cyan-500/20 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-4 shadow-2xl">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl flex-shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h4 className="text-base font-extrabold text-white">Complete Your Studio Onboarding</h4>
            <p className="text-xs text-slate-450 leading-relaxed font-medium max-w-2xl">
              Your account was approved as a Studio Admin. Please fill in your studio details below before uploading tracks or accessing other admin tools.
            </p>
          </div>
        </div>
      )}

      {isStudioDisabled && (
        <div className="p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 space-y-4 max-w-3xl flex items-start gap-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-2 flex-1">
            <h4 className="text-base font-extrabold text-white">Your Music Studio is Temporarily Disabled</h4>
            <p className="text-xs text-slate-450 leading-relaxed font-medium">
              A platform administrator deactivated your studio profile. During deactivation, listeners cannot search for your studio, play your tracks, or view your bio details.
            </p>
            {currentUser?.artist_profile?.disabled_reason && (
              <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-2xl">
                <span className="text-[9px] uppercase font-black tracking-widest text-rose-400 block mb-1">Deactivation Reason</span>
                <span className="text-xs text-slate-205 leading-normal block">{currentUser.artist_profile.disabled_reason}</span>
              </div>
            )}
            {isAppealPending ? (
              <div className="p-3.5 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-amber-400 text-xs">
                <span className="font-extrabold uppercase text-[9px] tracking-wide block mb-0.5">Appeal Under Review</span>
                <span className="text-slate-300 leading-normal block">{currentUser?.artist_profile?.reactivation_reason}</span>
              </div>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleRequestStudioReactivation}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-955 text-xs font-bold rounded-xl transition uppercase tracking-wider cursor-pointer"
                >
                  Submit Reactivation Appeal
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleUpdateStudioProfile} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
        <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 pt-1">
          <Disc className="w-4.5 h-4.5" />
          {isOnboarding ? 'Studio Onboarding' : 'Studio Profile Settings'}
        </h3>
        {profileMessage && (
          <div className={`p-4 rounded-2xl text-xs font-semibold max-w-xl shadow-md ${
            profileMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {profileMessage.text}
          </div>
        )}
        {renderStudioFormFields(isStudioDisabled)}
        <div className="flex justify-center pt-2">
          <button
            type="submit"
            disabled={isSavingStudio || isStudioDisabled}
            className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
          >
            {isSavingStudio ? 'Saving Details...' : isOnboarding ? 'Complete Studio Setup' : 'Save Studio Details'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudioProfile;
