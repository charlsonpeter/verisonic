from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_admin, get_current_studio_admin, get_current_user, get_optional_current_user
from app.db.session import get_db
from app.models import Album, Artist, Genre, Track, User, track_genres
from app.schemas import AlbumCreate, AlbumResponse, AlbumUpdate, GenreCreate, GenreResponse, GenreUpdate, TrackResponse
from app.api.music import serialize_track
from app.services.cover_images import resolve_cover_art_url

router = APIRouter(tags=["catalog"])


def _serialize_album(album: Album, db: Session, track_count: Optional[int] = None) -> dict:
    if track_count is None:
        track_count = (
            db.query(func.count(Track.id))
            .filter(Track.album_id == album.id, Track.approved == True)
            .scalar()
            or 0
        )
    cover = None
    if album.cover_art_url:
        cover = (
            resolve_cover_art_url(album.cover_art_url)
            if not album.cover_art_url.startswith("http")
            else album.cover_art_url
        )
    return {
        "id": album.id,
        "title": album.title,
        "cover_art_url": cover,
        "release_year": album.release_year,
        "artist_id": album.artist_id,
        "artist_name": album.artist.stage_name if album.artist else None,
        "track_count": track_count,
    }


def _get_studio_artist(current_user: User, db: Session) -> Artist:
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist:
        raise HTTPException(status_code=404, detail="Studio profile not found")
    return artist


def _ensure_album_owner(album: Album, current_user: User, db: Session) -> None:
    if current_user.role == "admin":
        return
    artist = _get_studio_artist(current_user, db)
    if album.artist_id != artist.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this album")


@router.get("/albums", response_model=List[AlbumResponse])
def list_albums(
    artist_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Album).options(joinedload(Album.artist))
    if artist_id is not None:
        query = query.filter(Album.artist_id == artist_id)
    albums = query.order_by(Album.title.asc()).all()
    visible = []
    for album in albums:
        approved_count = (
            db.query(func.count(Track.id))
            .filter(Track.album_id == album.id, Track.approved == True)
            .scalar()
            or 0
        )
        if approved_count > 0 or artist_id is not None:
            visible.append(_serialize_album(album, db, approved_count))
    return visible


@router.get("/albums/{album_id}", response_model=AlbumResponse)
def get_album(album_id: int, db: Session = Depends(get_db)):
    album = db.query(Album).options(joinedload(Album.artist)).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    return _serialize_album(album, db)


@router.get("/albums/{album_id}/tracks", response_model=List[TrackResponse])
def get_album_tracks(
    album_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    tracks = (
        db.query(Track)
        .options(joinedload(Track.artist), joinedload(Track.album), joinedload(Track.genres))
        .filter(Track.album_id == album_id, Track.approved == True)
        .order_by(Track.title.asc())
        .all()
    )
    return [serialize_track(t, db, viewer=current_user) for t in tracks]


@router.post("/albums", response_model=AlbumResponse, status_code=status.HTTP_201_CREATED)
def create_album(
    album_in: AlbumCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_studio_admin),
):
    artist = _get_studio_artist(current_user, db)
    title = album_in.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Album title is required")
    existing = db.query(Album).filter(Album.artist_id == artist.id, Album.title == title).first()
    if existing:
        raise HTTPException(status_code=400, detail="Album with this title already exists")
    album = Album(title=title, artist_id=artist.id, release_year=album_in.release_year)
    db.add(album)
    db.commit()
    db.refresh(album)
    album.artist = artist
    return _serialize_album(album, db, 0)


@router.put("/albums/{album_id}", response_model=AlbumResponse)
def update_album(
    album_id: int,
    album_in: AlbumUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_studio_admin),
):
    album = db.query(Album).options(joinedload(Album.artist)).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    _ensure_album_owner(album, current_user, db)
    if album_in.title is not None:
        title = album_in.title.strip()
        if not title:
            raise HTTPException(status_code=400, detail="Album title cannot be empty")
        album.title = title
    if album_in.release_year is not None:
        album.release_year = album_in.release_year
    db.commit()
    db.refresh(album)
    return _serialize_album(album, db)


@router.delete("/albums/{album_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_album(
    album_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_studio_admin),
):
    album = db.query(Album).filter(Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    _ensure_album_owner(album, current_user, db)
    for track in db.query(Track).filter(Track.album_id == album_id).all():
        track.album_id = None
    db.delete(album)
    db.commit()


@router.get("/genres", response_model=List[GenreResponse])
def list_genres(db: Session = Depends(get_db)):
    return db.query(Genre).order_by(Genre.name.asc()).all()


@router.post("/genres", response_model=GenreResponse, status_code=status.HTTP_201_CREATED)
def create_genre(
    genre_in: GenreCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    name = genre_in.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Genre name is required")
    existing = db.query(Genre).filter(Genre.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Genre already exists")
    genre = Genre(name=name)
    db.add(genre)
    db.commit()
    db.refresh(genre)
    return genre


@router.put("/genres/{genre_id}", response_model=GenreResponse)
def update_genre(
    genre_id: int,
    genre_in: GenreUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    genre = db.query(Genre).filter(Genre.id == genre_id).first()
    if not genre:
        raise HTTPException(status_code=404, detail="Genre not found")
    name = genre_in.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Genre name is required")
    conflict = db.query(Genre).filter(Genre.name == name, Genre.id != genre_id).first()
    if conflict:
        raise HTTPException(status_code=400, detail="Another genre already uses this name")
    genre.name = name
    db.commit()
    db.refresh(genre)
    return genre


@router.delete("/genres/{genre_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_genre(
    genre_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
):
    genre = db.query(Genre).filter(Genre.id == genre_id).first()
    if not genre:
        raise HTTPException(status_code=404, detail="Genre not found")
    if db.execute(
        select(track_genres.c.track_id).where(track_genres.c.genre_id == genre_id).limit(1)
    ).first():
        raise HTTPException(status_code=400, detail="Cannot delete a genre that is assigned to tracks")
    db.delete(genre)
    db.commit()
