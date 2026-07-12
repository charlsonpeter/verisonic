import React from 'react';
import { Skeleton } from './Skeleton';

interface TrackCardSkeletonProps {
  count?: number;
  withCheckbox?: boolean;
  withPlayButton?: boolean;
}

export const TrackCardSkeleton: React.FC<TrackCardSkeletonProps> = ({
  count = 4,
  withCheckbox = false,
  withPlayButton = true,
}) => (
  <>
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
      >
        <div className="flex items-start gap-3">
          {withCheckbox && <Skeleton className="w-4 h-4 rounded mt-0.5 flex-shrink-0" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-3/5 max-w-[180px]" />
            <Skeleton className="h-2.5 w-2/5 max-w-[120px]" />
            <Skeleton className="h-2.5 w-1/3 max-w-[100px]" />
          </div>
          {withPlayButton && <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />}
        </div>

        <div className="space-y-1">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-2.5 w-36" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-5 w-12 rounded" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
      </div>
    ))}
  </>
);
