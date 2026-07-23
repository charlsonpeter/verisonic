import React, { useState, useEffect } from 'react';
import { Disc, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { showError, showSuccess } from '../utils/swal';
import Swal from 'sweetalert2';
import { LicenceDocumentUpload } from '../components/shared/LicenceDocumentUpload';
import { CoverImageUpload } from '../components/shared/CoverImageUpload';

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

const fieldClass =
  'w-full bg-transparent border-0 border-b border-white/10 rounded-none px-0 py-2 text-xs outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30';
const labelClass = 'text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5';

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h4 className="text-[10px] font-bold text-rose-400 uppercase tracking-[0.2em] border-b border-white/10 pb-1.5 mb-3">
    {children}
  </h4>
);

export const StudioProfile: React.FC<{ onNavigate?: (tab: string) => void }> = ({ onNavigate }) => {
  const { currentUser, token, fetchCurrentUser, hasStudioProfileComplete } = useAuth();

  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingStudio, setIsSavingStudio] = useState(false);
  const [formValues, setFormValues] = useState(emptyStudioForm);

  const isOnboarding = !hasStudioProfileComplete;
  const canUploadAssets = Boolean(currentUser?.artist_profile?.id);

  useEffect(() => {
    if (currentUser) {
      setFormValues(
        studioFormFromProfile(
          currentUser.artist_profile,
          currentUser.full_name || '',
        ),
      );
    }
  }, [currentUser]);

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
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify(formValues),
      });
      if (res.ok) {
        if (fetchCurrentUser) await fetchCurrentUser();
        onNavigate?.('track-list');
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
            Authorization: `Bearer ${token || ''}`,
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

  const isStudioDisabled = currentUser?.artist_profile?.is_active === false;
  const isAppealPending = currentUser?.artist_profile?.reactivation_requested === true;
  const disabled = isStudioDisabled;

  return (
    <div className="space-y-6 w-full animate-page-entry font-sans">
      {isOnboarding && (
        <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border border-cyan-500/20 p-5 rounded-3xl flex flex-col md:flex-row items-start gap-4 shadow-2xl">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-extrabold text-white">Complete Your Studio Onboarding</h4>
            <p className="text-xs text-slate-450 leading-relaxed font-medium">
              Fill in your studio details before uploading tracks or using admin tools.
            </p>
          </div>
        </div>
      )}

      {isStudioDisabled && (
        <div className="p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 space-y-3 flex items-start gap-4">
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-2xl flex-shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-2 flex-1">
            <h4 className="text-sm font-extrabold text-white">Studio Temporarily Disabled</h4>
            {currentUser?.artist_profile?.disabled_reason && (
              <div className="p-3 bg-slate-950/60 border border-white/5 rounded-2xl">
                <span className="text-xs text-slate-205 leading-normal block">{currentUser.artist_profile.disabled_reason}</span>
              </div>
            )}
            {isAppealPending ? (
              <div className="p-3 bg-amber-500/5 border border-amber-500/10 rounded-2xl text-amber-400 text-xs">
                <span className="font-extrabold uppercase text-[9px] tracking-wide block mb-0.5">Appeal Under Review</span>
                <span className="text-slate-300 leading-normal block">{currentUser?.artist_profile?.reactivation_reason}</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRequestStudioReactivation}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-955 text-xs font-bold rounded-xl transition uppercase tracking-wider cursor-pointer"
              >
                Submit Reactivation Appeal
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleUpdateStudioProfile} className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
          <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-1.5">
            <Disc className="w-4 h-4 text-rose-400" />
            {isOnboarding ? 'Studio Onboarding' : 'Studio Profile'}
          </h3>
        </div>

        {profileMessage && (
          <div className={`p-2.5 rounded-lg text-xs font-semibold ${
            profileMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {profileMessage.text}
          </div>
        )}

        {/* Header — cover + identity */}
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <CoverImageUpload
            uploadUrl="/api/auth/studio-profile/cover"
            coverUrl={currentUser?.artist_profile?.cover_art_url}
            token={token}
            disabled={disabled || !canUploadAssets}
            className="w-24 h-24"
            onUploaded={() => { void fetchCurrentUser?.(); }}
          />
          <div className="flex-1 w-full min-w-0 space-y-2.5">
            <div>
              <label className={labelClass}>Studio Name *</label>
              <input type="text" name="stage_name" value={formValues.stage_name} onChange={handleInputChange} disabled={disabled} className={fieldClass} required />
            </div>
            <div>
              <label className={labelClass}>Bio *</label>
              <textarea name="bio" value={formValues.bio} onChange={handleInputChange} disabled={disabled} rows={2} className={`${fieldClass} resize-none`} required />
            </div>
          </div>
        </div>

        <section>
          <SectionTitle>Licence</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className={labelClass}>Licence Info</label>
              <input type="text" name="licence" value={formValues.licence} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
            <LicenceDocumentUpload
              uploadUrl="/api/auth/studio-profile/licence-document"
              documentUrl={currentUser?.artist_profile?.licence_document_url}
              token={token}
              disabled={disabled || !canUploadAssets}
              onUploaded={() => { void fetchCurrentUser?.(); }}
            />
          </div>
        </section>

        <section>
          <SectionTitle>Location</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2.5">
            <div className="sm:col-span-2 lg:col-span-4">
              <label className={labelClass}>Street</label>
              <input type="text" name="street_address" value={formValues.street_address} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>City *</label>
              <input type="text" name="city" value={formValues.city} onChange={handleInputChange} disabled={disabled} className={fieldClass} required />
            </div>
            <div>
              <label className={labelClass}>State</label>
              <input type="text" name="state_province" value={formValues.state_province} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Postal</label>
              <input type="text" name="postal_code" value={formValues.postal_code} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Country *</label>
              <input type="text" name="country" value={formValues.country} onChange={handleInputChange} disabled={disabled} className={fieldClass} required />
            </div>
          </div>
        </section>

        <section>
          <SectionTitle>Contact</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-2.5">
            <div>
              <label className={labelClass}>Phone *</label>
              <input type="text" name="phone" value={formValues.phone} onChange={handleInputChange} disabled={disabled} className={fieldClass} required />
            </div>
            <div>
              <label className={labelClass}>Email *</label>
              <input type="email" name="email" value={formValues.email} onChange={handleInputChange} disabled={disabled} className={fieldClass} required />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Website</label>
              <input type="text" name="website" value={formValues.website} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Twitter</label>
              <input type="text" name="social_twitter" value={formValues.social_twitter} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Instagram</label>
              <input type="text" name="social_instagram" value={formValues.social_instagram} onChange={handleInputChange} disabled={disabled} className={fieldClass} />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-1 border-t border-white/10">
          <button
            type="submit"
            disabled={isSavingStudio || isStudioDisabled}
            className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition uppercase tracking-wider cursor-pointer"
          >
            {isSavingStudio ? 'Saving...' : isOnboarding ? 'Complete Setup' : 'Save Details'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudioProfile;
