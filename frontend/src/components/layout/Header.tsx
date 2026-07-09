import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, Crown, Signal, User, ShieldAlert, ChevronDown, 
  Compass, Music, Radio, Heart, FolderHeart, UploadCloud, 
  ShieldCheck, BarChart2, Settings, LogOut, Disc, Mail, Laptop
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  searchQuery, setSearchQuery, activeTab, setActiveTab 
}) => {
  const { currentUser, isPremium, logout, token, userMode, switchUserMode } = useAuth();
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

  const navItems = (currentUser && currentUser.role === 'radio_admin')
    ? [
        { id: 'radio', label: 'Radio Dashboard', icon: Radio },
        { id: 'broadcaster-download', label: 'Broadcaster App', icon: Laptop },
        { id: 'contact', label: 'Contact Us', icon: Mail }
      ]
    : [
        { id: 'home', label: 'Home Feed', icon: Compass },
        { id: 'discover', label: 'Discover Hub', icon: Music },
        { id: 'radio', label: 'Live Radio', icon: Radio },
        { id: 'search', label: 'Search', icon: Search },
        { id: 'favorites', label: 'Favorites', icon: Heart },
        { id: 'playlists', label: 'Playlists', icon: FolderHeart },
        { id: 'contact', label: 'Contact Us', icon: Mail }
      ];

  const handleDropdownSelect = (tab: string) => {
    setActiveTab(tab);
    setDropdownOpen(false);
  };

  return (
    <header className="px-8 py-4 flex items-center justify-between border-b border-white/5 bg-slate-950/45 backdrop-blur-md z-30 sticky top-0">
      
      {/* 1. Left: Brand Mark */}
      <div 
        className="flex items-center gap-2.5 cursor-pointer" 
        onClick={() => setActiveTab('landing')}
      >
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

      {/* 2. Center: Desktop Primary Navigation Link Tabs */}
      <nav className="hidden md:flex items-center gap-4 bg-slate-900/10 px-4 py-2 rounded-2xl border border-white/3">
        {navItems.map((nav) => {
          const Icon = nav.icon;
          const isActive = activeTab === nav.id;
          return (
            <button
              key={nav.id}
              onClick={() => setActiveTab(nav.id)}
              className={`flex items-center gap-1.5 px-1 py-1.5 text-xs font-extrabold transition-all duration-300 uppercase tracking-widest relative group ${
                isActive ? 'text-rose-400 font-extrabold' : 'text-slate-455 hover:text-slate-200'
              }`}
            >
              <Icon className={`w-4 h-4 transition ${isActive ? 'text-rose-400' : 'text-slate-500 group-hover:text-slate-350'}`} />
              <span>{nav.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500 to-pink-500 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.8)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* 3. Right: Search & Profile & telemetry status */}
      <div className="flex items-center gap-4">
        
        {/* Compact Search Trigger */}
        {activeTab !== 'search' && userMode !== 'admin' && (
          <div className="hidden lg:flex items-center gap-2 bg-slate-900/40 border border-white/5 rounded-xl px-3 py-1.5 hover:border-slate-800 transition duration-300 w-48">
            <Search className="w-4 h-4 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setActiveTab('search');
              }}
              className="bg-transparent text-xs text-slate-200 outline-none w-full placeholder-slate-505"
            />
          </div>
        )}
        {/* VIP badge */}
        {currentUser && userMode !== 'admin' && (
          !isPremium ? (
            <button 
              onClick={() => setActiveTab('settings')}
              className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-450 hover:to-yellow-500 text-slate-950 text-[10px] font-extrabold rounded-xl transition shadow-md shadow-amber-500/10 uppercase tracking-wide cursor-pointer"
            >
              <Crown className="w-3.5 h-3.5 fill-current" />
              Go VIP
            </button>
          ) : (
            <span className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-[9px] text-rose-400 font-extrabold uppercase">
              <Crown className="w-3.5 h-3.5 fill-current text-rose-400" />
              VIP Master
            </span>
          )
        )}

        {/* Mode Switcher */}
        {currentUser && ['admin', 'radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role) && (
          <div className="hidden sm:flex items-center select-none font-sans">
            <button
              onClick={() => {
                if (userMode === 'admin') {
                  switchUserMode('listener');
                  setActiveTab('home');
                } else {
                  switchUserMode('admin');
                  setActiveTab(currentUser.real_role === 'radio_admin' ? 'radio' : 'home');
                }
              }}
              className={`w-20 h-7 rounded-full p-0.5 transition-colors duration-300 outline-none cursor-pointer relative flex items-center ${
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
          <div className="flex items-center gap-3 relative" ref={dropdownRef}>
            
            {/* Profile Selector */}
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 p-1 bg-slate-900/50 hover:bg-slate-900 border border-white/5 rounded-2xl transition duration-305 outline-none"
            >
              <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                <User className="w-4 h-4" />
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${dropdownOpen ? 'rotate-180 text-white' : ''}`} />
            </button>

            {/* Dropdown Menu Overlay Card */}
            {dropdownOpen && (
              <div className="absolute right-0 top-11 w-56 bg-slate-900 border border-white/5 rounded-2xl p-2 shadow-2xl z-40 space-y-0.5 backdrop-blur-xl">
                
                {/* User info */}
                <div className="p-2.5 border-b border-white/3 mb-1.5">
                  <p className="text-xs font-bold text-slate-200 truncate">{currentUser.full_name}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{currentUser.email}</p>
                </div>

                {/* Mobile User Mode Switcher inside dropdown */}
                {currentUser && ['admin', 'radio_admin', 'studio_admin'].includes(currentUser.real_role || currentUser.role) && (
                  <div className="sm:hidden p-2 border-b border-white/3 mb-1 flex items-center justify-between font-sans select-none">
                    <span className="text-[8px] text-slate-550 font-bold uppercase tracking-wider block">Active Mode</span>
                    <button
                      onClick={() => {
                        if (userMode === 'admin') {
                          switchUserMode('listener');
                          handleDropdownSelect('home');
                        } else {
                          switchUserMode('admin');
                          handleDropdownSelect(currentUser.real_role === 'radio_admin' ? 'radio' : 'home');
                        }
                      }}
                      className={`w-20 h-7 rounded-full p-0.5 transition-colors duration-300 outline-none cursor-pointer relative flex items-center ${
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

                {currentUser && ['radio_admin', 'admin'].includes(currentUser.real_role || currentUser.role) && userMode === 'admin' && (
                  <button 
                    onClick={() => handleDropdownSelect('station-profile')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Radio className="w-4 h-4 text-slate-450" />
                    Station Profile
                  </button>
                )}

                {currentUser && ['studio_admin', 'admin'].includes(currentUser.real_role || currentUser.role) && (
                  <button 
                    onClick={() => handleDropdownSelect('studio-profile')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Disc className="w-4 h-4 text-slate-450" />
                    Studio Profile
                  </button>
                )}

                {currentUser && (currentUser.real_role || currentUser.role) !== 'radio_admin' && (
                  <button 
                    onClick={() => handleDropdownSelect('settings')}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-450 hover:bg-slate-800 hover:text-white transition"
                  >
                    <Settings className="w-4 h-4 text-slate-450" />
                    Platform Settings
                  </button>
                )}

                {/* Artist/Admin actions */}
                {(currentUser.role === 'studio_admin' || currentUser.role === 'admin') && (
                  <>
                    <button 
                      onClick={() => handleDropdownSelect('tracks')}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-455 hover:bg-slate-800 hover:text-white transition"
                    >
                      <UploadCloud className="w-4 h-4 text-slate-455" />
                      Upload & Manage Tracks
                    </button>
                  </>
                )}

                {currentUser.role === 'admin' && (
                  <>
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
          <button 
            onClick={() => setActiveTab('auth')}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow transition"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-white" />
            Enter Platform
          </button>
        )}

      </div>
    </header>
  );
};
