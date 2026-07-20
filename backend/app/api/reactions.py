from typing import Dict, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.db.session import get_db
from app.models import (
    Track,
    TrackReaction,
    TrackComment,
    CommentReaction,
    RadioStation,
    RadioProgramReaction,
    RadioProgramComment,
    RadioProgramCommentReaction,
)
from app.services.radio_programs import ensure_station_program_ids

router = APIRouter(prefix="/reactions", tags=["reactions"])

ReactionValue = Literal["like", "dislike"]


class TrackReactionUpsert(BaseModel):
    reaction: ReactionValue


class RadioProgramReactionUpsert(BaseModel):
    reaction: ReactionValue


class CommentReactionUpsert(BaseModel):
    reaction: ReactionValue


def _program_key_on_station(db: Session, station_id: int, program_key: str) -> bool:
    station = db.query(RadioStation).filter(RadioStation.id == station_id).first()
    if not station:
        return False
    programs = ensure_station_program_ids(station, db)
    return any(str(p.get("id")) == program_key for p in programs)


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


@router.get("/radio-programs", response_model=Dict[str, ReactionValue])
def list_user_radio_program_reactions(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = (
        db.query(RadioProgramReaction)
        .filter(RadioProgramReaction.user_id == current_user.id)
        .all()
    )
    return {
        f"{row.station_id}:{row.program_key}": row.reaction
        for row in rows
        if row.reaction in ("like", "dislike")
    }


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


@router.put("/radio/{station_id}/{program_key}")
def set_radio_program_reaction(
    station_id: int,
    program_key: str,
    payload: RadioProgramReactionUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not _program_key_on_station(db, station_id, program_key):
        raise HTTPException(status_code=404, detail="Program not found")

    existing = (
        db.query(RadioProgramReaction)
        .filter(
            RadioProgramReaction.user_id == current_user.id,
            RadioProgramReaction.station_id == station_id,
            RadioProgramReaction.program_key == program_key,
        )
        .first()
    )
    if existing:
        if existing.reaction == payload.reaction:
            return {
                "message": "Reaction unchanged",
                "station_id": station_id,
                "program_key": program_key,
                "reaction": payload.reaction,
            }
        existing.reaction = payload.reaction
    else:
        db.add(
            RadioProgramReaction(
                user_id=current_user.id,
                station_id=station_id,
                program_key=program_key,
                reaction=payload.reaction,
            )
        )
    db.commit()
    return {
        "message": "Reaction saved",
        "station_id": station_id,
        "program_key": program_key,
        "reaction": payload.reaction,
    }


@router.delete("/radio/{station_id}/{program_key}", status_code=status.HTTP_200_OK)
def clear_radio_program_reaction(
    station_id: int,
    program_key: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(RadioProgramReaction)
        .filter(
            RadioProgramReaction.user_id == current_user.id,
            RadioProgramReaction.station_id == station_id,
            RadioProgramReaction.program_key == program_key,
        )
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Reaction not found")
    db.delete(existing)
    db.commit()
    return {"message": "Reaction cleared", "station_id": station_id, "program_key": program_key}


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


@router.put("/radio-program-comments/{comment_id}")
def set_radio_program_comment_reaction(
    comment_id: int,
    payload: CommentReactionUpsert,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    comment = db.query(RadioProgramComment).filter(RadioProgramComment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    existing = (
        db.query(RadioProgramCommentReaction)
        .filter(
            RadioProgramCommentReaction.user_id == current_user.id,
            RadioProgramCommentReaction.comment_id == comment_id,
        )
        .first()
    )
    if existing:
        if existing.reaction == payload.reaction:
            return {"message": "Reaction unchanged", "comment_id": comment_id, "reaction": payload.reaction}
        existing.reaction = payload.reaction
    else:
        db.add(
            RadioProgramCommentReaction(
                user_id=current_user.id,
                comment_id=comment_id,
                reaction=payload.reaction,
            )
        )
    db.commit()
    return {"message": "Reaction saved", "comment_id": comment_id, "reaction": payload.reaction}


@router.delete("/radio-program-comments/{comment_id}", status_code=status.HTTP_200_OK)
def clear_radio_program_comment_reaction(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    existing = (
        db.query(RadioProgramCommentReaction)
        .filter(
            RadioProgramCommentReaction.user_id == current_user.id,
            RadioProgramCommentReaction.comment_id == comment_id,
        )
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Reaction not found")
    db.delete(existing)
    db.commit()
    return {"message": "Reaction cleared", "comment_id": comment_id}
