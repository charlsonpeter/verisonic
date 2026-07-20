import React from 'react';
import { Skeleton } from './Skeleton';
import { TrackRowSkeleton } from './TrackRowSkeleton';

export const PageSkeleton: React.FC = () => (
  <div className="space-y-6 md:space-y-8 w-full animate-page-entry" aria-busy="true" aria-label="Loading page">
    <div className="hidden md:block">
      <Skeleton className="h-9 w-48" />
    </div>
    <div className="hidden md:block space-y-2 bg-slate-950/40 backdrop-blur-md p-5 rounded-3xl shadow-inner">
      <TrackRowSkeleton count={6} borderless />
    </div>
    <div className="md:hidden space-y-3">
      <TrackRowSkeleton count={5} borderless />
    </div>
  </div>
);
