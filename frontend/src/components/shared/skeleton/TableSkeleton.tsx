import React from 'react';
import { Skeleton } from './Skeleton';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  columns = 5,
}) => (
  <div className="p-5 space-y-4">
    <div className="flex gap-4 border-b border-white/5 pb-4">
      {Array.from({ length: columns }).map((_, idx) => (
        <Skeleton key={idx} className="h-3 flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, rowIdx) => (
      <div key={rowIdx} className="flex gap-4 items-center py-2">
        {Array.from({ length: columns }).map((_, colIdx) => (
          <Skeleton
            key={colIdx}
            className={`h-4 flex-1 ${colIdx === 0 ? 'max-w-[180px]' : ''}`}
          />
        ))}
      </div>
    ))}
  </div>
);
