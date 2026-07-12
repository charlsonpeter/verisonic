import React from 'react';
import { Skeleton } from './Skeleton';

interface RadioCardSkeletonProps {
  count?: number;
}

export const RadioCardSkeleton: React.FC<RadioCardSkeletonProps> = ({ count = 2 }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="glass-card p-6 rounded-3xl border border-white/5 space-y-4"
      >
        <div className="flex items-center gap-4">
          <Skeleton className="w-14 h-14 rounded-2xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 max-w-[160px]" />
            <Skeleton className="h-3 w-full max-w-[220px]" />
          </div>
        </div>
        <Skeleton className="h-9 w-full rounded-xl" />
      </div>
    ))}
  </div>
);
