import math
import unicodedata
from typing import List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_optional_current_user
from app.api.music import serialize_track
from app.db.session import get_db
from app.models import Artist, ListeningHistory, Track, User, track_genres
from app.schemas import (
    ArtistAlbumSummary,
    ArtistDetailResponse,
    ArtistRelatedSummary,
    StudioBrowseResponse,
    TrackResponse,
)
from app.services.cover_images import resolve_cover_art_url
from app.utils.search_normalize import (
    get_track_artist_name,
    normalize_search_text,
    split_artist_credits,
    track_belongs_to_artist,
)

router = APIRouter(prefix="/discovery", tags=["discovery"])

# Hybrid radio scoring weights (content + popularity)
_RADIO_SAME_ARTIST = 50.0
_RADIO_SHARED_GENRE = 15.0
_RADIO_SAME_ALBUM = 10.0
_RADIO_SAME_LANGUAGE = 8.0
_RADIO_POPULARITY_CAP = 20.0


def _parse_exclude_ids(raw: Optional[str]) -> Set[int]:
    if not raw:
        return set()
    ids: Set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            ids.add(int(part))
        except ValueError:
            continue
    return ids


def _score_radio_candidate(
    seed: Track,
    seed_genre_ids: Set[int],
    candidate: Track,
    play_counts: dict[int, int],
) -> float:
    score = 0.0
    if candidate.artist_id == seed.artist_id:
        score += _RADIO_SAME_ARTIST
    if seed.album_id and candidate.album_id == seed.album_id:
        score += _RADIO_SAME_ALBUM
    if seed.language and candidate.language and seed.language.lower() == candidate.language.lower():
        score += _RADIO_SAME_LANGUAGE
    if seed_genre_ids and candidate.genres:
        overlap = sum(1 for g in candidate.genres if g.id in seed_genre_ids)
        score += overlap * _RADIO_SHARED_GENRE
    plays = play_counts.get(candidate.id, 0)
    if plays > 0:
        score += min(_RADIO_POPULARITY_CAP, math.log1p(plays) * 4.0)
    return score


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
    display_names: dict[str, str] = {}
    covers: dict[str, Optional[str]] = {}

    all_tracks = (
        db.query(Track)
        .options(joinedload(Track.album))
        .filter(Track.approved == True, Track.hls_playlist_path.isnot(None))
        .all()
    )
    for track in all_tracks:
        name = get_track_artist_name(track)
        credits = split_artist_credits(name)
        if not credits:
            continue
        cover = None
        if track.cover_image_path:
            cover = resolve_cover_art_url(track.cover_image_path)
        elif track.album and track.album.cover_art_url:
            cover = resolve_cover_art_url(track.album.cover_art_url)

        seen_on_track: Set[str] = set()
        for credit in credits:
            norm = normalize_search_text(credit)
            if not norm or norm == current_norm or norm in seen_on_track:
                continue
            seen_on_track.add(norm)
            counts[norm] = counts.get(norm, 0) + 1
            if norm not in display_names:
                display_names[norm] = credit
                covers[norm] = cover

    ranked = sorted(counts.items(), key=lambda item: (-item[1], display_names[item[0]].lower()))
    return [
        ArtistRelatedSummary(
            name=display_names[norm],
            track_count=count,
            cover_art_url=covers.get(norm),
        )
        for norm, count in ranked[:limit]
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
            .filter(
                Track.artist_id == studio.id,
                Track.approved == True,
                Track.hls_playlist_path.isnot(None),
            )
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
        .filter(Track.approved == True, Track.hls_playlist_path.isnot(None))
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


@router.get("/tracks/{track_id}/radio", response_model=List[TrackResponse])
def get_track_radio(
    track_id: int,
    limit: int = Query(20, ge=1, le=50),
    exclude_ids: Optional[str] = Query(
        None,
        description="Comma-separated track IDs already in the queue to exclude",
    ),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_optional_current_user),
):
    """
    Rank related playable tracks for autoplay after the queue ends.
    Hybrid scoring: artist / genres / album / language + listening-history popularity.
    """
    seed = (
        db.query(Track)
        .options(joinedload(Track.genres), joinedload(Track.artist), joinedload(Track.album))
        .filter(Track.id == track_id)
        .first()
    )
    if not seed:
        raise HTTPException(status_code=404, detail="Track not found")

    excluded = _parse_exclude_ids(exclude_ids)
    excluded.add(seed.id)
    seed_genre_ids = {g.id for g in (seed.genres or [])}

    base_filters = [
        Track.approved == True,
        Track.hls_playlist_path.isnot(None),
    ]
    if excluded:
        base_filters.append(Track.id.notin_(excluded))

    affinity = [Track.artist_id == seed.artist_id]
    if seed.album_id:
        affinity.append(Track.album_id == seed.album_id)
    if seed.language:
        affinity.append(func.lower(Track.language) == seed.language.lower())
    if seed_genre_ids:
        affinity.append(
            Track.id.in_(
                db.query(track_genres.c.track_id).filter(
                    track_genres.c.genre_id.in_(seed_genre_ids)
                )
            )
        )

    candidates = (
        db.query(Track)
        .options(joinedload(Track.genres), joinedload(Track.artist), joinedload(Track.album))
        .filter(*base_filters, or_(*affinity))
        .limit(300)
        .all()
    )

    # If affinity pool is thin, backfill with other approved tracks
    if len(candidates) < limit:
        have_ids = {c.id for c in candidates} | excluded
        extra_q = (
            db.query(Track)
            .options(joinedload(Track.genres), joinedload(Track.artist), joinedload(Track.album))
            .filter(
                Track.approved == True,
                Track.hls_playlist_path.isnot(None),
            )
        )
        if have_ids:
            extra_q = extra_q.filter(Track.id.notin_(have_ids))
        extra = extra_q.order_by(Track.created_at.desc()).limit(limit * 3).all()
        candidates = list(candidates) + list(extra)

    candidate_ids = [c.id for c in candidates]
    play_counts: dict[int, int] = {}
    if candidate_ids:
        rows = (
            db.query(ListeningHistory.track_id, func.count(ListeningHistory.id))
            .filter(ListeningHistory.track_id.in_(candidate_ids))
            .group_by(ListeningHistory.track_id)
            .all()
        )
        play_counts = {tid: int(cnt) for tid, cnt in rows}

    ranked = sorted(
        candidates,
        key=lambda t: (
            -_score_radio_candidate(seed, seed_genre_ids, t, play_counts),
            -(play_counts.get(t.id, 0)),
            t.id,
        ),
    )

    # Deduplicate while preserving rank order
    seen: Set[int] = set()
    picked: List[Track] = []
    for track in ranked:
        if track.id in seen:
            continue
        seen.add(track.id)
        picked.append(track)
        if len(picked) >= limit:
            break

    return [serialize_track(t, db, viewer=current_user) for t in picked]
