import React, { useState, useEffect } from 'react';
import { Disc, Settings, Edit2, ArrowLeft, Info, Eye, EyeOff, BookOpen, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showConfirm, showError } from '../utils/swal';
import Swal from 'sweetalert2';

export const StudioProfile: React.FC = () => {
  const { currentUser, token, fetchCurrentUser } = useAuth();
  
  // Studio admin fields
  const [studioName, setStudioName] = useState('');
  const [studioBio, setStudioBio] = useState('');
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSavingStudio, setIsSavingStudio] = useState(false);

  // Super admin fields
  const [studios, setStudios] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'edit'>('list');
  const [editingStudioId, setEditingStudioId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled' | 'pending'>('all');
  const [formValues, setFormValues] = useState({
    stage_name: '',
    bio: '',
    is_active: true
  });

  const isSuperAdmin = currentUser && (currentUser.real_role || currentUser.role) === 'admin';

  // Load profile for studio admin
  useEffect(() => {
    if (currentUser && !isSuperAdmin) {
      setStudioName(currentUser.artist_profile?.stage_name || currentUser.full_name || '');
      setStudioBio(currentUser.artist_profile?.bio || '');
    }
  }, [currentUser, isSuperAdmin]);

  // Load studios for super admin
  const fetchStudios = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/admin/studios', {
        headers: {
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setStudios(data);
      }
    } catch (e) {
      console.error("Failed to fetch studios:", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      fetchStudios();
    }
  }, [currentUser, isSuperAdmin]);

  const handleUpdateStudioProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioName.trim() || !studioBio.trim()) {
      setProfileMessage({ type: 'error', text: 'Studio Name and Bio are required.' });
      return;
    }
    setIsSavingStudio(true);
    setProfileMessage(null);
    try {
      const res = await fetch('/api/auth/request-artist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          stage_name: studioName.trim(),
          bio: studioBio.trim()
        })
      });
      if (res.ok) {
        setProfileMessage({ type: 'success', text: 'Studio profile saved successfully!' });
        if (fetchCurrentUser) await fetchCurrentUser();
      } else {
        const errorData = await res.json();
        setProfileMessage({ type: 'error', text: errorData.detail || 'Failed to save studio profile.' });
      }
    } catch (e) {
      setProfileMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSavingStudio(false);
    }
  };

  // Disable studio (super admin popup prompt)
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
        if (!value) {
          return 'Deactivation reason is required!';
        }
      }
    });

    if (reason) {
      try {
        const res = await fetch(`/api/auth/admin/studios/${studio.id}`, {
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
          await fetchStudios();
          Swal.fire({
            icon: 'success',
            title: 'Studio Disabled',
            background: '#0f172a',
            color: '#fff',
            confirmButtonColor: '#e11d48'
          });
        } else {
          showError("Failed to disable studio");
        }
      } catch {
        showError("Connection failed");
      }
    }
  };

  // Enable studio (super admin)
  const handleEnableStudio = async (studio: any) => {
    const confirmed = await showConfirm(
      'Enable Music Studio',
      `Are you sure you want to reactivate ${studio.stage_name}?`,
      'Yes, reactivate'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/auth/admin/studios/${studio.id}`, {
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
        await fetchStudios();
      } else {
        showError("Failed to enable studio");
      }
    } catch {
      showError("Connection failed");
    }
  };

  // Appeal reactivation request (studio admin)
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
        if (!value) {
          return 'Reactivation justification is required!';
        }
      }
    });

    if (reason) {
      try {
        const res = await fetch('/api/auth/request-reactivation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
          },
          body: JSON.stringify({
            reason: reason
          })
        });
        if (res.ok) {
          if (fetchCurrentUser) await fetchCurrentUser();
          Swal.fire({
            icon: 'success',
            title: 'Appeal Submitted',
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

  // Click edit studio (super admin)
  const handleEditStudioClick = (studio: any) => {
    setEditingStudioId(studio.id);
    setFormValues({
      stage_name: studio.stage_name || '',
      bio: studio.bio || '',
      is_active: studio.is_active !== undefined ? studio.is_active : true
    });
    setProfileMessage(null);
    setViewMode('edit');
  };

  // Submit edit studio (super admin)
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
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify(formValues)
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
      
    if (statusFilter === 'active') {
      return matchesSearch && studio.is_active;
    } else if (statusFilter === 'disabled') {
      return matchesSearch && !studio.is_active;
    } else if (statusFilter === 'pending') {
      return matchesSearch && !studio.is_active && studio.reactivation_requested;
    }
    return matchesSearch;
  });

  // Admin View
  if (isSuperAdmin) {
    return (
      <div className="space-y-10 w-full animate-page-entry font-sans">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <Disc className="w-8 h-8 text-rose-400" /> Music Studios
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              List, edit, enable, or disable registered music studios on the platform.
            </p>
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

        {/* 1. LIST VIEW */}
        {viewMode === 'list' && (
          <div className="space-y-6">
            {/* Filters Bar */}
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
                  onChange={(e: any) => setStatusFilter(e.target.value)}
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
                <p className="text-slate-500 text-xs py-8 col-span-2 text-center font-sans">Loading music studio profiles...</p>
              ) : studios.length === 0 ? (
                <div className="glass-card p-12 rounded-3xl border border-white/5 text-center col-span-2 space-y-4">
                  <Info className="w-12 h-12 text-rose-400/50 mx-auto" />
                  <h3 className="text-sm font-bold text-slate-200">No Music Studios Registered</h3>
                  <p className="text-xs text-slate-555 max-w-sm mx-auto leading-relaxed">
                    There are currently no music studios or artist profiles registered on the platform.
                  </p>
                </div>
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
                      <p className="text-xs text-slate-455 line-clamp-2 leading-relaxed">{studio.bio || "No bio description set yet."}</p>
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

                  {/* Disabled Warning/Appeals Box */}
                  {(!studio.is_active || studio.reactivation_requested) && (
                    <div className={`p-3.5 rounded-2xl border text-xs font-sans space-y-2 ${
                      studio.reactivation_requested
                        ? 'bg-amber-500/5 border-amber-500/15 text-amber-400'
                        : 'bg-rose-500/5 border-rose-500/15 text-rose-400'
                    }`}>
                      <div className="font-extrabold flex items-center gap-1.5 uppercase text-[9px] tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        {studio.reactivation_requested 
                          ? 'Reactivation Review Pending' 
                          : 'Studio is Disabled'}
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

        {/* 2. EDIT FORM VIEW */}
        {viewMode === 'edit' && (
          <form onSubmit={handleAdminSubmit} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6 max-w-2xl">
            <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 pt-1">
              <Settings className="w-4.5 h-4.5" /> Edit Music Studio Details
            </h3>

            <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-5 shadow-xl">
              <div className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 uppercase tracking-wider block">Studio Name *</label>
                  <input
                    type="text"
                    value={formValues.stage_name}
                    onChange={(e) => setFormValues(prev => ({ ...prev, stage_name: e.target.value }))}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition text-xs"
                    required
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="font-bold text-slate-400 uppercase tracking-wider block">Studio Bio *</label>
                  <textarea
                    value={formValues.bio}
                    onChange={(e) => setFormValues(prev => ({ ...prev, bio: e.target.value }))}
                    rows={5}
                    className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-200 transition resize-none text-xs"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => { setViewMode('list'); setProfileMessage(null); }}
                className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 border border-white/5 text-slate-405 hover:text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
              >
                Cancel
              </button>

              {/* Super Admin Disable/Enable inside Edit Page */}
              {viewMode === 'edit' && isSuperAdmin && (
                formValues.is_active ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const currentStudio = studios.find(s => s.id === editingStudioId);
                      if (currentStudio) {
                        await handleDisableStudio(currentStudio);
                        setFormValues(prev => ({ ...prev, is_active: false }));
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
                      const currentStudio = studios.find(s => s.id === editingStudioId);
                      if (currentStudio) {
                        await handleEnableStudio(currentStudio);
                        setFormValues(prev => ({ ...prev, is_active: true }));
                      }
                    }}
                    className="px-8 py-3.5 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/20 text-emerald-450 font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
                  >
                    Enable Studio
                  </button>
                )
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

  // Normal Artist/Studio Admin View
  const isStudioDisabled = currentUser?.artist_profile?.is_active === false;
  const isAppealPending = currentUser?.artist_profile?.reactivation_requested === true;

  return (
    <div className="space-y-10 w-full animate-page-entry font-sans">
      {/* Studio Deactivation Banner */}
      {isStudioDisabled && (
        <div className={`p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 space-y-4 max-w-3xl flex items-start gap-4`}>
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
                <span className="text-xs text-slate-205 leading-normal block">{currentUser.artist_profile?.disabled_reason}</span>
              </div>
            )}

            {isAppealPending ? (
              <div className="p-3.5 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-amber-400 text-xs">
                <span className="font-extrabold uppercase text-[9px] tracking-wide block mb-0.5">Appeal Under Review</span>
                <span className="text-slate-300 leading-normal block">{currentUser.artist_profile?.reactivation_reason}</span>
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
        <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans pt-1">
          <Disc className="w-4.5 h-4.5" /> Studio Profile Settings
        </h3>
        {profileMessage && (
          <div className={`p-4 rounded-2xl text-xs font-semibold max-w-xl mx-auto shadow-md ${
            profileMessage.type === 'success' 
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450' 
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {profileMessage.text}
          </div>
        )}

        <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-5 shadow-xl font-sans">
          <div className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Studio / Stage Name</label>
              <input
                type="text"
                placeholder="Enter stage or label name..."
                value={studioName}
                onChange={(e) => setStudioName(e.target.value)}
                disabled={isStudioDisabled}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-205 transition text-xs disabled:opacity-30 disabled:pointer-events-none"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="font-bold text-slate-400 uppercase tracking-wider block">Studio Bio & Description</label>
              <textarea
                placeholder="Describe your studio, label, or artist credentials..."
                value={studioBio}
                onChange={(e) => setStudioBio(e.target.value)}
                disabled={isStudioDisabled}
                rows={5}
                className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 outline-none focus:border-rose-500 text-slate-205 transition resize-none font-sans text-xs disabled:opacity-30 disabled:pointer-events-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <button 
            type="submit"
            disabled={isSavingStudio || isStudioDisabled}
            className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
          >
            {isSavingStudio ? 'Saving Details...' : 'Save Studio Details'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudioProfile;
