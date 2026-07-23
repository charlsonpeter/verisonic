import React, { useState, useEffect } from 'react';
import { Disc, AlertTriangle, Sparkles, MapPin, Phone, Shield } from 'lucide-react';
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
  'w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition disabled:opacity-30';
const labelClass = 'font-bold text-slate-400 uppercase tracking-wider block text-xs';

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
    <div className="space-y-8 w-full animate-page-entry font-sans max-w-4xl">
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
        <div className="p-5 rounded-3xl border border-rose-500/20 bg-rose-500/5 space-y-4 flex items-start gap-4">
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

      <form onSubmit={handleUpdateStudioProfile} className="space-y-6">
        <div className="flex items-center justify-between gap-3 px-1">
          <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Disc className="w-4 h-4" />
            {isOnboarding ? 'Studio Onboarding' : 'Studio Profile Settings'}
          </h3>
        </div>

        {profileMessage && (
          <div className={`p-4 rounded-2xl text-xs font-semibold shadow-md ${
            profileMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-450'
              : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
          }`}>
            {profileMessage.text}
          </div>
        )}

        {/* Cover hero + identity */}
        <section className="bg-gradient-premium border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 sm:p-6 space-y-5">
            <CoverImageUpload
              uploadUrl="/api/auth/studio-profile/cover"
              coverUrl={currentUser?.artist_profile?.cover_art_url}
              token={token}
              disabled={disabled || !canUploadAssets}
              variant="hero"
              label="Studio Cover"
              hint={
                canUploadAssets
                  ? 'JPG, PNG, or WEBP · 16:9 recommended · hover to change'
                  : 'Save your studio profile first, then upload a cover image.'
              }
              onUploaded={() => { void fetchCurrentUser?.(); }}
            />

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Studio Name *</label>
                <input
                  type="text"
                  name="stage_name"
                  value={formValues.stage_name}
                  onChange={handleInputChange}
                  disabled={disabled}
                  placeholder="Your studio or label name"
                  className={fieldClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Studio Bio *</label>
                <textarea
                  name="bio"
                  value={formValues.bio}
                  onChange={handleInputChange}
                  disabled={disabled}
                  rows={4}
                  placeholder="Tell listeners about your studio, sound, and artists..."
                  className={`${fieldClass} resize-none`}
                  required
                />
              </div>
            </div>
          </div>
        </section>

        {/* Licence */}
        <section className="glass-card p-5 sm:p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
          <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Licence & Compliance
          </h3>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className={labelClass}>Licence Info</label>
              <input
                type="text"
                name="licence"
                placeholder="Business or registration details"
                value={formValues.licence}
                onChange={handleInputChange}
                disabled={disabled}
                className={fieldClass}
              />
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

        {/* Location + Contact grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="glass-card p-5 sm:p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" /> Location
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label className={labelClass}>Street Address</label>
                <input
                  type="text"
                  name="street_address"
                  value={formValues.street_address}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>City *</label>
                <input
                  type="text"
                  name="city"
                  value={formValues.city}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>State / Province</label>
                <input
                  type="text"
                  name="state_province"
                  value={formValues.state_province}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Postal Code</label>
                <input
                  type="text"
                  name="postal_code"
                  value={formValues.postal_code}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Country *</label>
                <input
                  type="text"
                  name="country"
                  value={formValues.country}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                  required
                />
              </div>
            </div>
          </section>

          <section className="glass-card p-5 sm:p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5" /> Contact & Socials
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Phone Number *</label>
                <input
                  type="text"
                  name="phone"
                  value={formValues.phone}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Email Address *</label>
                <input
                  type="email"
                  name="email"
                  value={formValues.email}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                  required
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className={labelClass}>Website</label>
                <input
                  type="text"
                  name="website"
                  value={formValues.website}
                  onChange={handleInputChange}
                  disabled={disabled}
                  placeholder="https://"
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Twitter</label>
                <input
                  type="text"
                  name="social_twitter"
                  placeholder="@handle"
                  value={formValues.social_twitter}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Instagram</label>
                <input
                  type="text"
                  name="social_instagram"
                  placeholder="@handle"
                  value={formValues.social_instagram}
                  onChange={handleInputChange}
                  disabled={disabled}
                  className={fieldClass}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-center pt-1">
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
