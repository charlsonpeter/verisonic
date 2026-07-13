import React from 'react';
import { Search } from 'lucide-react';

export const ListSearchInput = ({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) => (
  <div className={`relative w-[28rem] max-w-full shrink-0 ${className}`}>
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-white/5 rounded-xl outline-none focus:border-rose-500 text-slate-200 transition text-xs"
    />
  </div>
);
