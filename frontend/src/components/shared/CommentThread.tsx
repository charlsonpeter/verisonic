import React, { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare, Send, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { parseServerDateTime } from '../../utils/dateTime';
import { useLazyList } from '../../hooks/useLazyList';
import { LazyListSentinel } from './LazyListSentinel';

export interface CommentItem {
  id: number;
  track_id: number;
  user_id: number;
  parent_id?: number | null;
  author_name?: string | null;
  body: string;
  created_at: string;
  like_count: number;
  dislike_count: number;
  user_reaction?: 'like' | 'dislike' | null;
  is_staff_reply?: boolean;
  reply_count?: number;
  replies?: CommentItem[];
}

interface CommentThreadProps {
  trackId: number;
  compact?: boolean;
}

const COMMENT_PAGE_SIZE = 10;
const REPLY_PAGE_SIZE = 5;

interface ReplyState {
  items: CommentItem[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
}

function formatRelativeAgo(date: Date, now: Date): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? '' : 's'} ago`;
}

function formatCommentTime(value: string) {
  const date = parseServerDateTime(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatRelativeAgo(date, new Date());
}

function updateCommentTree(
  comments: CommentItem[],
  targetId: number,
  updater: (comment: CommentItem) => CommentItem,
): CommentItem[] {
  return comments.map((comment) => {
    if (comment.id === targetId) {
      return updater(comment);
    }
    if (comment.replies?.length) {
      return {
        ...comment,
        replies: updateCommentTree(comment.replies, targetId, updater),
      };
    }
    return comment;
  });
}

export const CommentThread: React.FC<CommentThreadProps> = ({
  trackId,
  compact = false,
}) => {
  const { token } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [replyingToId, setReplyingToId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState('');
  const [postingReplyId, setPostingReplyId] = useState<number | null>(null);
  const [reactingCommentId, setReactingCommentId] = useState<number | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
  const [replyStates, setReplyStates] = useState<Record<number, ReplyState>>({});

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

  const commentsList = useLazyList<CommentItem>({
    fetchPage: useCallback(async (offset, limit) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      const res = await fetch(`/api/music/${trackId}/comments?${params}`, {
        headers: authHeaders,
      });
      if (!res.ok) return { items: [], hasMore: false };
      const data = await res.json();
      return { items: data.items, hasMore: data.has_more };
    }, [trackId, token]),
    resetKey: trackId,
    enabled: !!trackId,
    pageSize: COMMENT_PAGE_SIZE,
  });

  const comments = commentsList.items;

  useEffect(() => {
    setExpandedReplies(new Set());
    setReplyStates({});
    setReplyingToId(null);
    setReplyText('');
  }, [trackId]);

  const fetchReplies = async (commentId: number, offset: number, append: boolean) => {
    setReplyStates((prev) => ({
      ...prev,
      [commentId]: {
        items: append ? prev[commentId]?.items ?? [] : [],
        hasMore: prev[commentId]?.hasMore ?? false,
        loading: !append,
        loadingMore: append,
      },
    }));

    try {
      const params = new URLSearchParams({
        limit: String(REPLY_PAGE_SIZE),
        offset: String(offset),
        parent_id: String(commentId),
      });
      const res = await fetch(`/api/music/${trackId}/comments?${params}`, {
        headers: authHeaders,
      });
      if (!res.ok) {
        setReplyStates((prev) => ({
          ...prev,
          [commentId]: {
            items: append ? prev[commentId]?.items ?? [] : [],
            hasMore: false,
            loading: false,
            loadingMore: false,
          },
        }));
        return;
      }
      const data = await res.json();
      setReplyStates((prev) => ({
        ...prev,
        [commentId]: {
          items: append ? [...(prev[commentId]?.items ?? []), ...data.items] : data.items,
          hasMore: data.has_more,
          loading: false,
          loadingMore: false,
        },
      }));
    } catch {
      setReplyStates((prev) => ({
        ...prev,
        [commentId]: {
          items: append ? prev[commentId]?.items ?? [] : [],
          hasMore: false,
          loading: false,
          loadingMore: false,
        },
      }));
    }
  };

  const toggleReplies = (comment: CommentItem) => {
    const commentId = comment.id;
    const isExpanded = expandedReplies.has(commentId);
    if (isExpanded) {
      setExpandedReplies((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      return;
    }

    setExpandedReplies((prev) => new Set(prev).add(commentId));
    if (!replyStates[commentId]?.items.length) {
      void fetchReplies(commentId, 0, false);
    }
  };

  const loadMoreReplies = (commentId: number) => {
    const state = replyStates[commentId];
    if (!state || state.loadingMore || !state.hasMore) return;
    void fetchReplies(commentId, state.items.length, true);
  };

  const updateCommentInList = (commentId: number, updater: (comment: CommentItem) => CommentItem) => {
    commentsList.setItems((prev) => updateCommentTree(prev, commentId, updater));
    setReplyStates((prev) => {
      const next: Record<number, ReplyState> = { ...prev };
      for (const [parentId, state] of Object.entries(prev)) {
        next[Number(parentId)] = {
          ...state,
          items: updateCommentTree(state.items, commentId, updater),
        };
      }
      return next;
    });
  };

  const handleCommentReaction = async (
    commentId: number,
    reaction: 'like' | 'dislike',
    current?: 'like' | 'dislike' | null,
  ) => {
    if (!token || reactingCommentId === commentId) return;
    setReactingCommentId(commentId);
    try {
      const next = current === reaction ? null : reaction;
      const res = await fetch(`/api/reactions/comments/${commentId}`, {
        method: next ? 'PUT' : 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(next ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(next ? { body: JSON.stringify({ reaction: next }) } : {}),
      });
      if (!res.ok) return;

      const applyUpdate = (comment: CommentItem) => {
        const was = comment.user_reaction;
        let likeCount = comment.like_count;
        let dislikeCount = comment.dislike_count;
        if (was === 'like') likeCount = Math.max(0, likeCount - 1);
        if (was === 'dislike') dislikeCount = Math.max(0, dislikeCount - 1);
        if (next === 'like') likeCount += 1;
        if (next === 'dislike') dislikeCount += 1;
        return {
          ...comment,
          like_count: likeCount,
          dislike_count: dislikeCount,
          user_reaction: next,
        };
      };

      updateCommentInList(commentId, applyUpdate);
    } finally {
      setReactingCommentId(null);
    }
  };

  const postComment = async (body: string, parentId?: number | null) => {
    const res = await fetch(`/api/music/${trackId}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body, parent_id: parentId ?? null }),
    });
    if (!res.ok) return null;
    return (await res.json()) as CommentItem;
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = newComment.trim();
    if (!body || !token || isPostingComment) return;
    setIsPostingComment(true);
    try {
      const created = await postComment(body);
      if (created) {
        commentsList.setItems((prev) => [created, ...prev]);
        setNewComment('');
      }
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleAddReply = async (e: React.FormEvent, parentId: number) => {
    e.preventDefault();
    const body = replyText.trim();
    if (!body || !token || postingReplyId === parentId) return;
    setPostingReplyId(parentId);
    try {
      const created = await postComment(body, parentId);
      if (created) {
        commentsList.setItems((prev) =>
          prev.map((comment) =>
            comment.id === parentId
              ? { ...comment, reply_count: (comment.reply_count ?? 0) + 1 }
              : comment,
          ),
        );
        setExpandedReplies((prev) => new Set(prev).add(parentId));
        setReplyStates((prev) => {
          const existing = prev[parentId];
          if (!existing) {
            return {
              ...prev,
              [parentId]: {
                items: [created],
                hasMore: false,
                loading: false,
                loadingMore: false,
              },
            };
          }
          return {
            ...prev,
            [parentId]: {
              ...existing,
              items: [created, ...existing.items],
            },
          };
        });
        setReplyText('');
        setReplyingToId(null);
      }
    } finally {
      setPostingReplyId(null);
    }
  };

  const renderReply = (reply: CommentItem) => (
    <div
      key={reply.id}
      className={`ml-2.5 pl-2.5 border-l-2 border-rose-500/25 bg-slate-950/50 rounded-r-xl py-2 pr-2 space-y-1.5 ${
        compact ? 'text-[11px]' : ''
      }`}
    >
      <div className="flex justify-between items-start gap-2 min-w-0 font-bold text-[10px]">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="text-slate-200 truncate">{reply.author_name || 'Listener'}</span>
          {reply.is_staff_reply && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25 text-[8px] uppercase tracking-wide flex-shrink-0">
              Staff
            </span>
          )}
        </div>
        <span className="text-slate-500 flex-shrink-0 text-[9px] text-right whitespace-nowrap">
          {formatCommentTime(reply.created_at)}
        </span>
      </div>
      <p className={`${compact ? 'text-[11px]' : 'text-sm'} text-slate-300 leading-relaxed break-words`}>
        {reply.body}
      </p>
      <div className="flex items-center gap-2.5 flex-wrap">
        <button
          type="button"
          disabled={!token || reactingCommentId === reply.id}
          onClick={() => void handleCommentReaction(reply.id, 'like', reply.user_reaction)}
          className={`inline-flex items-center gap-1 text-[10px] font-bold transition disabled:opacity-40 ${
            reply.user_reaction === 'like' ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-400'
          }`}
        >
          <ThumbsUp className={`w-3 h-3 ${reply.user_reaction === 'like' ? 'fill-current' : ''}`} />
          {reply.like_count}
        </button>
        <button
          type="button"
          disabled={!token || reactingCommentId === reply.id}
          onClick={() => void handleCommentReaction(reply.id, 'dislike', reply.user_reaction)}
          className={`inline-flex items-center gap-1 text-[10px] font-bold transition disabled:opacity-40 ${
            reply.user_reaction === 'dislike' ? 'text-rose-400' : 'text-slate-500 hover:text-rose-400'
          }`}
        >
          <ThumbsDown className={`w-3 h-3 ${reply.user_reaction === 'dislike' ? 'fill-current' : ''}`} />
          {reply.dislike_count}
        </button>
      </div>
    </div>
  );

  const renderComment = (comment: CommentItem) => {
    const replyCount = comment.reply_count ?? 0;
    const repliesExpanded = expandedReplies.has(comment.id);
    const replyState = replyStates[comment.id];
    const loadedReplies = replyState?.items ?? [];
    const remainingReplies = Math.max(0, replyCount - loadedReplies.length);

    return (
      <div
        key={comment.id}
        className={`bg-slate-900/50 border border-white/5 rounded-xl space-y-2 ${
          compact ? 'px-3 py-2.5' : 'px-3 py-2.5'
        }`}
      >
        <div className="flex justify-between items-start gap-2 min-w-0 font-bold text-[10px]">
          <span className="text-slate-200 truncate min-w-0 flex-1">{comment.author_name || 'Listener'}</span>
          <span className="text-slate-500 flex-shrink-0 text-[9px] text-right whitespace-nowrap">
            {formatCommentTime(comment.created_at)}
          </span>
        </div>
        <p className={`${compact ? 'text-[11px]' : 'text-sm'} text-slate-300 leading-relaxed break-words`}>
          {comment.body}
        </p>

        <div className={`flex items-center flex-wrap ${compact ? 'gap-2.5' : 'gap-3'}`}>
          <button
            type="button"
            disabled={!token || reactingCommentId === comment.id}
            onClick={() => void handleCommentReaction(comment.id, 'like', comment.user_reaction)}
            className={`inline-flex items-center gap-1 text-[10px] font-bold transition disabled:opacity-40 ${
              comment.user_reaction === 'like' ? 'text-emerald-400' : 'text-slate-500 hover:text-emerald-400'
            }`}
          >
            <ThumbsUp className={`w-3 h-3 ${comment.user_reaction === 'like' ? 'fill-current' : ''}`} />
            {comment.like_count}
          </button>
          <button
            type="button"
            disabled={!token || reactingCommentId === comment.id}
            onClick={() => void handleCommentReaction(comment.id, 'dislike', comment.user_reaction)}
            className={`inline-flex items-center gap-1 text-[10px] font-bold transition disabled:opacity-40 ${
              comment.user_reaction === 'dislike' ? 'text-rose-400' : 'text-slate-500 hover:text-rose-400'
            }`}
          >
            <ThumbsDown className={`w-3 h-3 ${comment.user_reaction === 'dislike' ? 'fill-current' : ''}`} />
            {comment.dislike_count}
          </button>
          {token && (
            <button
              type="button"
              onClick={() => {
                setReplyingToId(replyingToId === comment.id ? null : comment.id);
                setReplyText('');
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-slate-300 transition"
            >
              <MessageSquare className="w-3 h-3" />
              Reply
            </button>
          )}
        </div>

        {replyCount > 0 && (
          <button
            type="button"
            onClick={() => toggleReplies(comment)}
            className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1 transition outline-none focus-visible:ring-1 focus-visible:ring-rose-500/40 active:scale-[0.98]"
          >
            {repliesExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Hide {replyCount === 1 ? 'reply' : `${replyCount} replies`}
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                View {replyCount === 1 ? '1 reply' : `${replyCount} replies`}
              </>
            )}
          </button>
        )}

        {replyingToId === comment.id && (
          <form onSubmit={(e) => void handleAddReply(e, comment.id)} className="flex gap-2 items-center pt-1">
            <input
              type="text"
              placeholder="Write a reply..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              disabled={postingReplyId === comment.id}
              className="flex-1 bg-slate-950/80 border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 outline-none placeholder-slate-500"
            />
            <button
              type="submit"
              disabled={!replyText.trim() || postingReplyId === comment.id}
              className="p-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}

        {repliesExpanded && (
          <div className="space-y-2 pt-1">
            {replyState?.loading ? (
              <p className="text-[10px] text-slate-500 ml-4">Loading replies...</p>
            ) : (
              loadedReplies.map((reply) => renderReply(reply))
            )}
            {replyState?.hasMore && !replyState.loading && (
              <button
                type="button"
                onClick={() => loadMoreReplies(comment.id)}
                disabled={replyState.loadingMore}
                className="ml-4 text-[10px] font-bold text-rose-400/80 hover:text-rose-300 transition disabled:opacity-50"
              >
                {replyState.loadingMore
                  ? 'Loading...'
                  : `See more replies (${remainingReplies} remaining)`}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <form
        onSubmit={handleAddComment}
        className={`flex gap-2 items-center bg-slate-950/90 border border-white/10 rounded-xl ${
          compact ? 'p-2.5' : 'p-2.5'
        }`}
      >
        <input
          type="text"
          placeholder={token ? 'Share your thoughts...' : 'Log in to comment'}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          disabled={!token || isPostingComment}
          className={`bg-transparent text-slate-200 outline-none w-full min-w-0 placeholder-slate-500 disabled:opacity-50 ${
            compact ? 'text-[11px] px-1' : 'text-xs px-2'
          }`}
        />
        <button
          type="submit"
          disabled={!token || isPostingComment}
          className="p-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg transition flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50"
          title="Post Comment"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
        {commentsList.loading && comments.length === 0 ? (
          <p className="text-xs text-slate-500">Loading comments...</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-slate-500">No comments yet. Be the first to share your thoughts.</p>
        ) : (
          comments.map((comment) => renderComment(comment))
        )}
        <LazyListSentinel
          hasMore={commentsList.hasMore}
          loading={commentsList.loadingMore}
          onLoadMore={commentsList.loadMore}
        />
      </div>
    </div>
  );
};
