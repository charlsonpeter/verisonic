import React from 'react';
import { Skeleton } from './Skeleton';

type TableSkeletonVariant = 'users' | 'tracks-admin' | 'tracks-studio' | 'generic';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  variant?: TableSkeletonVariant;
  showCheckbox?: boolean;
}

const VARIANT_HEADERS: Record<TableSkeletonVariant, string[]> = {
  users: ['Name / Email', 'Current Role', 'Subscription', 'Artist Request Details', 'Actions'],
  'tracks-admin': ['', 'Track Details', 'Acoustic Specs', 'Score', 'Status', 'Actions'],
  'tracks-studio': ['Track', 'Acoustic Specs', 'Score', 'Status', 'Uploaded', 'Play'],
  generic: [],
};

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  columns,
  variant = 'generic',
  showCheckbox,
}) => {
  const headers = VARIANT_HEADERS[variant];
  const colCount = columns ?? (headers.length || 5);
  const withCheckbox = showCheckbox ?? variant === 'tracks-admin';

  return (
    <table className="w-full text-left border-collapse text-xs">
      <thead>
        <tr className="border-b border-white/5 bg-slate-950/40 text-slate-400 uppercase font-bold tracking-wider">
          {headers.length > 0
            ? headers.map((header, idx) => (
                <th
                  key={idx}
                  className={`p-5 ${idx === 0 && withCheckbox ? 'w-10' : ''} ${
                    header === 'Actions' || header === 'Play' ? 'text-center' : ''
                  }`}
                >
                  {header ? (
                    header === '' && withCheckbox ? (
                      <Skeleton className="w-3.5 h-3.5 rounded" />
                    ) : (
                      <Skeleton className="h-3 w-20 inline-block" />
                    )
                  ) : null}
                </th>
              ))
            : Array.from({ length: colCount }).map((_, idx) => (
                <th key={idx} className="p-5">
                  <Skeleton className="h-3 w-20" />
                </th>
              ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <tr key={rowIdx}>
            {Array.from({ length: colCount }).map((__, colIdx) => (
              <td key={colIdx} className="p-5">
                {colIdx === 0 && withCheckbox ? (
                  <div className="flex items-start gap-3">
                    <Skeleton className="w-3.5 h-3.5 rounded flex-shrink-0 mt-0.5" />
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-2.5 w-24" />
                    </div>
                  </div>
                ) : colIdx === 0 && variant === 'users' ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-2.5 w-40" />
                  </div>
                ) : colIdx === 0 && variant === 'tracks-studio' ? (
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-2.5 w-24" />
                  </div>
                ) : (
                  <Skeleton className="h-3.5 w-16" />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
