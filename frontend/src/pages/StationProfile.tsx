import React from 'react';
import { Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const StationProfile: React.FC = () => {
  const { currentUser, token } = useAuth();
  const [station, setStation] = React.useState<any>(null);
  const [profileMessage, setProfileMessage] = React.useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = React.useState(false);

  // Radio Station details fields
  const [stationCategory, setStationCategory] = React.useState('');
  const [stationLicence, setStationLicence] = React.useState('');
  const [stationStreetAddress, setStationStreetAddress] = React.useState('');
  const [stationCity, setStationCity] = React.useState('');
  const [stationStateProvince, setStationStateProvince] = React.useState('');
  const [stationPostalCode, setStationPostalCode] = React.useState('');
  const [stationCountry, setStationCountry] = React.useState('');
  const [stationPhone, setStationPhone] = React.useState('');
  const [stationEmail, setStationEmail] = React.useState('');
  const [stationWebsite, setStationWebsite] = React.useState('');
  const [stationFrequency, setStationFrequency] = React.useState('');
  const [stationLanguages, setStationLanguages] = React.useState('');
  const [stationTwitter, setStationTwitter] = React.useState('');
  const [stationInstagram, setStationInstagram] = React.useState('');

  React.useEffect(() => {
    const fetchStation = async () => {
      const userRole = currentUser?.real_role || currentUser?.role;
      if (userRole !== 'radio_admin' && userRole !== 'admin') return;
      try {
        const res = await fetch('/api/radio');
        if (res.ok) {
          const data = await res.json();
          const myStation = data.find((s: any) => s.owner_id === currentUser?.id);
          if (myStation) {
            setStation(myStation);
            setStationCategory(myStation.category || '');
            setStationLicence(myStation.licence || '');
            setStationStreetAddress(myStation.street_address || '');
            setStationCity(myStation.city || '');
            setStationStateProvince(myStation.state_province || '');
            setStationPostalCode(myStation.postal_code || '');
            setStationCountry(myStation.country || '');
            setStationPhone(myStation.phone || '');
            setStationEmail(myStation.email || '');
            setStationWebsite(myStation.website || '');
            setStationFrequency(myStation.broadcast_frequency || '');
            setStationLanguages(myStation.languages || '');
            setStationTwitter(myStation.social_twitter || '');
            setStationInstagram(myStation.social_instagram || '');
          }
        }
      } catch (e) {
        console.error("Failed to fetch station for profile:", e);
      }
    };
    fetchStation();
  }, [currentUser]);

  const handleUpdateStationProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!station) return;
    setIsSavingProfile(true);
    setProfileMessage(null);
    try {
      const radioRes = await fetch(`/api/radio/${station.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || localStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({
          name: station.name,
          description: station.description,
          stream_url: station.stream_url,
          category: stationCategory,
          licence: stationLicence,
          street_address: stationStreetAddress,
          city: stationCity,
          state_province: stationStateProvince,
          postal_code: stationPostalCode,
          country: stationCountry,
          phone: stationPhone,
          email: stationEmail,
          website: stationWebsite,
          broadcast_frequency: stationFrequency,
          languages: stationLanguages,
          social_twitter: stationTwitter,
          social_instagram: stationInstagram
        })
      });

      if (radioRes.ok) {
        setProfileMessage({ type: 'success', text: 'Station details saved successfully!' });
      } else {
        const data = await radioRes.json();
        setProfileMessage({ type: 'error', text: data.detail || 'Failed to save radio details.' });
      }
    } catch (e) {
      setProfileMessage({ type: 'error', text: 'Connection failed.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div className="space-y-10 w-full animate-page-entry">
      <form onSubmit={handleUpdateStationProfile} className="bg-slate-900/10 border border-white/3 p-6 rounded-3xl shadow-inner space-y-6">
        <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans pt-1">
          <Settings className="w-4.5 h-4.5" /> Radio Station Profile Settings
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

        {['radio_admin', 'admin'].includes(currentUser?.real_role || currentUser?.role || '') && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8 font-sans items-start">
            {/* Left Column */}
            <div className="space-y-8">
              {/* Card: Radio Station Details */}
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  Radio Station Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Category</label>
                    <input
                      type="text"
                      placeholder="e.g. Chillout, Pop"
                      value={stationCategory}
                      onChange={(e) => setStationCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Broadcast frequency</label>
                    <input
                      type="text"
                      placeholder="e.g. 98.5 MHz, 102.1 FM"
                      value={stationFrequency}
                      onChange={(e) => setStationFrequency(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Languages</label>
                    <input
                      type="text"
                      placeholder="e.g. English, Spanish"
                      value={stationLanguages}
                      onChange={(e) => setStationLanguages(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Licence info</label>
                    <input
                      type="text"
                      placeholder="Licence identification"
                      value={stationLicence}
                      onChange={(e) => setStationLicence(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                </div>
              </div>

              {/* Card: Location Details */}
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  Station Location Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Street Address</label>
                    <input
                      type="text"
                      placeholder="Street Address"
                      value={stationStreetAddress}
                      onChange={(e) => setStationStreetAddress(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">City</label>
                    <input
                      type="text"
                      placeholder="City"
                      value={stationCity}
                      onChange={(e) => setStationCity(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">State / Province</label>
                    <input
                      type="text"
                      placeholder="State / Province"
                      value={stationStateProvince}
                      onChange={(e) => setStationStateProvince(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Postal Code</label>
                    <input
                      type="text"
                      placeholder="Postal Code"
                      value={stationPostalCode}
                      onChange={(e) => setStationPostalCode(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Country</label>
                    <input
                      type="text"
                      placeholder="Country"
                      value={stationCountry}
                      onChange={(e) => setStationCountry(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-8">
              {/* Card: Contact Details */}
              <div className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 shadow-xl">
                <h3 className="text-xs font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
                  Station Contact & Socials
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Phone Number</label>
                    <input
                      type="text"
                      placeholder="Phone"
                      value={stationPhone}
                      onChange={(e) => setStationPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Email Address</label>
                    <input
                      type="email"
                      placeholder="Email"
                      value={stationEmail}
                      onChange={(e) => setStationEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Website</label>
                    <input
                      type="text"
                      placeholder="Website URL"
                      value={stationWebsite}
                      onChange={(e) => setStationWebsite(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Twitter</label>
                    <input
                      type="text"
                      placeholder="@handle"
                      value={stationTwitter}
                      onChange={(e) => setStationTwitter(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-400 uppercase tracking-wider block">Instagram</label>
                    <input
                      type="text"
                      placeholder="@handle"
                      value={stationInstagram}
                      onChange={(e) => setStationInstagram(e.target.value)}
                      className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs outline-none focus:border-rose-500 text-slate-200 transition"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Centered Single Save Button */}
        <div className="flex justify-center pt-2">
          <button 
            type="submit"
            disabled={isSavingProfile}
            className="px-8 py-3.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition uppercase tracking-wider cursor-pointer"
          >
            {isSavingProfile ? 'Saving Details...' : 'Save Station Details'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default StationProfile;
