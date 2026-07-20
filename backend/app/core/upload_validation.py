import os
from typing import Optional

from fastapi import HTTPException, UploadFile

MAX_UPLOAD_BYTES = 100 * 1024 * 1024

ALLOWED_AUDIO_EXTENSIONS = {".flac", ".wav", ".aiff", ".alac", ".mp3", ".aac", ".ogg"}
ALLOWED_AUDIO_MAGIC = {
    b"fLaC": {".flac"},
    b"RIFF": {".wav", ".aiff"},
    b"ID3": {".mp3"},
    b"\xff\xfb": {".mp3"},
    b"\xff\xf3": {".mp3"},
    b"\xff\xf2": {".mp3"},
    b"OggS": {".ogg"},
}

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_MAGIC = {
    b"\xff\xd8\xff": {".jpg", ".jpeg"},
    b"\x89PNG\r\n\x1a\n": {".png"},
    b"RIFF": {".webp"},
}

ALLOWED_LICENCE_DOCUMENT_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_LICENCE_DOCUMENT_MAGIC = {
    **ALLOWED_IMAGE_MAGIC,
    b"%PDF": {".pdf"},
}
MAX_LICENCE_DOCUMENT_BYTES = 10 * 1024 * 1024


async def read_upload_header(upload: UploadFile, size: int = 16) -> bytes:
    chunk = await upload.read(size)
    await upload.seek(0)
    return chunk


def _match_magic(header: bytes, ext: str, magic_map: dict) -> bool:
    for prefix, extensions in magic_map.items():
        if header.startswith(prefix) and ext in extensions:
            return True
    if ext == ".webp" and len(header) >= 12 and header[8:12] == b"WEBP":
        return True
    if ext in (".aac", ".alac", ".m4a"):
        return True
    return False


async def validate_audio_upload(file: UploadFile) -> str:
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format.",
        )

    header = await read_upload_header(file)
    if not _match_magic(header, ext, ALLOWED_AUDIO_MAGIC):
        raise HTTPException(
            status_code=400,
            detail="File content does not match the declared audio format.",
        )

    body = await file.read()
    await file.seek(0)
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum upload size of {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return ext


async def validate_cover_upload(cover_image: UploadFile) -> str:
    filename = cover_image.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid cover image format. Allowed: JPG, PNG, WEBP",
        )

    header = await read_upload_header(cover_image)
    if not _match_magic(header, ext, ALLOWED_IMAGE_MAGIC):
        raise HTTPException(
            status_code=400,
            detail="Cover image content does not match the declared format.",
        )

    body = await cover_image.read()
    await cover_image.seek(0)
    if len(body) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Cover image exceeds 10 MB limit.")

    return ext


async def validate_licence_document_upload(file: UploadFile) -> str:
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_LICENCE_DOCUMENT_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Invalid licence document format. Allowed: PDF, JPG, PNG, WEBP",
        )

    header = await read_upload_header(file)
    if not _match_magic(header, ext, ALLOWED_LICENCE_DOCUMENT_MAGIC):
        raise HTTPException(
            status_code=400,
            detail="Licence document content does not match the declared format.",
        )

    body = await file.read()
    await file.seek(0)
    if len(body) > MAX_LICENCE_DOCUMENT_BYTES:
        raise HTTPException(status_code=400, detail="Licence document exceeds 10 MB limit.")
    if len(body) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    return ext
