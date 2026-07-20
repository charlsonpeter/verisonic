import React from 'react';
import { RadioCardSkeleton } from './RadioCardSkeleton';
import { RadioTileSkeleton } from './RadioTileSkeleton';

interface RadioStationsSkeletonProps {
  tileCount?: number;
  cardCount?: number;
}

export const RadioStationsSkeleton: React.FC<RadioStationsSkeletonProps> = ({
  tileCount = 4,
  cardCount = 2,
}) => (
  <>
    <RadioTileSkeleton count={tileCount} />
    <RadioCardSkeleton count={cardCount} />
  </>
);
