import React from 'react';
import { Skeleton } from './Skeleton';

export const RadioCardItemSkeleton: React.FC = () => (
  <div className="glass-card rounded-3xl p-5 border border-white/5 bg-slate-900/10 relative overflow-hidden">
    <div className="flex items-start gap-5 relative z-10">
      <Skeleton className="w-24 h-24 rounded-2xl flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex justify-between items-start gap-2">
          <Skeleton className="h-4 w-3/5 max-w-[180px]" />
          <Skeleton className="h-5 w-20 rounded-full flex-shrink-0" />
        </div>
        <Skeleton className="h-3 w-full max-w-[240px]" />
        <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1.5">
          <Skeleton className="h-2 w-16" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-2.5 w-1/2" />
        </div>
      </div>
    </div>
    <div className="mt-4 pt-3.5 border-t border-white/5 flex items-center justify-between gap-3">
      <Skeleton className="h-2.5 w-28" />
      <Skeleton className="h-5 w-14 rounded-md" />
    </div>
  </div>
);

interface RadioCardSkeletonProps {
  count?: number;
}

export const RadioCardSkeleton: React.FC<RadioCardSkeletonProps> = ({ count = 2 }) => (
  <div className="hidden md:grid md:grid-cols-1 lg:grid-cols-2 gap-6">
    {Array.from({ length: count }).map((_, idx) => (
      <RadioCardItemSkeleton key={idx} />
    ))}
  </div>
);
