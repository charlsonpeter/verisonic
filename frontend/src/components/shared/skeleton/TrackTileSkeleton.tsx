import React from 'react';
import { Skeleton } from './Skeleton';

interface TrackTileSkeletonProps {
  count?: number;
  compact?: boolean;
}

export const TrackTileSkeleton: React.FC<TrackTileSkeletonProps> = ({
  count = 6,
  compact = false,
}) => (
  <div className={`flex gap-3 ${compact ? 'flex-nowrap' : 'flex-wrap'}`}>
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className={`flex-shrink-0 space-y-2 ${compact ? 'w-[6.75rem]' : 'w-[calc(33.333%-0.5rem)] min-w-[5.5rem]'}`}
      >
        <Skeleton className={`w-full aspect-square ${compact ? 'rounded-xl' : 'rounded-2xl'}`} />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2 w-4/5" />
      </div>
    ))}
  </div>
);
