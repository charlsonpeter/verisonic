import React from 'react';
import { Compass, Radio, Search, Heart, FolderHeart, Music, Mail, Laptop } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab }) => {
  const { currentUser, isStaffInAdminMode, canUsePlaylists, token } = useAuth();

  const isRadioAdminInAdminMode =
    !!currentUser &&
    (currentUser.real_role || currentUser.role) === 'radio_admin' &&
    isStaffInAdminMode;

  const isStudioAdminInAdminMode =
    !!currentUser &&
    (currentUser.real_role || currentUser.role) === 'studio_admin' &&
    isStaffInAdminMode;

  const items = isRadioAdminInAdminMode
    ? [
        { id: 'radio', label: 'Radio', icon: Radio },
        { id: 'broadcaster-download', label: 'App', icon: Laptop },
        { id: 'contact', label: 'Contact', icon: Mail },
      ]
    : isStudioAdminInAdminMode
      ? [
          { id: 'track-list', label: 'Tracks', icon: Music },
          { id: 'contact', label: 'Contact', icon: Mail },
        ]
      : [
        { id: 'home', label: 'Home', icon: Compass },
        { id: 'radio', label: 'Radio', icon: Radio },
        { id: 'search', label: 'Search', icon: Search },
        { id: 'favorites', label: 'Favorites', icon: Heart },
        ...(canUsePlaylists || !token
          ? [{ id: 'playlists', label: 'Playlists', icon: FolderHeart }]
          : []),
      ];

  return (
    <nav className="relative flex-shrink-0 w-full h-16 bg-slate-950 border-t border-white/5 flex items-center justify-around z-20 md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className="flex flex-col items-center justify-center flex-1 py-1"
          >
            <Icon 
              className={`w-5.5 h-5.5 transition-all duration-300 ${
                isActive 
                  ? 'text-rose-400 scale-110' 
                  : 'text-slate-500 hover:text-slate-300'
              }`} 
            />
            <span 
              className={`text-[9px] mt-1 font-semibold uppercase tracking-wider ${
                isActive ? 'text-rose-400' : 'text-slate-500'
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
