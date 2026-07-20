import React from 'react';
import { MOBILE_SCROLL_STRIP, MOBILE_GRID_PAGE } from './layout';
import { CompactTrackTileSkeleton } from './TrackTileSkeleton';

interface TrendingMobileSkeletonProps {
  tileCount?: number;
}

export const TrendingMobileSkeleton: React.FC<TrendingMobileSkeletonProps> = ({
  tileCount = 9,
}) => (
  <div className={MOBILE_SCROLL_STRIP}>
    <div className={MOBILE_GRID_PAGE}>
      {Array.from({ length: tileCount }).map((_, idx) => (
        <CompactTrackTileSkeleton key={idx} />
      ))}
    </div>
  </div>
);
