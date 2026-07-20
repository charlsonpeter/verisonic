import React from 'react';
import { Skeleton } from './Skeleton';
import { MOBILE_SCROLL_STRIP } from './layout';

export const RadioTileItemSkeleton: React.FC = () => (
  <div className="flex-shrink-0 w-[6.75rem] flex flex-col">
    <Skeleton className="w-full aspect-square rounded-xl mb-1.5 flex-shrink-0" />
    <Skeleton className="h-2.5 w-full" />
    <Skeleton className="h-[13px] w-4/5 mt-0.5" />
  </div>
);

interface RadioTileSkeletonProps {
  count?: number;
}

export const RadioTileSkeleton: React.FC<RadioTileSkeletonProps> = ({ count = 4 }) => (
  <div className={MOBILE_SCROLL_STRIP}>
    {Array.from({ length: count }).map((_, idx) => (
      <RadioTileItemSkeleton key={idx} />
    ))}
  </div>
);
