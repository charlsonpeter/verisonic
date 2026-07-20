from typing import Optional

from fastapi import UploadFile

from app.core.upload_validation import validate_cover_upload
from app.services.storage import generate_presigned_url, upload_file

DEFAULT_COVER_ART_URL = (
    "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop"
)


def resolve_cover_art_url(stored: Optional[str]) -> Optional[str]:
    if not stored:
        return None
    if stored.startswith("http://") or stored.startswith("https://"):
        return stored
    return generate_presigned_url(stored)


def resolve_cover_art_url_with_fallback(stored: Optional[str]) -> str:
    return resolve_cover_art_url(stored) or DEFAULT_COVER_ART_URL


async def store_profile_cover(file: UploadFile, prefix: str, entity_id: int) -> str:
    ext = await validate_cover_upload(file)
    body = await file.read()
    key = f"covers/{prefix}/{entity_id}{ext}"
    content_type = file.content_type or "image/jpeg"
    upload_file(body, key, content_type=content_type)
    return key
