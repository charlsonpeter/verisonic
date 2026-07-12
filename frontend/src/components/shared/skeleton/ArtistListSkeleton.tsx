import React from 'react';
import { Skeleton } from './Skeleton';

interface ArtistListSkeletonProps {
  count?: number;
}

export const ArtistListSkeleton: React.FC<ArtistListSkeletonProps> = ({ count = 4 }) => (
  <div className="hidden md:block space-y-4 bg-slate-950/40 backdrop-blur-md p-6 rounded-3xl shadow-inner">
    {Array.from({ length: count }).map((_, idx) => (
      <div key={idx} className="flex items-center gap-4 p-2 rounded-3xl">
        <Skeleton className="w-11 h-11 rounded-full flex-shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    ))}
  </div>
);
