from typing import Dict, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models import Track, TrackReaction, TrackComment, CommentReaction

router = APIRouter(prefix="/reactions", tags=["reactions"])

ReactionValue = Literal["like", "dislike"]


class TrackReactionUpsert(BaseModel):
    reaction: ReactionValue


@router.get("", response_model=Dict[int, ReactionValue])
def list_user_reactions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(TrackReaction)
        .filter(TrackReaction.user_id == current_user.id)
        .all()
    )
    return {row.track_id: row.reaction for row in rows if row.reaction in ("like", "dislike")}


@router.put("/{track_id}")
def set_track_reaction(
    track_id: int,
    payload: TrackReactionUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    track = db.query(Track).filter(
        Track.id == track_id,
        Track.approved == True,
        Track.hls_playlist_path.isnot(None),
    ).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    existing = (
        db.query(TrackReaction)
        .filter(
            TrackReaction.user_id == current_user.id,
            TrackReaction.track_id == track_id,
        )
        .first()
    )
    if existing:
        if existing.reaction == payload.reaction:
            return {"message": "Reaction unchanged", "track_id": track_id, "reaction": payload.reaction}
        existing.reaction = payload.reaction
    else:
        db.add(
            TrackReaction(
                user_id=current_user.id,
                track_id=track_id,
                reaction=payload.reaction,
            )
        )
    db.commit()
    return {"message": "Reaction saved", "track_id": track_id, "reaction": payload.reaction}


@router.delete("/{track_id}", status_code=status.HTTP_200_OK)
def clear_track_reaction(
    track_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(TrackReaction)
        .filter(
            TrackReaction.user_id == current_user.id,
            TrackReaction.track_id == track_id,
        )
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Reaction not found")
    db.delete(existing)
    db.commit()
    return {"message": "Reaction cleared", "track_id": track_id}


class CommentReactionUpsert(BaseModel):
    reaction: ReactionValue


@router.put("/comments/{comment_id}")
def set_comment_reaction(
    comment_id: int,
    payload: CommentReactionUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    comment = db.query(TrackComment).filter(TrackComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    existing = (
        db.query(CommentReaction)
        .filter(
            CommentReaction.user_id == current_user.id,
            CommentReaction.comment_id == comment_id,
        )
        .first()
    )
    if existing:
        if existing.reaction == payload.reaction:
            return {"message": "Reaction unchanged", "comment_id": comment_id, "reaction": payload.reaction}
        existing.reaction = payload.reaction
    else:
        db.add(
            CommentReaction(
                user_id=current_user.id,
                comment_id=comment_id,
                reaction=payload.reaction,
            )
        )
    db.commit()
    return {"message": "Reaction saved", "comment_id": comment_id, "reaction": payload.reaction}


@router.delete("/comments/{comment_id}", status_code=status.HTTP_200_OK)
def clear_comment_reaction(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(CommentReaction)
        .filter(
            CommentReaction.user_id == current_user.id,
            CommentReaction.comment_id == comment_id,
        )
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Reaction not found")
    db.delete(existing)
    db.commit()
    return {"message": "Reaction cleared", "comment_id": comment_id}
