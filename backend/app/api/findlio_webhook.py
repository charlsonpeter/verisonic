import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Track
from app.services.findlio_client import (
    FindlioClientError,
    apply_result_to_track,
    fetch_job_result,
    findlio_service_configured,
    verify_webhook_signature,
)

router = APIRouter(prefix="/internal/findlio", tags=["findlio"])


@router.post("/tracks/{track_id}/jobs")
async def findlio_job_webhook(
    track_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    if not findlio_service_configured():
        raise HTTPException(status_code=503, detail="Findlio is not configured")

    body = await request.body()
    signature = request.headers.get("X-Findlio-Signature", "")
    if not verify_webhook_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid Findlio webhook signature")

    try:
        payload = json.loads(body.decode("utf-8") or "{}")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid webhook payload") from exc

    status = (payload.get("status") or "").strip().lower()
    job_id = payload.get("job_id")
    if status != "succeeded" or not job_id:
        return {"ok": True, "ignored": True}

    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    try:
        result = fetch_job_result(job_id)
    except FindlioClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    apply_result_to_track(track, result)
    db.commit()
    return {"ok": True, "track_id": track_id, "source": result.source}
