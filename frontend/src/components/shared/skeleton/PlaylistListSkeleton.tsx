import React from 'react';
import { Skeleton } from './Skeleton';

interface PlaylistListSkeletonProps {
  count?: number;
}

export const PlaylistListSkeleton: React.FC<PlaylistListSkeletonProps> = ({ count = 4 }) => (
  <ul className="divide-y divide-white/5">
    {Array.from({ length: count }).map((_, idx) => (
      <li key={idx} className="px-4 py-3 space-y-1.5">
        <Skeleton className="h-3.5 w-3/5 max-w-[140px]" />
        <Skeleton className="h-2.5 w-16" />
      </li>
    ))}
  </ul>
);
