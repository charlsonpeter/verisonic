from typing import Optional

from sqlalchemy import or_

from app.models import Album, Artist, Track, User


def apply_manage_track_search(query, search: Optional[str], *, include_owner: bool = False):
    if not search or not search.strip():
        return query
    search_pattern = f"%{search.strip()}%"
    query = query.outerjoin(Artist, Track.artist_id == Artist.id).outerjoin(
        Album, Track.album_id == Album.id
    )
    filters = [
        Track.title.ilike(search_pattern),
        Track.artist_name_override.ilike(search_pattern),
        Artist.stage_name.ilike(search_pattern),
        Album.title.ilike(search_pattern),
    ]
    if include_owner:
        query = query.outerjoin(User, Artist.user_id == User.id)
        filters.extend([
            User.full_name.ilike(search_pattern),
            User.email.ilike(search_pattern),
        ])
    return query.filter(or_(*filters))
