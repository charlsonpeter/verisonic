import React from 'react';
import { MOBILE_SCROLL_STRIP } from './layout';
import { CompactTrackTileSkeleton } from './TrackTileSkeleton';

interface TrendingMobileSkeletonProps {
  tileCount?: number;
}

export const TrendingMobileSkeleton: React.FC<TrendingMobileSkeletonProps> = ({
  tileCount = 9,
}) => (
  <div className={MOBILE_SCROLL_STRIP}>
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-2 flex-shrink-0 snap-start">
      {Array.from({ length: tileCount }).map((_, idx) => (
        <CompactTrackTileSkeleton key={idx} />
      ))}
    </div>
  </div>
);
