import React from 'react';
import { Skeleton } from './Skeleton';

interface UserCardSkeletonProps {
  count?: number;
}

export const UserCardSkeleton: React.FC<UserCardSkeletonProps> = ({ count = 4 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="rounded-2xl border border-white/5 bg-slate-900/20 p-4 space-y-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5 max-w-[160px]" />
            <Skeleton className="h-3 w-4/5 max-w-[200px]" />
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <Skeleton className="w-8 h-8 rounded-xl" />
            <Skeleton className="w-8 h-8 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    ))}
  </div>
);
