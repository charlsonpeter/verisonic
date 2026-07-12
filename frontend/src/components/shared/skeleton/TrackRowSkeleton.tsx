import React from 'react';
import { Skeleton } from './Skeleton';

interface TrackRowSkeletonProps {
  count?: number;
  borderless?: boolean;
}

export const TrackRowSkeleton: React.FC<TrackRowSkeletonProps> = ({
  count = 5,
  borderless = false,
}) => (
  <div className="space-y-2">
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className={`group flex items-center gap-2 p-3 rounded-2xl ${
          borderless ? '' : 'bg-slate-900/15 border border-white/3'
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Skeleton className="w-5 md:w-6 h-4 flex-shrink-0" />
          <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/5 max-w-[180px]" />
            <Skeleton className="h-2.5 w-2/5 max-w-[120px]" />
          </div>
        </div>

        <Skeleton className="hidden md:block flex-1 max-w-[140px] h-3 mx-4" />

        <div className="flex md:hidden items-center gap-1 flex-shrink-0">
          <Skeleton className="h-2.5 w-8" />
          <Skeleton className="w-7 h-7 rounded-lg" />
        </div>

        <div className="hidden md:flex items-center gap-4 flex-shrink-0">
          <Skeleton className="h-2.5 w-8" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="w-7 h-7 rounded-lg" />
            <Skeleton className="w-7 h-7 rounded-lg" />
            <Skeleton className="w-7 h-7 rounded-lg" />
          </div>
        </div>
      </div>
    ))}
  </div>
);
