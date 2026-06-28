import React from 'react';
import { 
  Music, Radio, Search, Compass, Heart, FolderHeart, 
  UploadCloud, ShieldCheck, BarChart2, Settings, User, LogOut, Disc
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const { currentUser, logout, token } = useAuth();

  const navItems = [
    { id: 'landing', label: 'Overview', icon: Disc },
    { id: 'home', label: 'Home Feed', icon: Compass },
    { id: 'discover', label: 'Discover Hub', icon: Music },
    { id: 'radio', label: 'Live Radio', icon: Radio },
    { id: 'search', label: 'Search', icon: Search },
    { id: 'favorites', label: 'My Favorites', icon: Heart },
    { id: 'playlists', label: 'Playlists', icon: FolderHeart },
  ];

  const creatorItems = [
    { id: 'tracks', label: 'Upload & Manage Tracks', icon: UploadCloud },
  ];

  const adminItems = [
    { id: 'analytics', label: 'System Analytics', icon: BarChart2 },
    { id: 'users', label: 'Manage Users', icon: User },
  ];

  const settingsItems = [
    { id: 'profile', label: 'User Profile', icon: User },
    { id: 'settings', label: 'Platform Settings', icon: Settings },
  ];

  const renderNavButton = (item: { id: string; label: string; icon: any }) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-sm font-medium ${
          isActive 
            ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-lg shadow-rose-600/20' 
            : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
        }`}
      >
        <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
        <span>{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="w-72 glass-card flex flex-col justify-between z-10 border-r border-white/5 h-screen overflow-y-auto">
      <div>
        {/* Brand Header */}
        <div className="p-6 flex items-center gap-3 border-b border-white/5 cursor-pointer" onClick={() => setActiveTab('landing')}>
          <div className="bg-gradient-to-tr from-rose-600 via-rose-500 to-pink-600 p-2.5 rounded-2xl shadow-lg shadow-rose-600/30 border border-white/10">
            <Radio className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400 font-sans tracking-tight">
              VeriSonic
            </h1>
            <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Hi-Fi Audio Platform</p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="p-4 space-y-6">
          <div>
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Navigation</p>
            <div className="space-y-1">
              {navItems.map(renderNavButton)}
            </div>
          </div>

          {/* Artist Upload Panel */}
          {token && currentUser && (currentUser.role === 'studio_admin' || currentUser.role === 'admin') && (
            <div>
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Studio Space</p>
              <div className="space-y-1">
                {creatorItems.map(renderNavButton)}
              </div>
            </div>
          )}

          {/* Admin Tools Panel */}
          {token && currentUser && currentUser.role === 'admin' && (
            <div>
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Management</p>
              <div className="space-y-1">
                {adminItems.map(renderNavButton)}
              </div>
            </div>
          )}

          {/* User Settings */}
          <div>
            <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Configuration</p>
            <div className="space-y-1">
              {settingsItems.map(renderNavButton)}
            </div>
          </div>
        </div>
      </div>

      {/* Authentication Info Panel at bottom */}
      <div className="p-4 border-t border-white/5 bg-slate-950/20">
        {token && currentUser ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="bg-slate-800/45 p-2 rounded-xl border border-white/5">
                <User className="w-5 h-5 text-rose-400" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold truncate text-slate-200">{currentUser.full_name}</p>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 font-bold px-2 py-0.5 rounded-full uppercase">
                  {currentUser.role}
                </span>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-slate-900 hover:bg-rose-950/40 border border-white/5 text-xs text-rose-400 font-semibold rounded-xl transition duration-300"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        ) : (
          <div className="p-2 text-center">
            <p className="text-xs text-slate-400 mb-3">Login to access high fidelity streaming controls</p>
            <button 
              onClick={() => setActiveTab('auth')}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition duration-300 shadow-md shadow-rose-600/10"
            >
              Log In / Register
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
