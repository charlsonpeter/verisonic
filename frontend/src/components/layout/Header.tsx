import React, { useState, useRef, useEffect } from 'react';
import { 
  Crown, Signal, User, ChevronDown,
  Compass, Radio, Heart, FolderHeart, UploadCloud,
  ShieldCheck, BarChart2, Settings, LogOut, Disc, Mail, Laptop, Music, Wallet, Landmark,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useAudio } from '../../context/AudioContext';
import { getPageTitle } from '../../utils/pageTitles';
import { getAccountTierLabel, hasPaidSubscription, isOnFreeTrial } from '../../utils/accountTier';
import { HeaderSearch } from './HeaderSearch';
import { UserAvatar } from '../shared/UserAvatar';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedSearchArtist: string | null;
  setSelectedSearchArtist: (artist: string | null) => void;
  setSelectedSearchAlbum: (album: string | null) => void;
  setSelectedSearchPlaylistId: (id: number | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pageTitleOverride?: string | null;
  onOpenArtistPage?: (artistName: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  searchQuery, setSearchQuery, selectedSearchArtist, setSelectedSearchArtist,
  setSelectedSearchAlbum, setSelectedSearchPlaylistId,
  activeTab, setActiveTab, pageTitleOverride, onOpenArtistPage,
}) => {
  const { currentUser, logout, token, userMode, switchUserMode, isSwitchingMode, isStaffInAdminMode, canUsePlaylists, canAccessPlatformSettings, canAccessStationProfile } = useAuth();
  const { setShowPremiumModal } = useAudio();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown if clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const isRadioAdminInAdminMode =
    !!currentUser &&
    (currentUser.real_role || currentUser.role) === 'radio_admin' &&
    isStaffInAdminMode;

  const isStudioAdminInAdminMode =
    !!currentUser &&
    (currentUser.real_role || currentUser.role) === 'studio_admin' &&
    isStaffInAdminMode;

  const isPaidSubscriber = hasPaidSubscription(currentUser);
  const isOnTrial = isOnFreeTrial(currentUser);
  const tierLabel = getAccountTierLabel(currentUser);

  const isPlatformAdmin = currentUser?.role === 'admin';
  const contactNavItem = { id: 'contact', label: 'Contact Us', icon: Mail };

  const navItems = isRadioAdminInAdminMode
    ? [
        { id: 'radio', label: 'Radio Stations', icon: Radio },
        { id: 'broadcaster-download', label: 'Broadcaster App', icon: Laptop },
        ...(!isPlatformAdmin ? [contactNavItem] : []),
      ]
    : isStudioAdminInAdminMode
      ? [
          { id: 'track-list', label: 'Tracks List', icon: Music },
          ...(!isPlatformAdmin ? [contactNavItem] : []),
        ]
      : [
        { id: 'home', label: 'Home Feed', icon: Compass },
        { id: 'radio', label: 'Radio Stations', icon: Radio },
        ...(isPlatformAdmin ? [{ id: 'engagements', label: 'Engagements', icon: Music }] : []),
        { id: 'favorites', label: 'Favorites', icon: Heart },
        ...(canUsePlaylists || !token ? [{ id: 'playlists', label: 'Playlists', icon: FolderHeart }] : []),
        ...(isPlatformAdmin ? [
          { id: 'accounts', label: 'Accounts', icon: Landmark },
        ] : []),
        ...(!isPlatformAdmin ? [contactNavItem] : []),
      ];

  const handleDropdownSelect = (tab: string) => {
    setActiveTab(tab);
    setDropdownOpen(false);
  };

  const handleLogoClick = () => {
    if (currentUser && isStaffInAdminMode) {
      const role = currentUser.real_role || currentUser.role;
      if (role === 'radio_admin') setActiveTab('radio');
      else if (role === 'studio_admin') setActiveTab('track-list');
      else setActiveTab('home');
      return;
    }
    setActiveTab('home');
  };

  const mobilePageTitle =
    pageTitleOverride !== undefined
      ? pageTitleOverride
      : getPageTitle(activeTab, { currentUser, userMode });

  return (
    <header className="relative flex-shrink-0 px-4 md:px-5 lg:px-8 py-2.5 md:py-3 lg:py-4 min-h-[3rem] md:min-h-0 flex items-center justify-between gap-2 border-b border-white/5 bg-slate-950 md:bg-slate-950/45 md:backdrop-blur-md z-30">
      
      {mobilePageTitle && (
        <h1 className="md:hidden absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[15px] font-bold text-white truncate max-w-[50vw] pointer-events-none text-center tracking-tight">
          {mobilePageTitle}
        </h1>
      )}

      {/* 1. Left: Brand Mark */}
      <div 
        className="relative z-10 flex-shrink-0 cursor-pointer" 
        onClick={handleLogoClick}
      >
        {/* Mobile — compact app icon */}
        <div className="md:hidden w-9 h-9 rounded-full bg-slate-900/70 border border-white/8 flex items-center justify-center active:scale-95 transition-transform">
          <Radio className="w-[18px] h-[18px] text-rose-400" />
        </div>

        {/* Desktop — full brand */}
        <div className="hidden md:flex items-center gap-2.5">
          <div className="bg-gradient-to-tr from-rose-600 via-rose-500 to-pink-600 p-2 rounded-xl shadow-lg border border-white/10 flex items-center justify-center">
            <Radio className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div className="hidden lg:block">
            <h1 className="text-base font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400 font-sans tracking-tight leading-none">
              VeriSonic
            </h1>
            <span className="text-[8px] text-rose-400 font-extrabold uppercase tracking-wider block mt-0.5">Studio Master</span>
          </div>
        </div>
      </div>

      {/* 2. Center: Desktop / tablet nav — icon-only until lg */}
      <nav className="hidden md:flex items-center gap-1 lg:gap-4 bg-slate-900/10 px-2 lg:px-4 py-1.5 lg:py-2 rounded-2xl border border-white/3 min-w-0 flex-shrink">
        {navItems.map((nav) => {
          const Icon = nav.icon;
          const isActive = activeTab === nav.id;
          return (
            <button
              key={nav.id}
              onClick={() => setActiveTab(nav.id)}
              title={nav.label}
              aria-label={nav.label}
              className={`flex items-center gap-1.5 px-1.5 lg:px-1 py-1.5 text-xs font-extrabold transition-all duration-300 uppercase tracking-widest relative group flex-shrink-0 ${
                isActive ? 'text-rose-400 font-extrabold' : 'text-slate-455 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 transition ${isActive ? 'text-rose-400' : 'text-slate-500 group-hover:text-slate-350'}`} />
              <span className="hidden lg:inline">{nav.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. Right: Search & Profile & telemetry status */}
      <div className="relative z-10 flex items-center gap-3 md:gap-4 flex-shrink-0 ml-auto">
        
        {/* Compact Search — dropdown preview; full page via "Search all" */}
        {activeTab !== 'search' && !isStaffInAdminMode && (
          <HeaderSearch
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setSelectedArtist={setSelectedSearchArtist}
            setSelectedAlbum={setSelectedSearchAlbum}
            setSelectedPlaylistId={setSelectedSearchPlaylistId}
            setActiveTab={setActiveTab}
            onOpenArtistPage={onOpenArtistPage}
          />
        )}
        {/* VIP badge */}
        {currentUser && !isStaffInAdminMode && (
          isPaidSubscriber ? (
            <>
              <span
                title={tierLabel}
                className="hidden md:flex lg:hidden items-center justify-center w-8 h-8 bg-rose-500/10 border border-rose-500/20 rounded-full text-rose-400"
              >
                <Crown className="w-3.5 h-3.5 fill-current" />
              </span>
              <span className="hidden lg:flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-[9px] text-rose-400 font-extrabold uppercase">
                <Crown className="w-3.5 h-3.5 fill-current text-rose-400" />
                {tierLabel}
              </span>
            </>
          ) : isOnTrial ? (
            <>
              <span
                title={tierLabel}
                className="hidden md:flex lg:hidden items-center justify-center w-8 h-8 bg-amber-500/10 border border-amber-500/20 rounded-full text-amber-400"
              >
                <Crown className="w-3.5 h-3.5 fill-current" />
              </span>
              <span className="hidden lg:flex items-center gap-1 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[9px] text-amber-400 font-extrabold uppercase">
                <Crown className="w-3.5 h-3.5 fill-current text-amber-400" />
                {tierLabel}
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setShowPremiumModal(true)}
                title="Go VIP"
                aria-label="Go VIP"
                className="hidden md:flex lg:hidden items-center justify-center w-8 h-8 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-950 rounded-xl transition shadow-md shadow-amber-500/10 cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 fill-current" />
              </button>
              <button 
                type="button"
                onClick={() => setShowPremiumModal(true)}
                className="hidden lg:flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-450 hover:to-yellow-500 text-slate-950 text-[10px] font-extrabold rounded-xl transition shadow-md shadow-amber-500/10 uppercase tracking-wide cursor-pointer"
              >
                <Crown className="w-3.5 h-3.5 fill-current" />
                Go VIP
              </button>
            </>
          )
        )}

        {/* Mode Switcher */}
        {currentUser && ['radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role) && (
          <div className="hidden md:flex items-center select-none font-sans flex-shrink-0">
            <button
              type="button"
              disabled={isSwitchingMode}
              onClick={async () => {
                if (isSwitchingMode) return;
                if (userMode === 'admin') {
                  const ok = await switchUserMode('listener');
                  if (ok) setActiveTab('home');
                } else {
                  const ok = await switchUserMode('admin');
                  if (ok) {
                    const role = currentUser.real_role || currentUser.role;
                    setActiveTab(role === 'radio_admin' ? 'radio' : role === 'studio_admin' ? 'track-list' : 'home');
                  }
                }
              }}
              className={`w-20 h-7 rounded-full p-0.5 transition-colors duration-300 outline-none cursor-pointer relative flex items-center disabled:opacity-60 disabled:cursor-wait ${
                userMode === 'admin' ? 'bg-rose-600 shadow-md shadow-rose-600/15' : 'bg-slate-800'
              }`}
            >
              {/* Text label inside the track */}
              {userMode === 'admin' ? (
                <span className="absolute left-1.5 w-12 text-center text-[8.5px] font-black text-white uppercase tracking-wider transition-opacity duration-300">
                  Admin
                </span>
              ) : (
                <span className="absolute right-1.5 w-12 text-center text-[8.5px] font-black text-slate-400 uppercase tracking-wider transition-opacity duration-300">
                  Listen
                </span>
              )}
              {/* Sliding dot */}
              <div 
                className="w-6 h-6 bg-white rounded-full shadow absolute transition-all duration-300 ease-out"
                style={{
                  left: userMode === 'admin' ? '54px' : '2px',
                  top: '2px'
                }}
              />
            </button>
          </div>
        )}

        {/* User Account trigger dropdown */}
        {currentUser ? (
          <div className="relative" ref={dropdownRef}>
            
            {/* Mobile — avatar only */}
            <button 
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="md:hidden active:scale-95 transition-transform outline-none"
              aria-label="Account menu"
            >
              <UserAvatar
                fullName={currentUser.full_name}
                email={currentUser.email}
                imageUrl={currentUser.profile_image_url}
                className="w-9 h-9"
                fallbackIconClassName="w-[18px] h-[18px]"
                initialsClassName="text-[11px]"
              />
            </button>

            {/* Desktop — profile with chevron */}
            <button 
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="hidden md:flex items-center gap-1.5 p-1 bg-slate-900/50 hover:bg-slate-900 border border-white/5 rounded-2xl transition duration-305 outline-none"
            >
              <UserAvatar
                fullName={currentUser.full_name}
                email={currentUser.email}
                imageUrl={currentUser.profile_image_url}
                className="w-8 h-8"
              />
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180 text-white' : ''}`} />
            </button>

            {/* Dropdown Menu Overlay Card */}
            {dropdownOpen && (
              <div className="absolute right-0 top-10 md:top-11 w-56 bg-slate-900 border border-white/5 rounded-2xl p-2 shadow-2xl z-40 space-y-0.5 md:backdrop-blur-xl">
                
                {/* User info */}
                <div className="p-2.5 border-b border-white/3 mb-1.5 flex items-center gap-2.5">
                  <UserAvatar
                    fullName={currentUser.full_name}
                    email={currentUser.email}
                    imageUrl={currentUser.profile_image_url}
                    className="w-9 h-9"
                    initialsClassName="text-[11px]"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-200 truncate">{currentUser.full_name}</p>
                    <p className="text-[10px] text-slate-500 truncate mt-0.5">{currentUser.email}</p>
                  </div>
                </div>

                {/* Mobile User Mode Switcher inside dropdown */}
                {currentUser && ['radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role) && (
                  <div className="md:hidden p-2 border-b border-white/3 mb-1 flex items-center justify-between font-sans select-none">
                    <span className="text-[8px] text-slate-550 font-bold uppercase tracking-wider block">Active Mode</span>
                    <button
                      type="button"
                      disabled={isSwitchingMode}
                      onClick={async () => {
                        if (isSwitchingMode) return;
                        if (userMode === 'admin') {
                          const ok = await switchUserMode('listener');
                          if (ok) handleDropdownSelect('home');
                        } else {
                          const ok = await switchUserMode('admin');
                          if (ok) {
                            const role = currentUser.real_role || currentUser.role;
                            handleDropdownSelect(role === 'radio_admin' ? 'radio' : role === 'studio_admin' ? 'track-list' : 'home');
                          }
                        }
                      }}
                      className={`w-20 h-7 rounded-full p-0.5 transition-colors duration-300 outline-none cursor-pointer relative flex items-center disabled:opacity-60 disabled:cursor-wait ${
                        userMode === 'admin' ? 'bg-rose-600 shadow-md shadow-rose-600/15' : 'bg-slate-800'
                      }`}
                    >
                      {/* Text label inside the track */}
                      {userMode === 'admin' ? (
                        <span className="absolute left-1.5 w-12 text-center text-[8.5px] font-black text-white uppercase tracking-wider transition-opacity duration-300">
                          Admin
                        </span>
                      ) : (
                        <span className="absolute right-1.5 w-12 text-center text-[8.5px] font-black text-slate-400 uppercase tracking-wider transition-opacity duration-300">
                          Listen
                        </span>
                      )}
                      {/* Sliding dot */}
                      <div 
                        className="w-6 h-6 bg-white rounded-full shadow absolute transition-all duration-300 ease-out"
                        style={{
                          left: userMode === 'admin' ? '54px' : '2px',
                          top: '2px'
                        }}
                      />
                    </button>
                  </div>
                )}

                <button 
                  onClick={() => handleDropdownSelect('profile')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                >
                  <User className="w-4 h-4 text-slate-450" />
                  My Profile
                </button>

                {(isStudioAdminInAdminMode || isRadioAdminInAdminMode) && (
                  <button
                    onClick={() => handleDropdownSelect('wallet')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Wallet className="w-4 h-4 text-slate-450" />
                    My Wallet
                  </button>
                )}

                {currentUser && canAccessStationProfile && (
                  <button 
                    onClick={() => handleDropdownSelect('station-profile')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Radio className="w-4 h-4 text-slate-450" />
                    {(currentUser.real_role || currentUser.role) === 'admin' ? 'Radio Stations' : 'Station Profile'}
                  </button>
                )}

                {(currentUser?.real_role || currentUser?.role) === 'admin' || isStudioAdminInAdminMode ? (
                  <button 
                    onClick={() => handleDropdownSelect('studio-profile')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Disc className="w-4 h-4 text-slate-450" />
                    {(currentUser.real_role || currentUser.role) === 'admin' ? 'Music Studios' : 'Studio Profile'}
                  </button>
                ) : null}

                {((currentUser?.real_role || currentUser?.role) === 'admin' || isStudioAdminInAdminMode) && (
                  <button 
                    onClick={() => handleDropdownSelect('tracks')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-455 hover:bg-slate-800 hover:text-white transition"
                  >
                    <UploadCloud className="w-4 h-4 text-slate-455" />
                    Upload & Manage Tracks
                  </button>
                )}

                {currentUser.role === 'admin' && (
                  <>
                    <button
                      onClick={() => handleDropdownSelect('engagements')}
                      className="md:hidden w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                    >
                      <Music className="w-4 h-4 text-slate-450" />
                      Engagements
                    </button>
                    <button 
                      onClick={() => handleDropdownSelect('analytics')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                    >
                      <BarChart2 className="w-4 h-4 text-slate-450" />
                      Admin Analytics
                    </button>
                    <button 
                      onClick={() => handleDropdownSelect('users')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                    >
                      <User className="w-4 h-4 text-slate-450" />
                      Manage Users
                    </button>
                  </>
                )}

                {isPlatformAdmin && (
                  <button
                    onClick={() => handleDropdownSelect('accounts')}
                    className="md:hidden w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Landmark className="w-4 h-4 text-slate-450" />
                    Accounts
                  </button>
                )}

                {currentUser && canAccessPlatformSettings && (
                  <button 
                    onClick={() => handleDropdownSelect('settings')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Settings className="w-4 h-4 text-slate-450" />
                    Settings
                  </button>
                )}

                <div className="border-t border-white/3 my-1.5" />

                <button 
                  onClick={() => { logout(); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 hover:text-rose-350 transition"
                >
                  <LogOut className="w-4 h-4 text-rose-455" />
                  Sign Out
                </button>

              </div>
            )}

          </div>
        ) : (
          <>
            <button 
              type="button"
              onClick={() => setActiveTab('auth')}
              className="w-9 h-9 rounded-full bg-slate-900/70 border border-white/8 flex items-center justify-center active:scale-95 transition-transform md:hidden"
              aria-label="Sign in"
            >
              <User className="w-[18px] h-[18px] text-slate-400" />
            </button>
          </>
        )}

      </div>
    </header>
  );
};
