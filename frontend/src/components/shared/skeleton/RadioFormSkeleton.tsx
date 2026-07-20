import React from 'react';
import { Skeleton } from './Skeleton';

export const RadioFormSkeleton: React.FC = () => (
  <div className="max-w-4xl w-full">
    <div className="glass-card p-6 rounded-3xl space-y-4 border border-rose-500/10">
      <Skeleton className="h-3 w-56" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, colIdx) => (
          <div key={colIdx} className="space-y-4">
            <Skeleton className="h-2.5 w-24 border-b border-white/5 pb-1" />
            {Array.from({ length: colIdx === 0 ? 7 : colIdx === 1 ? 5 : 5 }).map((__, fieldIdx) => (
              <div key={fieldIdx} className="space-y-1">
                <Skeleton className="h-2 w-20" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-40 rounded-xl" />
    </div>
  </div>
);
