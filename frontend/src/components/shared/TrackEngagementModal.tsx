import React, { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AppModal } from './AppModal';
import { CommentThread } from './CommentThread';

interface TrackEngagementModalProps {
  trackId: number | null;
  trackTitle?: string;
  open: boolean;
  onClose: () => void;
}

interface EngagementData {
  track_id: number;
  title: string;
  artist_name?: string | null;
  like_count: number;
  dislike_count: number;
  comment_count: number;
}

export const TrackEngagementModal: React.FC<TrackEngagementModalProps> = ({
  trackId,
  trackTitle,
  open,
  onClose,
}) => {
  const { token } = useAuth();
  const [data, setData] = useState<EngagementData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !trackId || !token) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/music/manage/${trackId}/engagement`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || 'Could not load engagement');
        }
        const payload = await res.json();
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Could not load engagement');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, trackId, token]);

  const title = data?.title || trackTitle || 'Track Engagement';

  return (
    <AppModal
      open={open}
      onClose={onClose}
      maxWidth="2xl"
      header={<span className="text-sm font-extrabold text-white">{title}</span>}
      bodyClassName="p-0 font-sans"
      panelClassName="max-h-[85vh] overflow-hidden"
    >
      <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading engagement...</p>
        ) : error ? (
          <p className="text-sm text-rose-300">{error}</p>
        ) : data ? (
          <>
            {data.artist_name && (
              <p className="text-xs text-slate-400 font-semibold">{data.artist_name}</p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm font-bold">
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <ThumbsUp className="w-4 h-4" /> {data.like_count}
              </span>
              <span className="inline-flex items-center gap-1.5 text-rose-400">
                <ThumbsDown className="w-4 h-4" /> {data.dislike_count}
              </span>
              <span className="inline-flex items-center gap-1.5 text-slate-300">
                <MessageSquare className="w-4 h-4" /> {data.comment_count}
              </span>
            </div>
            <CommentThread trackId={data.track_id} />
          </>
        ) : null}
      </div>
    </AppModal>
  );
};
