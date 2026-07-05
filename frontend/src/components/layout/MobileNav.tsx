import React from 'react';
import { Compass, Radio, Search, Heart, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab }) => {
  const { currentUser } = useAuth();

  const items = (currentUser && currentUser.role === 'radio_admin')
    ? [
        { id: 'radio', label: 'Radio', icon: Radio },
        { id: 'profile', label: 'Profile', icon: User }
      ]
    : [
        { id: 'home', label: 'Home', icon: Compass },
        { id: 'radio', label: 'Radio', icon: Radio },
        { id: 'search', label: 'Search', icon: Search },
        { id: 'favorites', label: 'Favorites', icon: Heart },
        { id: 'profile', label: 'Profile', icon: User }
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 border-t border-white/5 flex items-center justify-around z-20 md:hidden backdrop-blur-lg">
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
