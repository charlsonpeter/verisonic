import React from 'react';
import { Skeleton } from './Skeleton';
import { MOBILE_SCROLL_STRIP } from './layout';
import { CompactTrackTileSkeleton } from './TrackTileSkeleton';

interface RecentlyPlayedSkeletonProps {
  count?: number;
}

export const RecentlyPlayedSkeleton: React.FC<RecentlyPlayedSkeletonProps> = ({
  count = 3,
}) => (
  <>
    <div className={MOBILE_SCROLL_STRIP}>
      {Array.from({ length: count }).map((_, idx) => (
        <CompactTrackTileSkeleton key={idx} />
      ))}
    </div>

    <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="flex bg-slate-900/20 rounded-3xl p-4 items-center gap-4"
        >
          <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-3/5 max-w-[160px]" />
            <Skeleton className="h-2.5 w-2/5 max-w-[120px]" />
          </div>
        </div>
      ))}
    </div>
  </>
);
