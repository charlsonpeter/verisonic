/** Matches App main `px-6` so snap pages align to the content edge without left/right peek. */
export const MOBILE_SCROLL_STRIP =
  'flex md:hidden gap-3 overflow-x-auto pb-1 -mx-6 px-6 scroll-px-6 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden';

/** Full scrollport width for a 3×3 (or N-col) snap page inside MOBILE_SCROLL_STRIP. */
export const MOBILE_GRID_PAGE =
  'grid grid-cols-3 gap-x-2.5 gap-y-2 flex-shrink-0 snap-start w-[calc(100vw-3rem)]';
