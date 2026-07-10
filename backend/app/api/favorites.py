from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models import Favorite, Track, Artist
from app.api.auth import get_current_user
from app.api.music import serialize_track

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.get("", response_model=List[dict])
def list_favorites(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    favorites = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc())
        .all()
    )
    track_ids = [f.track_id for f in favorites]
    if not track_ids:
        return []
    tracks = (
        db.query(Track)
        .join(Artist, Track.artist_id == Artist.id)
        .filter(Track.id.in_(track_ids), Track.approved == True, Artist.is_active == True)
        .all()
    )
    by_id = {t.id: t for t in tracks}
    return [serialize_track(by_id[tid], db, viewer=current_user) for tid in track_ids if tid in by_id]


@router.post("/{track_id}", status_code=status.HTTP_201_CREATED)
def add_favorite(
    track_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id, Track.approved == True).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    existing = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.track_id == track_id)
        .first()
    )
    if existing:
        return {"message": "Already in favorites", "track_id": track_id}
    db.add(Favorite(user_id=current_user.id, track_id=track_id))
    db.commit()
    return {"message": "Added to favorites", "track_id": track_id}


@router.delete("/{track_id}", status_code=status.HTTP_200_OK)
def remove_favorite(
    track_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    favorite = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.track_id == track_id)
        .first()
    )
    if not favorite:
        raise HTTPException(status_code=404, detail="Favorite not found")
    db.delete(favorite)
    db.commit()
    return {"message": "Removed from favorites", "track_id": track_id}
