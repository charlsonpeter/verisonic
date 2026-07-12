import React from 'react';
import { Skeleton } from './Skeleton';

export const WalletSkeleton: React.FC = () => (
  <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 min-h-0 items-stretch">
    <div className="lg:col-span-6 flex flex-col min-h-[280px] rounded-2xl border border-white/10 bg-slate-900/40 p-5 space-y-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="flex-1 min-h-[200px] w-full rounded-xl" />
    </div>
    <div className="lg:col-span-4 rounded-2xl border border-white/10 bg-slate-900/40 p-5 flex flex-col min-h-[280px] space-y-3">
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="flex gap-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-14 ml-auto" />
        </div>
      ))}
    </div>
    <div className="lg:col-span-2 flex flex-col gap-4 min-h-[280px]">
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-2">
        <Skeleton className="h-2.5 w-24 ml-auto" />
        <Skeleton className="h-8 w-28 ml-auto" />
      </div>
      <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-full" />
        <Skeleton className="h-2.5 w-4/5" />
      </div>
    </div>
  </div>
);
