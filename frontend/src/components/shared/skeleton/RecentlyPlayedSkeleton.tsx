import React from 'react';
import { Skeleton } from './Skeleton';
import { MOBILE_SCROLL_STRIP } from './layout';
import { CompactTrackTileSkeleton } from './TrackTileSkeleton';

const DESKTOP_VISIBLE_ROWS = 9;

export const RecentlyPlayedSkeleton: React.FC = () => (
  <>
    <div className={MOBILE_SCROLL_STRIP}>
      <div className="grid grid-cols-3 gap-x-2.5 gap-y-2 flex-shrink-0 snap-start w-[calc(100vw-2rem)] max-w-[22rem]">
        {Array.from({ length: 9 }).map((_, idx) => (
          <CompactTrackTileSkeleton key={idx} />
        ))}
      </div>
    </div>

    <div
      className="hidden md:grid md:grid-cols-3 gap-3"
      style={{
        maxHeight: `calc(${DESKTOP_VISIBLE_ROWS} * 4.25rem + ${DESKTOP_VISIBLE_ROWS - 1} * 0.75rem)`,
      }}
    >
      {Array.from({ length: 27 }).map((_, idx) => (
        <div
          key={idx}
          className="flex bg-slate-900/20 rounded-2xl p-3 items-center gap-3 min-h-[4.25rem]"
        >
          <Skeleton className="w-11 h-11 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-2.5 w-3/5 max-w-[160px]" />
            <Skeleton className="h-2 w-2/5 max-w-[120px]" />
          </div>
        </div>
      ))}
    </div>
  </>
);
