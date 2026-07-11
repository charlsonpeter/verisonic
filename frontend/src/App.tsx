import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Volume2, VolumeX, Search, 
  ShieldCheck, Radio, BarChart2, Music, CheckCircle, 
  AlertTriangle, LogOut, User, Plus, Trash2, Heart, RefreshCw, Crown, Disc,
  Check, Ban
} from 'lucide-react';

// Context & providers
import { AuthProvider, useAuth } from './context/AuthContext';
import { AudioProvider, useAudio } from './context/AudioContext';

// Layout components
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { OptionalPanel } from './components/layout/OptionalPanel';

// Player controls
import { AudioPlayer } from './components/player/AudioPlayer';

// Shared UI
import { PremiumModal } from './components/shared/PremiumModal';
import { BannerHost } from './components/shared/BannerHost';
import { TrackRow } from './components/shared/TrackRow';
import { LyricsModal } from './components/shared/LyricsModal';

// Page components
import { LandingPage } from './pages/LandingPage';
import { Home } from './pages/Home';
import { Radio as RadioPage } from './pages/Radio';
import { Search as SearchPage } from './pages/Search';
import { Artist as ArtistPage } from './pages/Artist';
import { Playlist as PlaylistPage } from './pages/Playlist';
import { MusicDetails } from './pages/MusicDetails';
import { UserProfile } from './pages/UserProfile';
import { Favorites } from './pages/Favorites';
import { StationProfile } from './pages/StationProfile';
import { StudioProfile } from './pages/StudioProfile';
import { Settings } from './pages/Settings';
import { AuthPage } from './pages/AuthPage';
import { UsersManagement } from './pages/UsersManagement';
import { TracksManagement } from './pages/TracksManagement';
import { Contact } from './pages/Contact';
import { BroadcasterDownload } from './pages/BroadcasterDownload';
import { AdminAnalytics } from './pages/AdminAnalytics';

const API_URL = '/api';

// Headless UI Router Core
function DashboardContent() {
  const { currentUser, token, hasRadioStation } = useAuth();
  const { playTrack, playQueue, addToQueue, favorites } = useAudio();

  // Route/Tab Switcher state
  const [activeTab, setActiveTab] = useState<string>(() => {
    const hashTab = window.location.hash.replace('#', '');
    if (hashTab) return hashTab;
    const savedTab = localStorage.getItem('activeTab');
    const hasToken = localStorage.getItem('token');
    if (hasToken) {
      return savedTab && savedTab !== 'landing' ? savedTab : 'home';
    }
    return 'landing';
  });
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isQueueOpen, setIsQueueOpen] = useState<boolean>(false);
  const [isLyricsOpen, setIsLyricsOpen] = useState<boolean>(false);

  // Sync activeTab with localStorage & URL Hash
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    if (window.location.hash !== `#${activeTab}`) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  // Listen for hash changes (browser back/forward button clicks)
  useEffect(() => {
    const handleHashChange = () => {
      const hashTab = window.location.hash.replace('#', '');
      if (hashTab && hashTab !== activeTab) {
        setActiveTab(hashTab);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [activeTab]);

  // Handle logout redirect or invalid session redirect
  useEffect(() => {
    if (!token && activeTab !== 'auth') {
      setActiveTab('landing');
      localStorage.removeItem('activeTab');
    }
  }, [token, activeTab]);

  // Route protection redirect for Radio Admins who do NOT have a station yet
  useEffect(() => {
    if (currentUser && currentUser.role === 'radio_admin' && !hasRadioStation) {
      if (activeTab !== 'radio' && activeTab !== 'contact' && activeTab !== 'settings' && activeTab !== 'profile' && activeTab !== 'station-profile' && activeTab !== 'studio-profile' && activeTab !== 'broadcaster-download') {
        setActiveTab('radio');
      }
    }
  }, [currentUser, activeTab, hasRadioStation]);

  useEffect(() => {
    if (activeTab === 'discover') {
      setActiveTab('home');
    }
  }, [activeTab]);

  // Scroll main view container to top on tab change
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Selected details track state
  const [selectedDetailsTrack, setSelectedDetailsTrack] = useState<any | null>(null);
  
  // Quality Report states
  const [selectedReportTrack, setSelectedReportTrack] = useState<any | null>(null);
  const [activeReport, setActiveReport] = useState<any | null>(null);

  // Admin Analytics state
  const [analyticsData, setAnalyticsData] = useState<any | null>(null);

  // API fetches for Admin modules
  const fetchAnalytics = async () => {
    if (!currentUser || currentUser.role !== 'admin') return;
    try {
      const res = await fetch(`${API_URL}/analytics/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (e) {
      console.warn("Failed to fetch analytics:", e);
      setAnalyticsData(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'analytics') {
      fetchAnalytics();
    }
  }, [activeTab, currentUser]);

  const viewQualityReport = async (track: any) => {
    setSelectedReportTrack(track);
    setActiveTab('reports');
    try {
      const res = await fetch(`${API_URL}/music/${track.id}/quality`);
      if (res.ok) {
        const data = await res.json();
        setActiveReport(data);
      } else {
        throw new Error();
      }
    } catch (e) {
      console.warn('Failed to load quality report:', e);
      setActiveReport(null);
    }
  };

  const handleAdminApproveToggle = async (trackId: number, approve: boolean) => {
    try {
      const res = await fetch(`${API_URL}/music/${trackId}/approve?approved=${approve}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        if (selectedReportTrack && selectedReportTrack.id === trackId) {
          setSelectedReportTrack({ ...selectedReportTrack, approved: approve });
        }
      }
    } catch (e) {
      if (selectedReportTrack && selectedReportTrack.id === trackId) {
        setSelectedReportTrack({ ...selectedReportTrack, approved: approve });
      }
    }
  };

  const handleDetailsView = (track: any) => {
    setSelectedDetailsTrack(track);
    setActiveTab('details');
  };

  // Helper circle chart render
  const renderCircularProgress = (score: number) => {
    const radius = 55;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (score / 100) * circumference;
    const strokeColor = score >= 86 ? '#10b981' : score >= 71 ? '#06b6d4' : score >= 51 ? '#f59e0b' : '#ef4444';
    
    return (
      <div className="relative flex items-center justify-center">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle cx="64" cy="64" r={radius} stroke="#1e293b" strokeWidth="10" fill="transparent" />
          <circle 
            cx="64" cy="64" r={radius} 
            stroke={strokeColor} strokeWidth="10" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute text-center font-sans">
          <span className="text-3xl font-extrabold text-white">{score}</span>
          <span className="text-[10px] text-slate-400 block font-bold uppercase">Score</span>
        </div>
      </div>
    );
  };

  // Render matching switch page Tab panel
  const renderTabContent = () => {
    switch (activeTab) {
      case 'landing':
        return <LandingPage onNavigate={setActiveTab} />;
      case 'home':
        return <Home onNavigate={setActiveTab} onViewDetails={handleDetailsView} />;
      case 'radio':
        return <RadioPage />;
      case 'search':
        return (
          <SearchPage 
            onViewDetails={handleDetailsView}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        );
      case 'favorites':
        return <Favorites onViewDetails={handleDetailsView} />;
      case 'playlists':
        return <PlaylistPage onViewDetails={handleDetailsView} />;
      case 'details':
        return <MusicDetails track={selectedDetailsTrack} onNavigate={setActiveTab} />;
      case 'profile':
        return <UserProfile />;
      case 'station-profile':
        return <StationProfile onNavigate={setActiveTab} />;
      case 'studio-profile':
        return <StudioProfile />;
      case 'settings':
        return <Settings />;
      case 'users':
        return <UsersManagement />;
      case 'tracks':
        return <TracksManagement onViewReport={viewQualityReport} />;
      case 'contact':
        return <Contact />;
      case 'broadcaster-download':
        return <BroadcasterDownload />;
      case 'auth':
        return <AuthPage onSuccess={() => setActiveTab('home')} />;
      


      // Admin Spectrogram/Report Screen
      case 'reports':
        return (
          <div className="space-y-6 font-sans">
            <div className="hidden md:block">
              <h2 className="text-3xl font-extrabold tracking-tight text-white mb-1">Acoustic Reports</h2>
              <p className="text-sm text-slate-400">Cutoff ranges, spectral signatures, and upscaling warning results.</p>
            </div>

            {!selectedReportTrack ? (
              <div className="glass-card rounded-3xl p-16 text-center max-w-xl border border-white/10 shadow-2xl bg-gradient-to-br from-slate-950/60 to-slate-900/40 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-24 h-24 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />
                <ShieldCheck className="w-16 h-16 text-rose-400/60 mx-auto mb-5 animate-pulse" />
                <p className="text-slate-200 text-sm font-semibold tracking-wide font-sans mb-1">Telemetry Monitor Offline</p>
                <p className="text-slate-450 text-xs font-medium font-sans max-w-sm mx-auto leading-relaxed">Please select a track from the library or home feed and click its quality score badge to initialize acoustic metrics analysis.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-page-entry">
                
                {/* Left Column - Score Gauge & Spectrogram FFT Graph */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Score panel */}
                  <div className="bg-gradient-to-b from-slate-900/80 to-slate-950/90 border border-white/10 rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl relative overflow-hidden group hover:border-slate-700/60 transition duration-500">
                    <div className="absolute -top-16 -left-16 w-36 h-36 bg-rose-600/10 rounded-full blur-3xl pointer-events-none group-hover:bg-rose-600/15 transition-all duration-700" />
                    <h3 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-6 font-sans">Acoustic Score Gauge</h3>
                    
                    {renderCircularProgress(selectedReportTrack.quality_score || 0)}
                    
                    <div className="mt-6 text-center space-y-1">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">Quality Certification</span>
                      <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border shadow-md inline-block ${
                        selectedReportTrack.quality_level === 'Studio Quality' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-950/20' :
                        selectedReportTrack.quality_level === 'Good' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400 shadow-cyan-950/20' :
                        selectedReportTrack.quality_level === 'Average' ? 'bg-amber-500/10 border-amber-500/20 text-amber-405 shadow-amber-950/20' :
                        'bg-rose-500/10 border-rose-500/20 text-rose-455 shadow-rose-950/20'
                      }`}>
                        {selectedReportTrack.quality_level || 'Checking...'}
                      </span>
                    </div>
                  </div>

                  {/* Spectrogram plot */}
                  <div className="bg-gradient-to-b from-slate-900/80 to-slate-950/90 border border-white/10 rounded-3xl p-6 shadow-2xl hover:border-slate-700/60 transition duration-500">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        SPECTROGRAM DENSITY FFT PLOT (0s - 30s)
                      </h3>
                    </div>
                    {activeReport && activeReport.spectrogram_path ? (
                      <div className="border border-white/5 rounded-2xl overflow-hidden bg-slate-950 p-3 shadow-inner relative group">
                        <img src={activeReport.spectrogram_path} alt="Spectrogram" className="w-full h-auto object-contain max-h-[320px] rounded-xl mx-auto shadow-md" />
                        <div className="absolute inset-0 bg-slate-950/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none flex items-center justify-center">
                          <span className="text-[10px] bg-slate-900/90 text-slate-300 font-bold px-3 py-1.5 rounded-full border border-white/10">30s Spectral Sample Coordinates</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-16 text-slate-550 border border-dashed border-white/5 rounded-2xl bg-slate-950/20">
                        <AlertTriangle className="w-8 h-8 mb-2 animate-bounce" />
                        <p className="text-xs font-medium font-sans">Awaiting spectrogram plot rendering...</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column - Metrics and Specifications panel */}
                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-gradient-to-b from-slate-900/80 to-slate-950/90 border border-white/10 rounded-3xl p-6 space-y-6 shadow-2xl hover:border-slate-700/60 transition duration-500">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-[9px] bg-rose-500/10 text-rose-400 font-black px-2 py-0.5 rounded-full uppercase tracking-wider inline-block mb-1 border border-rose-500/20 font-sans">Track Telemetry Node</span>
                        <h3 className="text-2xl font-black text-white tracking-tight">{selectedReportTrack.title}</h3>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                        Acoustic Signature Specifications
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs bg-slate-950/70 p-4 border border-white/5 rounded-2xl shadow-inner font-sans">
                        <div className="flex justify-between border-b border-white/5 pb-1.5">
                          <span className="text-slate-500 font-medium">Codec Profile:</span>
                          <span className="font-bold text-slate-200">{selectedReportTrack.file_format || 'FLAC'}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1.5">
                          <span className="text-slate-500 font-medium">Sample Rate:</span>
                          <span className="font-bold text-slate-200">{selectedReportTrack.sample_rate ? `${selectedReportTrack.sample_rate.toLocaleString()} Hz` : '48,000 Hz'}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1.5">
                          <span className="text-slate-500 font-medium">PCM Bit Depth:</span>
                          <span className="font-bold text-slate-200">{selectedReportTrack.bit_depth ? `${selectedReportTrack.bit_depth}-bit` : '24-bit'}</span>
                        </div>
                        <div className="flex justify-between border-b border-white/5 pb-1.5 group items-center relative min-h-[28px]">
                          <span className="text-slate-500 font-medium">Status:</span>
                          <div className="flex items-center gap-1.5 relative">
                            <span className={`font-black uppercase text-[10px] tracking-wider px-2 py-0.5 rounded transition-all duration-200 ${
                              selectedReportTrack.approved 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:opacity-20' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:opacity-20'
                            }`}>
                              {selectedReportTrack.approved ? 'Approved' : 'Pending Approval'}
                            </span>
                            
                            {/* Hover-reveal action symbols for admins */}
                            {currentUser?.role === 'admin' && (
                              <div className="absolute inset-0 flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-auto">
                                {selectedReportTrack.approved ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAdminApproveToggle(selectedReportTrack.id, false);
                                    }}
                                    className="p-1 bg-rose-500/20 hover:bg-rose-500/40 border border-rose-500/30 rounded text-rose-455 hover:text-rose-300 transition shadow-lg cursor-pointer"
                                    title="Reject / Revoke Streaming"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAdminApproveToggle(selectedReportTrack.id, true);
                                    }}
                                    className="p-1 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/30 rounded text-emerald-400 hover:text-emerald-250 transition shadow-lg cursor-pointer"
                                    title="Approve Streaming"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {activeReport ? (
                      <div className="space-y-5">
                        <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest font-sans flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                          Validated Spectral Metrics
                        </h4>
                        <div className="space-y-4 text-xs bg-slate-950/70 p-5 border border-white/5 rounded-2xl shadow-inner leading-relaxed">
                          
                          {/* Metrics Grid */}
                          <div className="grid grid-cols-2 gap-4 font-sans">
                            <div className="flex justify-between border-b border-white/5 pb-1.5">
                              <span className="text-slate-500 font-medium">Spectral Cutoff (99%):</span>
                              <span className="font-bold text-slate-200">
                                {activeReport.cutoff_frequency 
                                  ? `${(activeReport.cutoff_frequency / 1000).toFixed(2)} kHz (${activeReport.cutoff_frequency.toFixed(0)} Hz)` 
                                  : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1.5">
                              <span className="text-slate-500 font-medium">Max Active Frequency:</span>
                              <span className="font-bold text-slate-200">
                                {activeReport.max_frequency 
                                  ? `${(activeReport.max_frequency / 1000).toFixed(2)} kHz (${activeReport.max_frequency.toFixed(0)} Hz)` 
                                  : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between border-b border-white/5 pb-1.5 col-span-2">
                              <span className="text-slate-500 font-medium">High-Frequency Energy Ratio (≥16kHz):</span>
                              <span className="font-bold text-slate-200">
                                {activeReport.high_frequency_energy !== undefined 
                                  ? `${(activeReport.high_frequency_energy * 100).toFixed(4)}%` 
                                  : '0%'}
                              </span>
                            </div>
                          </div>

                          {/* Visual Benchmark Comparison Meter */}
                          <div className="border-t border-white/5 pt-4 space-y-3 font-sans">
                            <h5 className="text-[9px] font-extrabold text-rose-455 uppercase tracking-wider">Acoustic Benchmark Comparison Meter</h5>
                            <div className="space-y-2">
                              <div className="flex justify-between text-[10px]">
                                <span className="font-bold text-slate-400">Validated Cutoff</span>
                                <span className={`font-black ${activeReport.cutoff_frequency >= 17000 ? 'text-emerald-455' : 'text-rose-455'}`}>
                                  {activeReport.cutoff_frequency ? `${(activeReport.cutoff_frequency / 1000).toFixed(2)} kHz` : 'N/A'}
                                </span>
                              </div>
                              <div className="h-3 bg-slate-950 rounded-full overflow-hidden border border-white/5 relative p-0.5 shadow-inner">
                                <div 
                                  className={`h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r shadow-[0_0_8px_rgba(244,63,94,0.3)] ${
                                    activeReport.cutoff_frequency >= 22000 ? 'from-emerald-600 to-teal-400 shadow-emerald-500/20' :
                                    activeReport.cutoff_frequency >= 17000 ? 'from-cyan-500 to-emerald-500 shadow-cyan-500/20' : 
                                    'from-rose-600 to-pink-500 shadow-rose-500/20'
                                  }`} 
                                  style={{ width: `${Math.min(100, (activeReport.cutoff_frequency / 24000) * 100)}%` }} 
                                />
                              </div>
                              <div className="grid grid-cols-4 gap-1 pt-1 text-[8px] text-slate-500 font-bold uppercase tracking-wider text-center font-sans">
                                <div>
                                  <div className="h-1 bg-slate-900 rounded-full mb-1" />
                                  <span>16kHz<br/>MP3 128k</span>
                                </div>
                                <div>
                                  <div className="h-1 bg-slate-900 rounded-full mb-1" />
                                  <span>20kHz<br/>MP3 320k</span>
                                </div>
                                <div>
                                  <div className="h-1 bg-slate-900 rounded-full mb-1" />
                                  <span>22kHz<br/>CD Quality</span>
                                </div>
                                <div>
                                  <div className="h-1 bg-slate-900 rounded-full mb-1" />
                                  <span>24kHz+<br/>Hi-Res Master</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Educational Help Definitions */}
                          <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl space-y-2.5 text-[10px] text-slate-400 leading-relaxed font-sans shadow-inner">
                            <p><strong>Cutoff Frequency:</strong> Original FLAC/WAV masters preserve high frequencies up to 22.05 kHz (CD) or higher. Lossy compressions (MP3/AAC) drop high bands to save space, revealing a sharp artificial cutoff boundary below 16-17 kHz.</p>
                            <p><strong>High-Frequency Energy:</strong> Studio recordings preserve harmonic details in high frequencies. Upscaled files (fake FLACs upscaled from low quality MP3s) show extremely low energy ratios in these bands.</p>
                          </div>

                          {/* Status Message Alert */}
                          <div className="border-t border-white/5 pt-3 flex items-start gap-2 text-[11px] leading-relaxed">
                            {activeReport.cutoff_frequency < 17000 ? (
                              <div className="text-rose-455 bg-rose-500/5 p-3.5 rounded-xl border border-rose-500/10 w-full flex items-start gap-2.5 shadow-md shadow-rose-950/10">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-500 animate-pulse" />
                                <span><strong>Upscaling Warning:</strong> High frequency cutoff detected below 17kHz. Audio signature matches lossy compression profiles. Original high frequency bands are missing.</span>
                              </div>
                            ) : (
                              <div className="text-emerald-400 bg-emerald-500/5 p-3.5 rounded-xl border border-emerald-500/10 w-full flex items-start gap-2.5 shadow-md shadow-emerald-950/10">
                                <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-455" />
                                <span><strong>Acoustic Integrity Verified:</strong> High-frequency distributions exceed CD quality cutoff benchmarks. Original recording integrity validated.</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-500">Retrieving spectral data...</p>
                    )}

                    {/* Admin actions moved inline to Status hover */}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      // Admin Analytics Dashboard
      case 'analytics':
        return <AdminAnalytics analyticsData={analyticsData} onLoad={fetchAnalytics} />;

      default:
        return <LandingPage onNavigate={setActiveTab} />;
    }
  };

  return (
    <div className="flex flex-1 min-h-0 h-[100dvh] max-h-[100dvh] w-full box-border pt-[env(safe-area-inset-top,0px)] bg-slate-950 text-slate-100 overflow-hidden font-sans select-none relative">
      {/* Background Blobs */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-rose-600/5 rounded-full blur-[110px] pointer-events-none animate-blob-1" />
      <div className="absolute top-1/3 right-1/4 w-[35rem] h-[35rem] bg-pink-600/5 rounded-full blur-[130px] pointer-events-none animate-blob-2" />
      
      {/* 2. Main content viewport */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full overflow-hidden">
        {activeTab !== 'landing' && (
          <Header 
            searchQuery={searchQuery} 
            setSearchQuery={setSearchQuery} 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            pageTitleOverride={
              activeTab === 'details' ? selectedDetailsTrack?.title ?? 'Track Details' : undefined
            }
          />
        )}
        
        <main
          ref={mainRef}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain md:pb-36 ${
            activeTab === 'landing'
              ? 'px-0 py-0'
              : 'px-6 md:px-8 max-md:py-3'
          }`}
        >
          <div key={activeTab} className="animate-page-entry w-full">
            {renderTabContent()}
          </div>
        </main>

        {/* Mobile bottom chrome — in document flow so content never scrolls behind */}
        <div className="md:hidden flex-shrink-0 pb-[env(safe-area-inset-bottom,0px)] bg-slate-950">
          <AudioPlayer 
            onToggleQueue={() => setIsQueueOpen(!isQueueOpen)} 
            isQueueOpen={isQueueOpen} 
            onToggleLyrics={() => setIsLyricsOpen(!isLyricsOpen)}
            isLyricsOpen={isLyricsOpen}
            activeTab={activeTab} 
          />
          {activeTab !== 'landing' && (
            <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} />
          )}
        </div>
      </div>

      {/* 3. Right Queue Drawer */}
      <OptionalPanel isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />

      {/* 3.5. Center Lyrics Modal */}
      <LyricsModal isOpen={isLyricsOpen} onClose={() => setIsLyricsOpen(false)} />

      {/* 4. Desktop audio player (fixed overlay) */}
      <div className="hidden md:block">
        <AudioPlayer 
          onToggleQueue={() => setIsQueueOpen(!isQueueOpen)} 
          isQueueOpen={isQueueOpen} 
          onToggleLyrics={() => setIsLyricsOpen(!isLyricsOpen)}
          isLyricsOpen={isLyricsOpen}
          activeTab={activeTab} 
        />
      </div>

      {/* 5. Mobile nav moved into viewport column above */}

      {/* 6. VIP Upgrade Modal Overlay */}
      <PremiumModal onNavigate={setActiveTab} />

      <BannerHost />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AudioProvider>
        <DashboardContent />
      </AudioProvider>
    </AuthProvider>
  );
}

export default App;
