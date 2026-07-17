from typing import Dict, List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.models import CommentReaction, TrackComment, TrackReaction, User

PLATFORM_COMMENT_AUTHOR_NAME = "VeriSonic"


def is_platform_admin_user(user: Optional[User]) -> bool:
    if not user:
        return False
    role = getattr(user, "_real_role", None) or user.role
    return role == "admin"


def comment_author_display_name(user: Optional[User]) -> Optional[str]:
    if not user:
        return None
    if is_platform_admin_user(user):
        return PLATFORM_COMMENT_AUTHOR_NAME
    return user.full_name or None


def is_staff_user(user: Optional[User]) -> bool:
    if not user:
        return False
    role = getattr(user, "_real_role", None) or user.role
    return role in ("admin", "studio_admin")


def engagement_counts_for_tracks(db: Session, track_ids: List[int]) -> Dict[int, dict]:
    if not track_ids:
        return {}

    like_rows = (
        db.query(TrackReaction.track_id, func.count(TrackReaction.id))
        .filter(TrackReaction.track_id.in_(track_ids), TrackReaction.reaction == "like")
        .group_by(TrackReaction.track_id)
        .all()
    )
    dislike_rows = (
        db.query(TrackReaction.track_id, func.count(TrackReaction.id))
        .filter(TrackReaction.track_id.in_(track_ids), TrackReaction.reaction == "dislike")
        .group_by(TrackReaction.track_id)
        .all()
    )
    comment_rows = (
        db.query(TrackComment.track_id, func.count(TrackComment.id))
        .filter(TrackComment.track_id.in_(track_ids))
        .group_by(TrackComment.track_id)
        .all()
    )

    likes = {tid: count for tid, count in like_rows}
    dislikes = {tid: count for tid, count in dislike_rows}
    comments = {tid: count for tid, count in comment_rows}

    return {
        tid: {
            "like_count": likes.get(tid, 0),
            "dislike_count": dislikes.get(tid, 0),
            "comment_count": comments.get(tid, 0),
        }
        for tid in track_ids
    }


def reply_counts_for_comments(db: Session, comment_ids: List[int]) -> Dict[int, int]:
    if not comment_ids:
        return {}
    rows = (
        db.query(TrackComment.parent_id, func.count(TrackComment.id))
        .filter(TrackComment.parent_id.in_(comment_ids))
        .group_by(TrackComment.parent_id)
        .all()
    )
    return {parent_id: count for parent_id, count in rows}


def comment_reaction_counts(
    db: Session,
    comment_ids: List[int],
    viewer_id: Optional[int] = None,
) -> Dict[int, dict]:
    if not comment_ids:
        return {}

    like_case = func.sum(case((CommentReaction.reaction == "like", 1), else_=0))
    dislike_case = func.sum(case((CommentReaction.reaction == "dislike", 1), else_=0))
    rows = (
        db.query(
            CommentReaction.comment_id,
            like_case.label("like_count"),
            dislike_case.label("dislike_count"),
        )
        .filter(CommentReaction.comment_id.in_(comment_ids))
        .group_by(CommentReaction.comment_id)
        .all()
    )

    user_reactions: Dict[int, str] = {}
    if viewer_id is not None:
        user_rows = (
            db.query(CommentReaction.comment_id, CommentReaction.reaction)
            .filter(
                CommentReaction.comment_id.in_(comment_ids),
                CommentReaction.user_id == viewer_id,
            )
            .all()
        )
        user_reactions = {cid: reaction for cid, reaction in user_rows if reaction in ("like", "dislike")}

    result = {
        cid: {"like_count": 0, "dislike_count": 0, "user_reaction": user_reactions.get(cid)}
        for cid in comment_ids
    }
    for row in rows:
        result[row.comment_id] = {
            "like_count": int(row.like_count or 0),
            "dislike_count": int(row.dislike_count or 0),
            "user_reaction": user_reactions.get(row.comment_id),
        }
    return result


def serialize_comment(
    comment: TrackComment,
    db: Session,
    viewer: Optional[User] = None,
    *,
    reaction_map: Optional[Dict[int, dict]] = None,
    reply_count: int = 0,
) -> dict:
    if reaction_map is None:
        reaction_map = comment_reaction_counts(db, [comment.id], viewer.id if viewer else None)

    counts = reaction_map.get(comment.id, {"like_count": 0, "dislike_count": 0, "user_reaction": None})
    return {
        "id": comment.id,
        "track_id": comment.track_id,
        "user_id": comment.user_id,
        "parent_id": comment.parent_id,
        "author_name": comment_author_display_name(comment.user),
        "body": comment.body,
        "created_at": comment.created_at,
        "like_count": counts["like_count"],
        "dislike_count": counts["dislike_count"],
        "user_reaction": counts.get("user_reaction"),
        "is_staff_reply": bool(
            comment.parent_id
            and is_staff_user(comment.user)
            and not is_platform_admin_user(comment.user)
        ),
        "reply_count": reply_count,
        "replies": [],
    }


def load_paginated_comments_for_track(
    db: Session,
    track_id: int,
    viewer: Optional[User],
    *,
    limit: int,
    offset: int,
    parent_id: Optional[int] = None,
) -> Tuple[List[dict], int, bool]:
    query = (
        db.query(TrackComment)
        .options(joinedload(TrackComment.user))
        .filter(TrackComment.track_id == track_id)
    )
    if parent_id is None:
        query = query.filter(TrackComment.parent_id.is_(None))
    else:
        query = query.filter(TrackComment.parent_id == parent_id)

    total = query.count()
    comments = query.order_by(TrackComment.created_at.desc()).offset(offset).limit(limit).all()
    comment_ids = [comment.id for comment in comments]
    reaction_map = comment_reaction_counts(db, comment_ids, viewer.id if viewer else None)
    reply_counts = reply_counts_for_comments(db, comment_ids) if parent_id is None else {}

    items = [
        serialize_comment(
            comment,
            db,
            viewer,
            reaction_map=reaction_map,
            reply_count=reply_counts.get(comment.id, 0) if parent_id is None else 0,
        )
        for comment in comments
    ]
    has_more = offset + len(comments) < total
    return items, total, has_more
