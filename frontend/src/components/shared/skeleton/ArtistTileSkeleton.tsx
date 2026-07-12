import React from 'react';
import { Skeleton } from './Skeleton';

interface ArtistTileSkeletonProps {
  count?: number;
}

export const ArtistTileSkeleton: React.FC<ArtistTileSkeletonProps> = ({ count = 4 }) => (
  <div className="flex gap-3">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="flex-shrink-0 w-[5.5rem] text-center space-y-1.5">
        <Skeleton className="w-[5.5rem] aspect-square rounded-xl" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2 w-3/4 mx-auto" />
      </div>
    ))}
  </div>
);
