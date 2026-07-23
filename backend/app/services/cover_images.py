from io import BytesIO
from typing import Optional, Tuple

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.upload_validation import validate_cover_upload
from app.services.storage import generate_presigned_url, upload_file

DEFAULT_COVER_ART_URL = (
    "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop"
)

MAX_STORED_COVER_BYTES = 1 * 1024 * 1024  # 1 MB
_MIN_JPEG_QUALITY = 60
_START_JPEG_QUALITY = 92


def resolve_cover_art_url(stored: Optional[str]) -> Optional[str]:
    if not stored:
        return None
    if stored.startswith("http://") or stored.startswith("https://"):
        return stored
    return generate_presigned_url(stored)


def resolve_cover_art_url_with_fallback(stored: Optional[str]) -> str:
    return resolve_cover_art_url(stored) or DEFAULT_COVER_ART_URL


def _max_dimension_for_prefix(prefix: str) -> int:
    if prefix == "users":
        return 1024
    return 2048


def compress_cover_image(
    data: bytes,
    *,
    max_bytes: int = MAX_STORED_COVER_BYTES,
    max_dimension: int = 2048,
) -> Tuple[bytes, str, str]:
    """
    Keep images under max_bytes for storage. Files already under the limit
    are returned unchanged. Larger images are re-encoded as JPEG with
    LANCZOS downscaling only when quality alone is not enough.
    """
    if len(data) <= max_bytes:
        return data, "", ""

    try:
        image = Image.open(BytesIO(data))
        image.load()
    except UnidentifiedImageError as exc:
        raise ValueError("Could not decode cover image.") from exc

    if image.mode in ("RGBA", "LA") or (image.mode == "P" and "transparency" in image.info):
        background = Image.new("RGB", image.size, (255, 255, 255))
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    else:
        image = image.convert("RGB")

    width, height = image.size
    longest = max(width, height)
    if longest > max_dimension:
        scale = max_dimension / float(longest)
        image = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            Image.Resampling.LANCZOS,
        )

    quality = _START_JPEG_QUALITY
    encoded = b""

    for _ in range(14):
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=True)
        encoded = buffer.getvalue()
        if len(encoded) <= max_bytes:
            return encoded, "image/jpeg", ".jpg"

        if quality > _MIN_JPEG_QUALITY:
            quality = max(_MIN_JPEG_QUALITY, quality - 8)
        else:
            width, height = image.size
            image = image.resize(
                (max(1, int(width * 0.85)), max(1, int(height * 0.85))),
                Image.Resampling.LANCZOS,
            )
            quality = 85

    if len(encoded) > max_bytes:
        raise ValueError("Could not compress cover image under 1 MB.")

    return encoded, "image/jpeg", ".jpg"


async def store_profile_cover(file: UploadFile, prefix: str, entity_id: int) -> str:
    ext = await validate_cover_upload(file)
    body = await file.read()
    content_type = file.content_type or "image/jpeg"

    try:
        compressed, compressed_type, compressed_ext = compress_cover_image(
            body,
            max_dimension=_max_dimension_for_prefix(prefix),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if compressed_ext:
        body = compressed
        content_type = compressed_type
        ext = compressed_ext

    key = f"covers/{prefix}/{entity_id}{ext}"
    upload_file(body, key, content_type=content_type)
    return key
