from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models import Playlist, PlaylistTrack, Track
from app.schemas import PlaylistCreate, PlaylistResponse, PlaylistTrackAdd, PlaylistTrackReorder
from app.api.auth import get_current_user
from app.api.music import serialize_track

router = APIRouter(prefix="/playlist", tags=["playlist"])

def playlist_tracks_ordered(playlist) -> list:
    ordered = sorted(
        [pt for pt in playlist.playlist_tracks if pt.track and pt.track.approved],
        key=lambda pt: pt.position,
    )
    return ordered

def serialize_playlist(playlist, db: Session) -> dict:
    tracks = [serialize_track(pt.track, db) for pt in playlist_tracks_ordered(playlist)]
    return {
        "id": playlist.id,
        "name": playlist.name,
        "user_id": playlist.user_id,
        "is_public": playlist.is_public,
        "created_at": playlist.created_at,
        "tracks": tracks,
    }

@router.post("", response_model=PlaylistResponse)
def create_playlist(
    playlist_in: PlaylistCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    playlist = Playlist(
        name=playlist_in.name,
        user_id=current_user.id,
        is_public=playlist_in.is_public
    )
    db.add(playlist)
    db.commit()
    db.refresh(playlist)
    return {
        "id": playlist.id,
        "name": playlist.name,
        "user_id": playlist.user_id,
        "is_public": playlist.is_public,
        "created_at": playlist.created_at,
        "tracks": []
    }

@router.get("", response_model=List[PlaylistResponse])
def list_playlists(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    playlists = db.query(Playlist).filter(
        (Playlist.user_id == current_user.id) | (Playlist.is_public == True)
    ).all()
    
    response = []
    for p in playlists:
        response.append(serialize_playlist(p, db))
    return response

@router.get("/{id}", response_model=PlaylistResponse)
def get_playlist(id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    p = db.query(Playlist).filter(Playlist.id == id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Playlist not found")
        
    if not p.is_public and p.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Playlist is private")
        
    tracks = [serialize_track(pt.track, db) for pt in playlist_tracks_ordered(p)]
    return {
        "id": p.id,
        "name": p.name,
        "user_id": p.user_id,
        "is_public": p.is_public,
        "created_at": p.created_at,
        "tracks": tracks
    }

@router.post("/{id}/track", response_model=PlaylistResponse)
def add_track_to_playlist(
    id: int,
    track_in: PlaylistTrackAdd,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    playlist = db.query(Playlist).filter(Playlist.id == id, Playlist.user_id == current_user.id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found or you are not the owner")
        
    track = db.query(Track).filter(Track.id == track_in.track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not track.approved:
        raise HTTPException(status_code=400, detail="Cannot add unapproved track to playlist")
        
    # Calculate position
    max_pos = 0
    for pt in playlist.playlist_tracks:
        if pt.position > max_pos:
            max_pos = pt.position
            
    playlist_track = PlaylistTrack(
        playlist_id=playlist.id,
        track_id=track.id,
        position=max_pos + 1
    )
    db.add(playlist_track)
    db.commit()
    db.refresh(playlist)
    return serialize_playlist(playlist, db)

@router.put("/{id}/tracks/reorder", response_model=PlaylistResponse)
def reorder_playlist_tracks(
    id: int,
    reorder_in: PlaylistTrackReorder,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    playlist = db.query(Playlist).filter(Playlist.id == id, Playlist.user_id == current_user.id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found or you are not the owner")

    pts_by_track = {
        pt.track_id: pt
        for pt in playlist.playlist_tracks
        if pt.track and pt.track.approved
    }
    if set(reorder_in.track_ids) != set(pts_by_track.keys()):
        raise HTTPException(status_code=400, detail="Track list does not match playlist contents")

    for index, track_id in enumerate(reorder_in.track_ids):
        pts_by_track[track_id].position = index + 1

    db.commit()
    db.refresh(playlist)
    return serialize_playlist(playlist, db)

@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_playlist(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
):
    playlist = db.query(Playlist).filter(Playlist.id == id, Playlist.user_id == current_user.id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found or you are not the owner")
    db.delete(playlist)
    db.commit()
    return {"message": "Playlist deleted successfully"}


@router.delete("/{id}/track/{track_id}", response_model=PlaylistResponse)
def remove_track_from_playlist(
    id: int,
    track_id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    playlist = db.query(Playlist).filter(Playlist.id == id, Playlist.user_id == current_user.id).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found or you are not the owner")
        
    pt = db.query(PlaylistTrack).filter(
        PlaylistTrack.playlist_id == playlist.id,
        PlaylistTrack.track_id == track_id
    ).first()
    
    if pt:
        db.delete(pt)
        db.commit()
        
    db.refresh(playlist)
    return serialize_playlist(playlist, db)
