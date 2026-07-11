import os
import shutil
import tempfile
import asyncio
from fastapi import Request, APIRouter, Depends, HTTPException, UploadFile, File, Form, status, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.session import get_db, SessionLocal
from app.models import Track, Artist, Album, Genre, AudioAnalysisReport, ListeningHistory, StreamingLog
from app.schemas import TrackResponse, AudioAnalysisReportResponse
from app.api.auth import get_current_user, get_current_studio_admin, get_current_admin, get_optional_current_user
from app.services.storage import generate_presigned_url, delete_file, upload_file, delete_prefix
from app.tasks.tasks import analyze_audio_task
from app.core.premium import user_has_premium
from app.models import User

def normalize_optional_string(val: Optional[str]) -> Optional[str]:
    if val is None:
        return None
    stripped = val.strip()
    if stripped == "" or stripped.lower() in ("null", "none"):
        return None
    return stripped

router = APIRouter(prefix="/music", tags=["music"])

def _user_can_manage_track(user: User, track: Track, db: Session) -> bool:
    if user.role == "admin":
        return True
    artist = db.query(Artist).filter(Artist.user_id == user.id).first()
    return bool(artist and track.artist_id == artist.id)

# Helper to serialize Track into response with pre-signed URLs
def serialize_track(track: Track, db: Session, viewer: Optional[User] = None) -> dict:
    artist_name = track.artist_name_override if track.artist_name_override else (track.artist.stage_name if track.artist else "Unknown Artist")
    album_title = track.album.title if track.album else None
    
    # Pre-sign storage URLs
    hls_url = generate_presigned_url(track.hls_playlist_path) if track.hls_playlist_path else None
    mp3_url = generate_presigned_url(track.mp3_320_path) if track.mp3_320_path else None
    aac_256_url = generate_presigned_url(track.aac_256_path) if track.aac_256_path else None
    aac_128_url = generate_presigned_url(track.aac_128_path) if track.aac_128_path else None
    original_url = generate_presigned_url(track.original_file_path) if track.original_file_path else None
    
    cover_art_url = generate_presigned_url(track.cover_image_path) if track.cover_image_path else None
    if not cover_art_url and track.album and track.album.cover_art_url:
        cover_art_url = generate_presigned_url(track.album.cover_art_url) if "/" in track.album.cover_art_url and not track.album.cover_art_url.startswith("http") else track.album.cover_art_url
    if not cover_art_url:
        cover_art_url = "https://images.unsplash.com/photo-1507838153414-b4b713384a76?auto=format&fit=crop&q=80&w=150"

    premium = user_has_premium(viewer)
    is_owner_or_admin = False
    if viewer:
        if viewer.role == "admin":
            is_owner_or_admin = True
        else:
            artist = db.query(Artist).filter(Artist.user_id == viewer.id).first()
            is_owner_or_admin = bool(artist and track.artist_id == artist.id)

    if not premium and not is_owner_or_admin:
        original_url = None
        mp3_url = None
        aac_256_url = None
        hls_url = None

    return {
        "id": track.id,
        "title": track.title,
        "artist_id": track.artist_id,
        "artist_name": artist_name,
        "artist_name_override": track.artist_name_override,
        "album_id": track.album_id,
        "album_title": album_title,
        "duration": track.duration,
        "file_format": track.file_format,
        "bitrate": track.bitrate,
        "sample_rate": track.sample_rate,
        "bit_depth": track.bit_depth,
        "channels": track.channels,
        "quality_score": track.quality_score,
        "quality_level": track.quality_level,
        "approved": track.approved,
        "original_file_path": original_url,
        "hls_playlist_path": hls_url,
        "mp3_320_path": mp3_url,
        "aac_256_path": aac_256_url,
        "aac_128_path": aac_128_url,
        "cover_art_url": cover_art_url,
        "lyrics": track.lyrics,
        "composer": track.composer,
        "lyricist": track.lyricist,
        "year": track.year,
        "language": track.language,
        "genres": [g.name for g in track.genres] if track.genres else [],
        "created_at": track.created_at
    }

def transcribe_audio(file_path: str, language: Optional[str] = None, track_title: str = "Unknown", artist_name: str = "Unknown") -> str:
    """
    Simulates speech recognition or calls OpenAI API if key exists.
    Supports multi-language output. If language is not specified, AI detects it automatically.
    """
    import os
    import httpx
    
    # Check if OPENAI_API_KEY environment variable is present
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        try:
            # Call OpenAI Whisper API using standard HTTP request to avoid needing `openai` SDK
            headers = {"Authorization": f"Bearer {api_key}"}
            url = "https://api.openai.com/v1/audio/transcriptions"
            files = {"file": open(file_path, "rb")}
            data = {"model": "whisper-1"}
            if language:
                # Map full names or codes to ISO 639-1 code if needed, otherwise pass it
                lang_lower = language.lower()
                if "span" in lang_lower or "esp" in lang_lower or lang_lower == "es":
                    data["language"] = "es"
                elif "fren" in lang_lower or "fran" in lang_lower or lang_lower == "fr":
                    data["language"] = "fr"
                elif "germ" in lang_lower or "deut" in lang_lower or lang_lower == "de":
                    data["language"] = "de"
                elif "hind" in lang_lower or lang_lower == "hi":
                    data["language"] = "hi"
                elif "chin" in lang_lower or "zh" in lang_lower or "mand" in lang_lower:
                    data["language"] = "zh"
                else:
                    data["language"] = language
            response = httpx.post(url, headers=headers, files=files, data=data, timeout=60.0)
            if response.status_code == 200:
                res_data = response.json()
                return res_data.get("text", "")
            else:
                print(f"OpenAI transcription failed with status code {response.status_code}: {response.text}")
        except Exception as ex:
            print(f"Failed to transcribe via OpenAI Whisper API: {ex}")
            
    # Mock AI transcription disabled — return empty when Whisper API is unavailable
    return ""

@router.post("/parse-metadata")
async def parse_metadata(
    file: UploadFile = File(...),
    current_user = Depends(get_current_studio_admin)
):
    """
    Fast metadata extraction endpoint to pre-populate details in the frontend.
    """
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    
    # Save temporarily to parse
    fd, temp_file_path = tempfile.mkstemp(suffix=ext)
    try:
        with os.fdopen(fd, 'wb') as tmp:
            shutil.copyfileobj(file.file, tmp)
            
        from app.services.audio import extract_metadata
        meta = extract_metadata(temp_file_path)
        
        return {
            "title": meta.get("title") or os.path.splitext(filename)[0],
            "artist": meta.get("artist") or "",
            "album": meta.get("album") or "",
            "composer": meta.get("composer") or "",
            "lyricist": meta.get("lyricist") or "",
            "year": meta.get("year") or "",
            "lyrics": meta.get("lyrics") or ""
        }
    except Exception as e:
        print(f"Error parsing metadata: {e}")
        # Fallback to filename-based title
        return {
            "title": os.path.splitext(filename)[0],
            "artist": "",
            "album": "",
            "composer": "",
            "lyricist": "",
            "year": "",
            "lyrics": ""
        }
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

@router.post("/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_music(
    title: Optional[str] = Form(None),
    artist_name: Optional[str] = Form(None),
    album_title: Optional[str] = Form(None),
    composer: Optional[str] = Form(None),
    lyricist: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    lyrics: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    genres: Optional[str] = Form(""), # comma separated genre names
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_studio_admin)
):
    """
    Music upload endpoint for artists and admins.
    Validates extension and schedules async spectral check & transcoding.
    """
    filename = file.filename
    ext = os.path.splitext(filename)[1].lower()
    
    # Supported and Restricted audio extensions
    allowed_exts = [".flac", ".wav", ".aiff", ".alac"]
    restricted_exts = [".mp3", ".aac", ".ogg"]
    
    if ext not in allowed_exts and ext not in restricted_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Allowed lossless: {allowed_exts}, restricted (accepted only for analysis): {restricted_exts}"
        )
        
    # Get or create artist profile for current user
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist:
        artist = Artist(user_id=current_user.id, stage_name=current_user.full_name or "Unknown Artist")
        db.add(artist)
        db.commit()
        db.refresh(artist)
        
    # Save uploaded file temporarily to local disk (shared with worker container)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, "..", ".."))
    shared_tmp_dir = os.path.join(project_root, "tmp")
    os.makedirs(shared_tmp_dir, exist_ok=True)
    fd, temp_file_path = tempfile.mkstemp(suffix=ext, dir=shared_tmp_dir)
    with os.fdopen(fd, 'wb') as tmp:
        shutil.copyfileobj(file.file, tmp)

    # Auto-detect metadata tags from file
    resolved_title = title
    extracted_artist = None
    extracted_album = None
    extracted_composer = None
    extracted_lyricist = None
    extracted_year = None
    extracted_lyrics = None
    try:
        from app.services.audio import extract_metadata
        meta = extract_metadata(temp_file_path)
        if not resolved_title or resolved_title.strip() == "":
            resolved_title = meta.get("title")
        extracted_artist = meta.get("artist")
        extracted_album = meta.get("album")
        extracted_composer = meta.get("composer")
        extracted_lyricist = meta.get("lyricist")
        extracted_year = meta.get("year")
        extracted_lyrics = meta.get("lyrics")
    except Exception as e:
        print(f"Error extracting metadata tags: {e}")
        
    if not resolved_title:
        resolved_title = os.path.splitext(filename)[0]
        
    # Get or create album if provided or extracted
    resolved_album_title = album_title if album_title else (extracted_album if extracted_album else None)
    album_id = None
    if resolved_album_title:
        album = db.query(Album).filter(Album.title == resolved_album_title, Album.artist_id == artist.id).first()
        if not album:
            album = Album(title=resolved_album_title, artist_id=artist.id)
            db.add(album)
            db.commit()
            db.refresh(album)
        album_id = album.id

    # Create Track model in pending status
    track = Track(
        title=resolved_title,
        artist_id=artist.id,
        album_id=album_id,
        approved=False,
        file_format=ext[1:].upper(),
        artist_name_override=artist_name if artist_name else (extracted_artist if extracted_artist else None),
        composer=composer if composer else (extracted_composer if extracted_composer else None),
        lyricist=lyricist if lyricist else (extracted_lyricist if extracted_lyricist else None),
        year=year if year is not None else (extracted_year if extracted_year is not None else None),
        lyrics=lyrics if lyrics else (extracted_lyrics if extracted_lyrics else None),
        language=language
    )
    db.add(track)
    db.commit()
    db.refresh(track)
    
    # Process genres
    if genres:
        genre_list = [g.strip() for g in genres.split(",") if g.strip()]
        for genre_name in genre_list:
            g_model = db.query(Genre).filter(Genre.name == genre_name).first()
            if not g_model:
                g_model = Genre(name=genre_name)
                db.add(g_model)
                db.commit()
                db.refresh(g_model)
            track.genres.append(g_model)
        db.commit()
        
    # Try to extract embedded cover image from audio track
    try:
        from app.services.audio import extract_embedded_cover
        from app.services.storage import upload_file
        
        # Temp image path in same shared tmp directory
        temp_img_path = temp_file_path + ".jpg"
        if extract_embedded_cover(temp_file_path, temp_img_path):
            cover_key = f"covers/{track.id}.jpg"
            with open(temp_img_path, 'rb') as img_f:
                file_bytes = img_f.read()
                upload_file(file_bytes, cover_key, content_type="image/jpeg")
            track.cover_image_path = cover_key
            
            # If the track has an album, and the album has no cover art yet, copy/set it
            if track.album and not track.album.cover_art_url:
                track.album.cover_art_url = cover_key
                db.add(track.album)
                
            db.commit()
            
            # Clean up temp image
            if os.path.exists(temp_img_path):
                os.remove(temp_img_path)
    except Exception as e:
        print(f"Error extracting embedded cover art: {e}")

    # Trigger spectral quality analysis background task
    analyze_audio_task.delay(track.id, temp_file_path)
    
    return {"message": "Track uploaded and analysis scheduled", "track_id": track.id}

@router.post("/{track_id}/transcribe")
async def transcribe_track_lyrics(
    track_id: int,
    language: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_studio_admin)
):
    """
    Manually trigger AI transcription for a track's audio file.
    Supports multiple languages.
    """
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
        
    # Check if the user is the owner/artist or admin
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    if not artist or (track.artist_id != artist.id and current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Not authorized to edit this track")
        
    if not track.original_file_path:
        raise HTTPException(status_code=400, detail="Original audio file not found for this track")
        
    # Download file to temp path
    from app.services.storage import s3_client, settings
    import tempfile
    import os
    
    ext = os.path.splitext(track.original_file_path)[1].lower() or ".wav"
    fd, temp_file_path = tempfile.mkstemp(suffix=ext)
    os.close(fd)
    
    try:
        s3_client.download_file(
            Bucket=settings.S3_BUCKET_NAME,
            Key=track.original_file_path,
            Filename=temp_file_path
        )
        
        artist_name = track.artist_name_override if track.artist_name_override else (track.artist.stage_name if track.artist else "Unknown Artist")
        # Fallback to configured track language if none explicitly passed in manual request
        req_lang = language if language else track.language
        lyrics_text = transcribe_audio(temp_file_path, language=req_lang, track_title=track.title, artist_name=artist_name)
        
        track.lyrics = lyrics_text
        db.commit()
        db.refresh(track)
        
        return {"message": "Transcription completed", "lyrics": lyrics_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

@router.get("/autocomplete-suggestions")
def get_autocomplete_suggestions(
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    if current_user and current_user.role == "radio_admin":
        raise HTTPException(status_code=403, detail="Radio admins cannot access music metadata")
    """
    Returns unique existing values for autocomplete suggestions.
    """
    # Fetch distinct artists (both stage names and overrides)
    stage_names = db.query(Artist.stage_name).filter(Artist.is_active == True).distinct().all()
    override_names = db.query(Track.artist_name_override).join(Artist, Track.artist_id == Artist.id).filter(Track.artist_name_override != None, Artist.is_active == True).distinct().all()
    artists = sorted(list(set(
        [r[0] for r in stage_names if r[0]] + 
        [r[0] for r in override_names if r[0]]
    )))
    
    # Fetch distinct albums with pre-signed cover art URLs
    albums_db = db.query(Album).all()
    albums = {}
    for album in albums_db:
        if album.title:
            cover_url = generate_presigned_url(album.cover_art_url) if album.cover_art_url else ""
            if album.title not in albums or cover_url:
                albums[album.title] = cover_url
    
    # Fetch distinct composers
    composers_db = db.query(Track.composer).filter(Track.composer != None).distinct().all()
    composers = sorted([r[0] for r in composers_db if r[0] and r[0].strip() != ""])
    
    # Fetch distinct lyricists
    lyricists_db = db.query(Track.lyricist).filter(Track.lyricist != None).distinct().all()
    lyricists = sorted([r[0] for r in lyricists_db if r[0] and r[0].strip() != ""])
    
    # Fetch distinct languages
    languages_db = db.query(Track.language).filter(Track.language != None).distinct().all()
    languages = sorted([r[0] for r in languages_db if r[0] and r[0].strip() != ""])
    
    return {
        "artists": artists,
        "albums": albums,
        "composers": composers,
        "lyricists": lyricists,
        "languages": languages
    }

@router.get("", response_model=List[TrackResponse])
def list_tracks(
    search: Optional[str] = None,
    approved_only: Optional[bool] = True,
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    if current_user and current_user.role == "radio_admin":
        raise HTTPException(status_code=403, detail="Radio admins are not allowed to play music or search tracks.")
    """
    List audio tracks with search filter (Title, Artist Name, Album Title, Genre).
    Uses full text pattern matching.
    """
    query = db.query(Track)
    
    if approved_only:
        query = query.join(Artist, Track.artist_id == Artist.id).filter(Track.approved == True, Artist.is_active == True)
        
    if search:
        search_pattern = f"%{search}%"
        # Join tables for search if not already joined above
        if not approved_only:
            query = query.join(Artist, Track.artist_id == Artist.id)
            
        query = query.outerjoin(Album, Track.album_id == Album.id)\
                     .filter(
                         (Track.title.ilike(search_pattern)) | 
                         (Artist.stage_name.ilike(search_pattern)) | 
                         (Album.title.ilike(search_pattern))
                     )
                     
    tracks = query.order_by(Track.created_at.desc()).all()
    return [serialize_track(t, db, viewer=current_user) for t in tracks]


@router.get("/manage", response_model=List[TrackResponse])
def manage_tracks(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_studio_admin)
):
    """
    List audio tracks for management screen.
    Admin sees all uploaded tracks.
    Artist sees only their own uploaded tracks.
    """
    if current_user.role == "admin":
        tracks = db.query(Track).order_by(Track.created_at.desc()).all()
    else:
        artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
        if not artist:
            return []
        tracks = db.query(Track).filter(Track.artist_id == artist.id).order_by(Track.created_at.desc()).all()
        
    return [serialize_track(t, db) for t in tracks]

@router.get("/{id}", response_model=TrackResponse)
def get_track(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    if current_user and current_user.role == "radio_admin":
        raise HTTPException(status_code=403, detail="Radio admins are not allowed to play music or search tracks.")
    track = db.query(Track).filter(Track.id == id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    is_owner_or_admin = False
    if current_user:
        if current_user.role == "admin":
            is_owner_or_admin = True
        else:
            artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
            is_owner_or_admin = bool(artist and track.artist_id == artist.id)

    if not track.approved and not is_owner_or_admin:
        raise HTTPException(status_code=404, detail="Track not found")
        
    if track.artist and not track.artist.is_active and (not current_user or current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Track is currently unavailable (Studio is disabled)")
        
    return serialize_track(track, db, viewer=current_user)

@router.delete("/{id}", status_code=status.HTTP_200_OK)
def delete_track(
    id: int, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_studio_admin)
):
    track = db.query(Track).filter(Track.id == id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
        
    # Ensure artist is deleting their own track, or is admin
    if current_user.role != "admin":
        artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
        if not artist or track.artist_id != artist.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this track")
            
    # Delete files from S3/MinIO
    if track.original_file_path:
        delete_file(track.original_file_path)
    if track.mp3_320_path:
        delete_file(track.mp3_320_path)
    if track.aac_256_path:
        delete_file(track.aac_256_path)
    if track.aac_128_path:
        delete_file(track.aac_128_path)
    # Note: deleting the entire HLS folder structure key prefixes
    if track.hls_playlist_path:
        delete_prefix(f"hls/{track.id}/")
        delete_file(track.hls_playlist_path)
        
    db.delete(track)
    db.commit()
    return {"message": "Track successfully deleted"}

@router.get("/{id}/quality", response_model=AudioAnalysisReportResponse)
def get_quality_report(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_studio_admin),
):
    track = db.query(Track).filter(Track.id == id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    if not _user_can_manage_track(current_user, track, db):
        raise HTTPException(status_code=403, detail="Not authorized to view this quality report")

    report = db.query(AudioAnalysisReport).filter(AudioAnalysisReport.track_id == id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Audio analysis report not found for this track")
        
    # Pre-sign spectrogram image URL
    if report.spectrogram_path:
        report.spectrogram_path = generate_presigned_url(report.spectrogram_path)
        
    return report

@router.post("/{id}/approve", response_model=TrackResponse)
def manually_approve_track(
    id: int,
    approved: bool,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    """
    Manually approve or reject a track (Admin feature).
    """
    track = db.query(Track).filter(Track.id == id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
        
    track.approved = approved
    db.commit()
    db.refresh(track)
    
    if approved and not track.hls_playlist_path:
        from app.tasks.tasks import transcode_audio_task
        transcode_audio_task.delay(track.id, None)
        
    return serialize_track(track, db)

@router.post("/{id}/play", status_code=status.HTTP_200_OK)
def log_track_play(
    id: int,
    bytes_streamed: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Logs track plays and records bandwidth for analytics tracking.
    """
    track = db.query(Track).filter(Track.id == id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    if not track.approved:
        raise HTTPException(status_code=403, detail="Track is not approved for playback")
        
    # 1. Log play history
    history = ListeningHistory(user_id=current_user.id, track_id=track.id)
    db.add(history)
    
    if bytes_streamed is not None and bytes_streamed > 0:
        streamed = bytes_streamed
    elif track.bitrate and track.duration:
        streamed = int(track.duration * (track.bitrate / 8))
    else:
        streamed = int((track.duration or 180.0) * (256000 / 8))
    log = StreamingLog(user_id=current_user.id, track_id=track.id, bytes_streamed=streamed)
    db.add(log)
    
    db.commit()
    return {"message": "Play logged successfully"}


@router.websocket("/ws/tracks/status")
async def websocket_tracks_status(
    websocket: WebSocket,
    token: Optional[str] = None
):
    await websocket.accept()
    
    # Authenticate user from query parameter token
    user = None
    if token:
        from jose import jwt, JWTError
        from app.core.config import settings
        from app.models import User
        
        db = SessionLocal()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
        except JWTError:
            pass
        finally:
            db.close()
            
    if not user:
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close(code=1008)
        return

    if user.role not in ("admin", "studio_admin"):
        await websocket.send_json({"type": "error", "message": "Forbidden"})
        await websocket.close(code=1008)
        return
        
    monitored_ids = set()
    last_states = {} # track_id -> status
    
    try:
        while True:
            db = SessionLocal()
            try:
                # 1. Fetch current active tracks to start monitoring them
                query = db.query(Track).filter(
                    Track.hls_playlist_path.is_(None),
                    (Track.quality_score.is_(None) | (Track.approved == True))
                )
                if user.role != "admin":
                    artist = db.query(Artist).filter(Artist.user_id == user.id).first()
                    if artist:
                        query = query.filter(Track.artist_id == artist.id)
                    else:
                        query = query.filter(False)
                        
                active_tracks = query.all()
                for t in active_tracks:
                    monitored_ids.add(t.id)
                    
                if monitored_ids:
                    # 2. Query all monitored tracks
                    tracks = db.query(Track).filter(Track.id.in_(list(monitored_ids))).all()
                    updates = []
                    
                    for t in tracks:
                        if t.quality_score is None:
                            status = "analyzing"
                        elif t.approved and t.hls_playlist_path is None:
                            status = "transcoding"
                        elif t.approved and t.hls_playlist_path is not None:
                            status = "completed"
                        elif not t.approved and t.quality_score is not None:
                            status = "rejected"
                        else:
                            status = "failed"
                            
                        state = {
                            "track_id": t.id,
                            "status": status,
                            "quality_score": t.quality_score,
                            "quality_level": t.quality_level,
                            "approved": t.approved,
                            "title": t.title
                        }
                        
                        prev_status = last_states.get(t.id)
                        if prev_status != status:
                            updates.append(state)
                            last_states[t.id] = status
                            
                        if status in ["completed", "rejected", "failed"]:
                            # Remove from monitored_ids in next iteration
                            monitored_ids.discard(t.id)
                            last_states.pop(t.id, None)
                            
                    if updates:
                        await websocket.send_json({"type": "status_updates", "tracks": updates})
            except Exception as e:
                print(f"Error in tracks status websocket loop: {e}")
            finally:
                db.close()
                
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        pass


@router.websocket("/ws/analysis/{track_id}")
async def websocket_analysis(websocket: WebSocket, track_id: int, token: Optional[str] = None):
    await websocket.accept()

    user = None
    if token:
        from jose import jwt, JWTError
        from app.core.config import settings
        from app.models import User

        db = SessionLocal()
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user_id = payload.get("sub")
            if user_id:
                user = db.query(User).filter(User.id == int(user_id)).first()
        except JWTError:
            pass
        finally:
            db.close()

    if not user or user.role not in ("admin", "studio_admin"):
        await websocket.send_json({"status": "error", "message": "Unauthorized"})
        await websocket.close(code=1008)
        return

    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            await websocket.send_json({"status": "error", "message": "Track not found"})
            await websocket.close(code=1008)
            return
        if not _user_can_manage_track(user, track, db):
            await websocket.send_json({"status": "error", "message": "Forbidden"})
            await websocket.close(code=1008)
            return
    finally:
        db.close()

    try:
        while True:
            # Query in a short-lived session to avoid SQLAlchemy caching
            db = SessionLocal()
            try:
                track = db.query(Track).filter(Track.id == track_id).first()
                if not track:
                    await websocket.send_json({"status": "error", "message": "Track not found"})
                    break

                if track.quality_score is None:
                    await websocket.send_json({
                        "status": "analyzing",
                        "message": "Analyzing audio spectral signatures..."
                    })
                elif track.approved and track.hls_playlist_path is None:
                    await websocket.send_json({
                        "status": "transcoding",
                        "message": f"Approved ({track.quality_level}). Transcoding to adaptive streaming formats...",
                        "quality_score": track.quality_score,
                        "quality_level": track.quality_level
                    })
                elif not track.approved:
                    await websocket.send_json({
                        "status": "rejected",
                        "message": f"Rejected! Failed spectral verification checks (Score: {track.quality_score}%).",
                        "quality_score": track.quality_score,
                        "quality_level": track.quality_level
                    })
                    break
                elif track.approved and track.hls_playlist_path is not None:
                    await websocket.send_json({
                        "status": "completed",
                        "message": f"Approved and Transcoded! Ready to stream.",
                        "quality_score": track.quality_score,
                        "quality_level": track.quality_level,
                        "title": track.title
                    })
                    break
            except Exception as e:
                print(f"Error in websocket loop query: {e}")
                await websocket.send_json({"status": "error", "message": "Database query error"})
                break
            finally:
                db.close()
                
            await asyncio.sleep(1.5)
    except WebSocketDisconnect:
        pass


@router.put("/{track_id}")
async def update_track(
    track_id: int,
    request: Request,
    title: Optional[str] = Form(None),
    artist_name: Optional[str] = Form(None),
    album_title: Optional[str] = Form(None),
    composer: Optional[str] = Form(None),
    lyricist: Optional[str] = Form(None),
    year: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    genres: Optional[str] = Form(None),
    lyrics: Optional[str] = Form(None),
    cover_image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    """
    Update track details (title, genres, lyrics, and cover art).
    Only the owner artist or an admin can edit a track.
    """
    track = db.query(Track).filter(Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
        
    # Check permissions
    is_admin = current_user.role == "admin"
    artist = db.query(Artist).filter(Artist.user_id == current_user.id).first()
    is_owner = artist and track.artist_id == artist.id
    
    if not is_admin and not is_owner:
        raise HTTPException(status_code=403, detail="You do not have permission to edit this track")
        
    # Parse raw form keys to identify which fields are explicitly being sent.
    form_data = await request.form()
    
    # Update fields only if present in form payload
    if "title" in form_data:
        if title is not None and title.strip() != "":
            track.title = title.strip()
            
    if "lyrics" in form_data:
        track.lyrics = normalize_optional_string(lyrics)
        
    if "artist_name" in form_data:
        track.artist_name_override = normalize_optional_string(artist_name)
        
    if "composer" in form_data:
        track.composer = normalize_optional_string(composer)
        
    if "lyricist" in form_data:
        track.lyricist = normalize_optional_string(lyricist)
        
    if "year" in form_data:
        year_norm = normalize_optional_string(year)
        if year_norm is None:
            track.year = None
        else:
            try:
                track.year = int(year_norm)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid year format. Must be an integer.")
                
    if "language" in form_data:
        track.language = normalize_optional_string(language)

    if "album_title" in form_data:
        album_title_norm = normalize_optional_string(album_title)
        if album_title_norm is None:
            track.album_id = None
        else:
            album = db.query(Album).filter(Album.title == album_title_norm, Album.artist_id == track.artist_id).first()
            if not album:
                album = Album(title=album_title_norm, artist_id=track.artist_id)
                db.add(album)
                db.commit()
                db.refresh(album)
            track.album_id = album.id
        
    if "genres" in form_data:
        track.genres = []
        if genres is not None:
            genre_list = [g.strip() for g in genres.split(",") if g.strip()]
            for genre_name in genre_list:
                g_model = db.query(Genre).filter(Genre.name == genre_name).first()
                if not g_model:
                    g_model = Genre(name=genre_name)
                    db.add(g_model)
                    db.commit()
                    db.refresh(g_model)
                track.genres.append(g_model)
            
    if cover_image is not None and cover_image.filename:
        ext = os.path.splitext(cover_image.filename)[1].lower()
        if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
            raise HTTPException(status_code=400, detail="Invalid cover image format. Allowed: JPG, PNG, WEBP")
            
        cover_key = f"covers/{track.id}{ext}"
        file_bytes = cover_image.file.read()
        upload_file(file_bytes, cover_key, content_type=cover_image.content_type)
        track.cover_image_path = cover_key
        
        # If the track has an album, and the album has no cover art yet, let's copy/set it
        if track.album and not track.album.cover_art_url:
            track.album.cover_art_url = cover_key
            db.add(track.album)
        
    db.commit()
    db.refresh(track)
    return serialize_track(track, db)
