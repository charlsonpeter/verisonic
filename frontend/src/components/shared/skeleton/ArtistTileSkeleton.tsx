import React from 'react';
import { Skeleton } from './Skeleton';
import { MOBILE_SCROLL_STRIP } from './layout';

interface ArtistTileItemSkeletonProps {
  className?: string;
}

export const ArtistTileItemSkeleton: React.FC<ArtistTileItemSkeletonProps> = ({
  className = '',
}) => (
  <div className={`flex-shrink-0 w-[5.5rem] text-center ${className}`}>
    <div className="w-[5.5rem] aspect-square rounded-xl bg-slate-800/40 mb-1.5 p-2.5 flex items-center justify-center">
      <Skeleton className="w-full h-full rounded-full" />
    </div>
    <Skeleton className="h-2.5 w-full mx-auto" />
    <Skeleton className="h-2 w-3/4 mx-auto mt-0" />
  </div>
);

interface ArtistTileSkeletonProps {
  count?: number;
  scrollable?: boolean;
}

export const ArtistTileSkeleton: React.FC<ArtistTileSkeletonProps> = ({
  count = 4,
  scrollable = true,
}) => {
  const tiles = Array.from({ length: count }).map((_, idx) => (
    <ArtistTileItemSkeleton key={idx} />
  ));

  if (scrollable) {
    return <div className={MOBILE_SCROLL_STRIP}>{tiles}</div>;
  }

  return <div className="flex gap-3">{tiles}</div>;
};
