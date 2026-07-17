from typing import Dict, List, Optional, Tuple

from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from app.models import Artist, CommentReaction, RadioStation, TrackComment, TrackReaction, User

PLATFORM_COMMENT_AUTHOR_NAME = "VeriSonic"


def _effective_role(user: User) -> str:
    return getattr(user, "_real_role", None) or user.role


def is_platform_admin_user(user: Optional[User]) -> bool:
    if not user:
        return False
    return _effective_role(user) == "admin"


def is_staff_user(user: Optional[User]) -> bool:
    if not user:
        return False
    return _effective_role(user) in ("admin", "studio_admin", "radio_admin")


def _studio_display_name(user: User, db: Optional[Session] = None) -> Optional[str]:
    artist = user.artist_profile
    if artist is None and db is not None:
        artist = db.query(Artist).filter(Artist.user_id == user.id).first()
    if artist and artist.stage_name and artist.stage_name.strip():
        return artist.stage_name.strip()
    return None


def _radio_station_display_name(
    user: User,
    db: Optional[Session],
    *,
    station_id: Optional[int] = None,
    station_names_by_owner: Optional[Dict[int, str]] = None,
) -> Optional[str]:
    if station_names_by_owner is not None and user.id in station_names_by_owner:
        if station_id is not None:
            if db is not None:
                station = (
                    db.query(RadioStation)
                    .filter(RadioStation.owner_id == user.id, RadioStation.id == station_id)
                    .first()
                )
                if station and station.name and station.name.strip():
                    return station.name.strip()
        return station_names_by_owner.get(user.id)

    if db is None:
        return None

    query = db.query(RadioStation).filter(RadioStation.owner_id == user.id)
    if station_id is not None:
        station = query.filter(RadioStation.id == station_id).first()
        if station and station.name and station.name.strip():
            return station.name.strip()
    station = query.order_by(RadioStation.id.asc()).first()
    if station and station.name and station.name.strip():
        return station.name.strip()
    return None


def comment_author_display_name(
    user: Optional[User],
    db: Optional[Session] = None,
    *,
    station_id: Optional[int] = None,
    station_names_by_owner: Optional[Dict[int, str]] = None,
) -> Optional[str]:
    if not user:
        return None
    role = _effective_role(user)
    if role == "admin":
        return PLATFORM_COMMENT_AUTHOR_NAME
    if role == "studio_admin":
        studio_name = _studio_display_name(user, db)
        if studio_name:
            return studio_name
    if role == "radio_admin":
        station_name = _radio_station_display_name(
            user,
            db,
            station_id=station_id,
            station_names_by_owner=station_names_by_owner,
        )
        if station_name:
            return station_name
    return user.full_name or None


def uses_branded_author_name(
    user: Optional[User],
    db: Optional[Session] = None,
    *,
    station_id: Optional[int] = None,
    station_names_by_owner: Optional[Dict[int, str]] = None,
) -> bool:
    if not user:
        return False
    role = _effective_role(user)
    if role == "admin":
        return True
    if role == "studio_admin":
        return _studio_display_name(user, db) is not None
    if role == "radio_admin":
        return _radio_station_display_name(
            user,
            db,
            station_id=station_id,
            station_names_by_owner=station_names_by_owner,
        ) is not None
    return False


class CommentAuthorContext:
    def __init__(self, db: Session, station_id: Optional[int] = None):
        self.db = db
        self.station_id = station_id
        self._station_names_by_owner: Dict[int, str] = {}
        self._prepared = False

    def prepare(self, users: List[Optional[User]]) -> None:
        if self._prepared:
            return
        owner_ids = [
            user.id
            for user in users
            if user and _effective_role(user) == "radio_admin"
        ]
        if owner_ids:
            rows = (
                self.db.query(RadioStation.owner_id, RadioStation.name)
                .filter(RadioStation.owner_id.in_(owner_ids))
                .order_by(RadioStation.id.asc())
                .all()
            )
            for owner_id, name in rows:
                if owner_id not in self._station_names_by_owner and name and name.strip():
                    self._station_names_by_owner[owner_id] = name.strip()
        self._prepared = True

    def author_name(self, user: Optional[User]) -> Optional[str]:
        return comment_author_display_name(
            user,
            self.db,
            station_id=self.station_id,
            station_names_by_owner=self._station_names_by_owner,
        )

    def uses_branded_name(self, user: Optional[User]) -> bool:
        return uses_branded_author_name(
            user,
            self.db,
            station_id=self.station_id,
            station_names_by_owner=self._station_names_by_owner,
        )


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
    author_context: Optional[CommentAuthorContext] = None,
) -> dict:
    if reaction_map is None:
        reaction_map = comment_reaction_counts(db, [comment.id], viewer.id if viewer else None)

    if author_context is None:
        author_context = CommentAuthorContext(db)
        author_context.prepare([comment.user])

    counts = reaction_map.get(comment.id, {"like_count": 0, "dislike_count": 0, "user_reaction": None})
    return {
        "id": comment.id,
        "track_id": comment.track_id,
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
        .options(joinedload(TrackComment.user).joinedload(User.artist_profile))
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

    author_context = CommentAuthorContext(db)
    author_context.prepare([comment.user for comment in comments])

    items = [
        serialize_comment(
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
