"""Shared search normalization helpers for API modules."""

import re
import unicodedata

from app.models import Track


def normalize_search_text(value: str) -> str:
    text = unicodedata.normalize("NFD", (value or "").lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def get_track_artist_name(track: Track) -> str:
    if track.artist_name_override and track.artist_name_override.strip():
        return track.artist_name_override.strip()
    if track.artist and track.artist.stage_name:
        return track.artist.stage_name
    return "Unknown Artist"


def track_belongs_to_artist(track: Track, artist_name: str) -> bool:
    target = normalize_search_text(artist_name)
    if not target:
        return False
    return normalize_search_text(get_track_artist_name(track)) == target
