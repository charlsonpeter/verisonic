from typing import Dict, List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.models import RadioProgramComment, RadioProgramCommentReaction, RadioProgramReaction, User
from app.services.engagement import CommentAuthorContext, is_staff_user


def engagement_counts_for_programs(
    db: Session,
    station_id: int,
    program_keys: List[str],
) -> Dict[str, dict]:
    if not program_keys:
        return {}

    like_rows = (
        db.query(RadioProgramReaction.program_key, func.count(RadioProgramReaction.id))
        .filter(
            RadioProgramReaction.station_id == station_id,
            RadioProgramReaction.program_key.in_(program_keys),
            RadioProgramReaction.reaction == "like",
        )
        .group_by(RadioProgramReaction.program_key)
        .all()
    )
    dislike_rows = (
        db.query(RadioProgramReaction.program_key, func.count(RadioProgramReaction.id))
        .filter(
            RadioProgramReaction.station_id == station_id,
            RadioProgramReaction.program_key.in_(program_keys),
            RadioProgramReaction.reaction == "dislike",
        )
        .group_by(RadioProgramReaction.program_key)
        .all()
    )
    comment_rows = (
        db.query(RadioProgramComment.program_key, func.count(RadioProgramComment.id))
        .filter(
            RadioProgramComment.station_id == station_id,
            RadioProgramComment.program_key.in_(program_keys),
        )
        .group_by(RadioProgramComment.program_key)
        .all()
    )

    likes = {key: count for key, count in like_rows}
    dislikes = {key: count for key, count in dislike_rows}
    comments = {key: count for key, count in comment_rows}

    return {
        key: {
            "like_count": likes.get(key, 0),
            "dislike_count": dislikes.get(key, 0),
            "comment_count": comments.get(key, 0),
        }
        for key in program_keys
    }


def reply_counts_for_program_comments(db: Session, comment_ids: List[int]) -> Dict[int, int]:
    if not comment_ids:
        return {}
    rows = (
        db.query(RadioProgramComment.parent_id, func.count(RadioProgramComment.id))
        .filter(RadioProgramComment.parent_id.in_(comment_ids))
        .group_by(RadioProgramComment.parent_id)
        .all()
    )
    return {parent_id: count for parent_id, count in rows}


def program_comment_reaction_counts(
    db: Session,
    comment_ids: List[int],
    viewer_id: Optional[int] = None,
) -> Dict[int, dict]:
    if not comment_ids:
        return {}

    like_case = func.sum(case((RadioProgramCommentReaction.reaction == "like", 1), else_=0))
    dislike_case = func.sum(case((RadioProgramCommentReaction.reaction == "dislike", 1), else_=0))
    rows = (
        db.query(
            RadioProgramCommentReaction.comment_id,
            like_case.label("like_count"),
            dislike_case.label("dislike_count"),
        )
        .filter(RadioProgramCommentReaction.comment_id.in_(comment_ids))
        .group_by(RadioProgramCommentReaction.comment_id)
        .all()
    )

    user_reactions: Dict[int, str] = {}
    if viewer_id is not None:
        user_rows = (
            db.query(RadioProgramCommentReaction.comment_id, RadioProgramCommentReaction.reaction)
            .filter(
                RadioProgramCommentReaction.comment_id.in_(comment_ids),
                RadioProgramCommentReaction.user_id == viewer_id,
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


def serialize_program_comment(
    comment: RadioProgramComment,
    db: Session,
    viewer: Optional[User] = None,
    *,
    reaction_map: Optional[Dict[int, dict]] = None,
    reply_count: int = 0,
    author_context: Optional[CommentAuthorContext] = None,
) -> dict:
    if reaction_map is None:
        reaction_map = program_comment_reaction_counts(db, [comment.id], viewer.id if viewer else None)

    if author_context is None:
        author_context = CommentAuthorContext(db, station_id=comment.station_id)
        author_context.prepare([comment.user])

    counts = reaction_map.get(comment.id, {"like_count": 0, "dislike_count": 0, "user_reaction": None})
    return {
        "id": comment.id,
        "station_id": comment.station_id,
        "program_key": comment.program_key,
        "user_id": comment.user_id,
        "parent_id": comment.parent_id,
        "author_name": author_context.author_name(comment.user),
        "body": comment.body,
        "created_at": comment.created_at,
        "like_count": counts["like_count"],
        "dislike_count": counts["dislike_count"],
        "user_reaction": counts.get("user_reaction"),
        "is_staff_reply": bool(
            comment.parent_id
            and is_staff_user(comment.user)
            and not author_context.uses_branded_name(comment.user)
        ),
        "reply_count": reply_count,
        "replies": [],
    }


def load_paginated_comments_for_program(
    db: Session,
    station_id: int,
    program_key: str,
    viewer: Optional[User],
    *,
    limit: int,
    offset: int,
    parent_id: Optional[int] = None,
) -> Tuple[List[dict], int, bool]:
    query = (
        db.query(RadioProgramComment)
        .options(joinedload(RadioProgramComment.user).joinedload(User.artist_profile))
        .filter(
            RadioProgramComment.station_id == station_id,
            RadioProgramComment.program_key == program_key,
        )
    )
    if parent_id is None:
        query = query.filter(RadioProgramComment.parent_id.is_(None))
    else:
        query = query.filter(RadioProgramComment.parent_id == parent_id)

    total = query.count()
    comments = query.order_by(RadioProgramComment.created_at.desc()).offset(offset).limit(limit).all()
    comment_ids = [comment.id for comment in comments]
    reaction_map = program_comment_reaction_counts(db, comment_ids, viewer.id if viewer else None)
    reply_counts = reply_counts_for_program_comments(db, comment_ids) if parent_id is None else {}

    author_context = CommentAuthorContext(db, station_id=station_id)
    author_context.prepare([comment.user for comment in comments])

    items = [
        serialize_program_comment(
            comment,
            db,
            viewer,
            reaction_map=reaction_map,
            reply_count=reply_counts.get(comment.id, 0) if parent_id is None else 0,
            author_context=author_context,
        )
        for comment in comments
    ]
    has_more = offset + len(comments) < total
    return items, total, has_more


def build_program_engagement_items(
    station_id: int,
    programs: List[dict],
    db: Session,
) -> List[dict]:
    program_keys = [str(p["id"]) for p in programs if p.get("id")]
    counts = engagement_counts_for_programs(db, station_id, program_keys)
    items = []
    for program in programs:
        program_id = program.get("id")
        if not program_id:
            continue
        key = str(program_id)
        program_counts = counts.get(key, {})
        items.append(
            {
                "station_id": station_id,
                "program_key": key,
                "title": str(program.get("title") or "Untitled Program"),
                "rj_name": program.get("rj"),
                "time_from": program.get("timeFrom"),
                "time_to": program.get("timeTo"),
                "like_count": program_counts.get("like_count", 0),
                "dislike_count": program_counts.get("dislike_count", 0),
                "comment_count": program_counts.get("comment_count", 0),
            }
        )
    return items
