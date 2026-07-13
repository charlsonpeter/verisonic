import { useCallback, useEffect, useRef, useState } from 'react';

export type LazyPageResult<T> = {
  items: T[];
  hasMore: boolean;
};

export const DEFAULT_LAZY_PAGE_SIZE = 20;

export function useLazyList<T>({
  fetchPage,
  resetKey,
  pageSize = DEFAULT_LAZY_PAGE_SIZE,
  enabled = true,
}: {
  fetchPage: (offset: number, limit: number) => Promise<LazyPageResult<T>>;
  resetKey: string | number | null | undefined;
  pageSize?: number;
  enabled?: boolean;
}) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const offsetRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const loadInitial = useCallback(async () => {
    if (!enabled) {
      setItems([]);
      setHasMore(false);
      offsetRef.current = 0;
      return;
    }
    setLoading(true);
    offsetRef.current = 0;
    try {
      const page = await fetchPageRef.current(0, pageSize);
      setItems(page.items);
      setHasMore(page.hasMore);
      offsetRef.current = page.items.length;
    } finally {
      setLoading(false);
    }
  }, [enabled, pageSize]);

  const loadMore = useCallback(async () => {
    if (!enabled || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchPageRef.current(offsetRef.current, pageSize);
      setItems((prev) => [...prev, ...page.items]);
      setHasMore(page.hasMore);
      offsetRef.current += page.items.length;
    } finally {
      setLoadingMore(false);
    }
  }, [enabled, hasMore, loading, loadingMore, pageSize]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial, resetKey]);

  return {
    items,
    setItems,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    reload: loadInitial,
  };
}
