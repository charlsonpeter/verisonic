import React from 'react';
import { User } from 'lucide-react';

export function getUserInitials(fullName?: string | null, email?: string): string {
  const name = (fullName || '').trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  const local = (email || '').split('@')[0];
  return local ? local.slice(0, 2).toUpperCase() : '';
}

interface UserAvatarProps {
  fullName?: string | null;
  email?: string;
  className?: string;
  fallbackIconClassName?: string;
  initialsClassName?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  fullName,
  email,
  className = 'w-8 h-8',
  fallbackIconClassName = 'w-4 h-4',
  initialsClassName = 'text-[10px]',
}) => {
  const initials = getUserInitials(fullName, email);

  return (
    <div
      className={`rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-300 font-bold flex-shrink-0 overflow-hidden ${className}`}
      aria-hidden
    >
      {initials ? (
        <span className={initialsClassName}>{initials}</span>
      ) : (
        <User className={fallbackIconClassName} />
      )}
    </div>
  );
};
