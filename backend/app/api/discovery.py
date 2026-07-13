import unicodedata
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_optional_current_user
from app.api.music import serialize_track
from app.db.session import get_db
from app.models import Artist, Track, User
from app.schemas import (
    ArtistAlbumSummary,
    ArtistDetailResponse,
    ArtistRelatedSummary,
    StudioBrowseResponse,
    TrackResponse,
)
from app.services.cover_images import resolve_cover_art_url
from app.utils.search_normalize import get_track_artist_name, normalize_search_text, track_belongs_to_artist

router = APIRouter(prefix="/discovery", tags=["discovery"])


def _serialize_studio_browse(artist: Artist, track_count: int = 0) -> dict:
    return {
        "id": artist.id,
        "stage_name": artist.stage_name,
        "bio": artist.bio,
        "category": artist.category,
        "cover_art_url": resolve_cover_art_url(artist.cover_image_path),
        "city": artist.city,
        "country": artist.country,
        "track_count": track_count,
    }


def _find_matching_studio(db: Session, artist_name: str) -> Optional[Artist]:
    target = normalize_search_text(artist_name)
    if not target:
        return None
    studios = (
        db.query(Artist)
        .filter(Artist.is_active == True, Artist.profile_complete == True)
        .all()
    )
    for studio in studios:
        if normalize_search_text(studio.stage_name) == target:
            return studio
    return None


def _build_album_summaries(tracks: List[Track]) -> List[ArtistAlbumSummary]:
    albums: dict[str, dict] = {}
    for track in tracks:
        if not track.album or not track.album.title:
            continue
        title = track.album.title.strip()
        if not title:
            continue
        cover = resolve_cover_art_url(track.album.cover_art_url) if track.album.cover_art_url else None
        if not cover and track.cover_image_path:
            cover = resolve_cover_art_url(track.cover_image_path)
        existing = albums.get(title)
        if existing:
            existing["track_count"] += 1
            if not existing["cover_art_url"] and cover:
                existing["cover_art_url"] = cover
            if not existing["release_year"] and track.album.release_year:
                existing["release_year"] = track.album.release_year
        else:
            albums[title] = {
                "title": title,
                "cover_art_url": cover,
                "release_year": track.album.release_year or track.year,
                "track_count": 1,
            }
    return sorted(
        [ArtistAlbumSummary(**payload) for payload in albums.values()],
        key=lambda a: a.title.lower(),
    )


def _related_artists(
    db: Session,
    current_name: str,
    tracks: List[Track],
    limit: int = 6,
) -> List[ArtistRelatedSummary]:
    current_norm = normalize_search_text(current_name)
    counts: dict[str, int] = {}
    covers: dict[str, Optional[str]] = {}

    all_tracks = (
        db.query(Track)
        .options(joinedload(Track.album))
        .filter(Track.approved == True)
        .all()
    )
    for track in all_tracks:
        name = get_track_artist_name(track)
        norm = normalize_search_text(name)
        if not norm or norm == current_norm:
            continue
        counts[name] = counts.get(name, 0) + 1
        if name not in covers:
            cover = None
            if track.cover_image_path:
                cover = resolve_cover_art_url(track.cover_image_path)
            elif track.album and track.album.cover_art_url:
                cover = resolve_cover_art_url(track.album.cover_art_url)
            covers[name] = cover

    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0].lower()))
    return [
        ArtistRelatedSummary(name=name, track_count=count, cover_art_url=covers.get(name))
        for name, count in ranked[:limit]
    ]


@router.get("/studios", response_model=List[StudioBrowseResponse])
def list_public_studios(db: Session = Depends(get_db)):
    studios = (
        db.query(Artist)
        .filter(Artist.is_active == True, Artist.profile_complete == True)
        .order_by(Artist.stage_name.asc())
        .all()
    )
    results = []
    for studio in studios:
        track_count = (
            db.query(func.count(Track.id))
            .filter(Track.artist_id == studio.id, Track.approved == True)
            .scalar()
            or 0
        )
        results.append(_serialize_studio_browse(studio, track_count))
    return results


@router.get("/artists/{artist_name}", response_model=ArtistDetailResponse)
def get_artist_detail(
    artist_name: str,
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    decoded_name = unicodedata.normalize("NFC", artist_name).strip()
    if not decoded_name:
        raise HTTPException(status_code=400, detail="Artist name is required")

    tracks_db = (
        db.query(Track)
        .options(joinedload(Track.artist), joinedload(Track.album), joinedload(Track.genres))
        .filter(Track.approved == True)
        .all()
    )
    matched = [t for t in tracks_db if track_belongs_to_artist(t, decoded_name)]
    if not matched:
        raise HTTPException(status_code=404, detail="Artist not found")

    matched.sort(key=lambda t: t.created_at or t.id, reverse=True)
    serialized_tracks = [serialize_track(t, db, viewer=current_user) for t in matched]

    studio = _find_matching_studio(db, decoded_name)
    studio_payload = None
    if studio:
        track_count = len(matched)
        studio_payload = StudioBrowseResponse(**_serialize_studio_browse(studio, track_count))

    return ArtistDetailResponse(
        name=decoded_name,
        track_count=len(matched),
        studio=studio_payload,
        tracks=serialized_tracks,
        albums=_build_album_summaries(matched),
        related_artists=_related_artists(db, decoded_name, matched),
    )
