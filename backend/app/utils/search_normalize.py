"""Shared search normalization helpers for API modules."""

import re
import unicodedata

from app.models import Track

# Split collaboration credits: "A, B", "A & B", "A and B", "A feat. B", etc.
_ARTIST_CREDIT_SPLIT = re.compile(
    r"\s*(?:,|&|\band\b|\bfeat(?:uring|\.)?|\bft\.?|\bvs\.?|\bx\b|×)\s*",
    flags=re.IGNORECASE,
)


def normalize_search_text(value: str) -> str:
    text = unicodedata.normalize("NFD", (value or "").lower())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def split_artist_credits(value: str) -> list[str]:
    raw = (value or "").strip()
    if not raw:
        return []
    parts = [part.strip() for part in _ARTIST_CREDIT_SPLIT.split(raw) if part.strip()]
    return parts if parts else [raw]


def get_track_artist_name(track: Track) -> str:
    if track.artist_name_override and track.artist_name_override.strip():
        return track.artist_name_override.strip()
    if track.artist and track.artist.stage_name:
        return track.artist.stage_name
    return "Unknown Artist"


def _credit_field_matches_artist(field: str, target: str) -> bool:
    if not field or not target:
        return False
    if normalize_search_text(field) == target:
        return True
    return any(normalize_search_text(credit) == target for credit in split_artist_credits(field))


def track_belongs_to_artist(track: Track, artist_name: str) -> bool:
    target = normalize_search_text(artist_name)
    if not target:
        return False
    return _credit_field_matches_artist(get_track_artist_name(track), target)
