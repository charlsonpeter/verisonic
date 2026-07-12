import secrets
from typing import Optional

from fastapi import UploadFile

from app.core.upload_validation import validate_licence_document_upload
from app.services.storage import generate_presigned_url, upload_file


def licence_document_url(path: Optional[str]) -> Optional[str]:
    if not path:
        return None
    return generate_presigned_url(path)


async def store_licence_document(file: UploadFile, prefix: str, entity_id: int) -> str:
    ext = await validate_licence_document_upload(file)
    body = await file.read()
    key = f"licences/{prefix}/{entity_id}_{secrets.token_hex(8)}{ext}"
    content_type = file.content_type or (
        "application/pdf" if ext == ".pdf" else "application/octet-stream"
    )
    upload_file(body, key, content_type=content_type)
    return key
