import React from 'react';
import { Skeleton } from './Skeleton';

interface CompactTrackTileSkeletonProps {
  className?: string;
}

export const CompactTrackTileSkeleton: React.FC<CompactTrackTileSkeletonProps> = ({
  className = '',
}) => (
  <div className={`flex-shrink-0 w-[6.75rem] space-y-0 ${className}`}>
    <Skeleton className="w-full aspect-square rounded-xl mb-1.5" />
    <Skeleton className="h-2.5 w-full" />
    <Skeleton className="h-2 w-4/5 mt-0" />
  </div>
);

interface TrackTileSkeletonProps {
  count?: number;
  compact?: boolean;
}

export const TrackTileSkeleton: React.FC<TrackTileSkeletonProps> = ({
  count = 6,
  compact = false,
}) => (
  <div className={`flex gap-3 ${compact ? 'flex-nowrap' : 'flex-wrap'}`}>
    {Array.from({ length: count }).map((_, idx) =>
      compact ? (
        <CompactTrackTileSkeleton key={idx} />
      ) : (
        <div
          key={idx}
          className="flex-shrink-0 w-full max-w-[8rem] space-y-2"
        >
          <Skeleton className="w-full aspect-square rounded-2xl mb-2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-2.5 w-4/5 mt-0.5" />
        </div>
      ),
    )}
  </div>
);
