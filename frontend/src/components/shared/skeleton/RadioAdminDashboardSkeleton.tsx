import React from 'react';
import { Skeleton } from './Skeleton';

interface RadioAdminDashboardSkeletonProps {
  count?: number;
}

export const RadioAdminDashboardSkeleton: React.FC<RadioAdminDashboardSkeletonProps> = ({
  count = 1,
}) => (
  <div className="space-y-4 md:space-y-5 w-full">
    <Skeleton className="h-3 w-48" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="glass-card rounded-3xl border border-white/5 overflow-hidden flex flex-col"
        >
          <Skeleton className="h-1 w-full rounded-none" />
          <div className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Skeleton className="w-11 h-11 rounded-2xl flex-shrink-0" />
              <div className="space-y-1.5 min-w-0 flex-1">
                <Skeleton className="h-4 w-3/5 max-w-[160px]" />
                <Skeleton className="h-2.5 w-24" />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-10 h-10 rounded-xl" />
            </div>
          </div>
          <div className="mx-5 mb-4 bg-slate-950/60 border border-white/5 rounded-2xl px-4 py-3 space-y-1.5">
            <Skeleton className="h-2 w-16" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <div className="px-5 py-3 border-t border-white/5">
            <Skeleton className="h-2.5 w-32" />
          </div>
        </div>
      ))}
    </div>
  </div>
);
