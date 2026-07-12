import React from 'react';
import { Skeleton } from './Skeleton';
import { RadioFormSkeleton } from './RadioFormSkeleton';
import { RadioAdminDashboardSkeleton } from './RadioAdminDashboardSkeleton';
import { RadioStationsSkeleton } from './RadioStationsSkeleton';

interface RadioPageSkeletonProps {
  isRadioAdmin?: boolean;
  hasStation?: boolean;
}

export const RadioPageSkeleton: React.FC<RadioPageSkeletonProps> = ({
  isRadioAdmin = false,
  hasStation = false,
}) => (
  <div className="space-y-6 md:space-y-10 w-full">
    <div className="hidden md:block">
      <Skeleton className="h-9 w-64" />
    </div>

    {isRadioAdmin ? (
      hasStation ? <RadioAdminDashboardSkeleton count={1} /> : <RadioFormSkeleton />
    ) : (
      <RadioStationsSkeleton tileCount={4} cardCount={2} />
    )}
  </div>
);
