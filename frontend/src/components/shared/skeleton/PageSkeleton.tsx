import React from 'react';
import { Skeleton } from './Skeleton';
import { TrackRowSkeleton } from './TrackRowSkeleton';

export const PageSkeleton: React.FC = () => (
  <div className="space-y-6 w-full animate-page-entry" aria-busy="true" aria-label="Loading page">
    <div className="hidden md:block space-y-2">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-3 w-72 max-w-full" />
    </div>
    <Skeleton className="h-14 w-full max-w-2xl rounded-3xl" />
    <TrackRowSkeleton count={6} borderless />
  </div>
);
