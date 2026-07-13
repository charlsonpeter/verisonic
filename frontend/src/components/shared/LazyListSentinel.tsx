import React, { useEffect, useRef } from 'react';

type LazyListSentinelProps = {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
};

export const LazyListSentinel: React.FC<LazyListSentinelProps> = ({
  hasMore,
  loading,
  onLoadMore,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!target || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoadMore();
      },
      { rootMargin: '240px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  if (!hasMore) return null;

  return (
    <div ref={ref} className="py-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
      {loading ? 'Loading more…' : ''}
    </div>
  );
};
