import React from 'react';
import { Skeleton } from './Skeleton';

interface CardGridSkeletonProps {
  count?: number;
  columns?: 1 | 2;
}

export const CardGridSkeleton: React.FC<CardGridSkeletonProps> = ({
  count = 2,
  columns = 2,
}) => (
  <div
    className={`grid gap-6 items-start ${
      columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
    }`}
  >
    {Array.from({ length: count }).map((_, idx) => (
      <div
        key={idx}
        className="glass-card p-6 rounded-3xl border border-white/5 space-y-4 relative overflow-hidden"
      >
        <div className="flex justify-between items-start gap-4">
          <div className="space-y-2 flex-1 min-w-0">
            <Skeleton className="h-4 w-24 rounded-full" />
            <Skeleton className="h-5 w-3/5 max-w-[200px]" />
            <Skeleton className="h-3 w-full max-w-[280px]" />
            <Skeleton className="h-3 w-4/5 max-w-[240px]" />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="w-10 h-10 rounded-xl" />
          </div>
        </div>

        <div className="border-t border-white/5 pt-3 grid grid-cols-2 gap-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
        </div>

        <div className="flex gap-3 pt-2">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);
