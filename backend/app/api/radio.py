import datetime
import time
import random
import secrets
import asyncio
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Set, Optional

from app.db.session import get_db
from app.models import RadioStation, RadioSchedule, Track, Artist
from app.schemas import RadioStationCreate, RadioStationUpdate, RadioStationResponse, RadioScheduleCreate, RadioScheduleResponse
from app.api.auth import get_current_admin, get_current_user, get_current_radio_admin, get_optional_current_user
from app.api.music import serialize_track
from app.services.storage import generate_presigned_url

class LiveStreamManager:
    def __init__(self):
        # Maps station_id (int) -> Set[asyncio.Queue] of listeners
        self.listeners: Dict[int, Set[asyncio.Queue]] = {}
        # Maps station_id (int) -> bool indicating if a broadcaster is currently connected
        self.broadcasters: Dict[int, bool] = {}

    def is_live(self, station_id: int) -> bool:
        return self.broadcasters.get(station_id, False)

    def register_listener(self, station_id: int) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=50)
        if station_id not in self.listeners:
            self.listeners[station_id] = set()
        self.listeners[station_id].add(q)
        return q

    def unregister_listener(self, station_id: int, q: asyncio.Queue):
        if station_id in self.listeners:
            self.listeners[station_id].discard(q)
            if not self.listeners[station_id]:
                del self.listeners[station_id]

    async def broadcast_chunk(self, station_id: int, chunk: bytes):
        if station_id not in self.listeners:
            return
        for q in list(self.listeners[station_id]):
            try:
                q.put_nowait(chunk)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(chunk)
                except Exception:
                    pass

    async def stop_broadcasting(self, station_id: int):
        self.broadcasters[station_id] = False
        if station_id in self.listeners:
            for q in list(self.listeners[station_id]):
                try:
                    q.put_nowait(None)
                except Exception:
                    pass

live_stream_manager = LiveStreamManager()

router = APIRouter(prefix="/radio", tags=["radio"])

def advance_station_if_needed(station: RadioStation, db: Session) -> Track:
    """
    Auto-DJ scheduler: advances the station current track if it has finished playing.
    If no tracks are scheduled, falls back to choosing a random approved track.
    """
    now = datetime.datetime.utcnow()
    
    # 1. Fetch current track details
    current_track = None
    if station.current_track_id:
        current_track = db.query(Track).filter(Track.id == station.current_track_id).first()
        
    # Check if current track has finished
    needs_advance = False
    if not current_track or not station.current_track_started_at:
        needs_advance = True
    else:
        duration = current_track.duration or 180.0 # 3 min default
        end_time = station.current_track_started_at + datetime.timedelta(seconds=duration)
        if now >= end_time:
            needs_advance = True
            
    if needs_advance:
        # Fetch next track in schedule queue
        next_schedule = None
        if current_track:
            # Find next schedule item with higher position
            curr_schedule = db.query(RadioSchedule).filter(
                RadioSchedule.station_id == station.id,
                RadioSchedule.track_id == current_track.id
            ).first()
            
            if curr_schedule:
                next_schedule = db.query(RadioSchedule).filter(
                    RadioSchedule.station_id == station.id,
                    RadioSchedule.position > curr_schedule.position
                ).order_by(RadioSchedule.position.asc()).first()
                
        # If no previous track, get the first scheduled item
        if not next_schedule:
            next_schedule = db.query(RadioSchedule).filter(
                RadioSchedule.station_id == station.id
            ).order_by(RadioSchedule.position.asc()).first()
            
        if next_schedule:
            # Advance to next scheduled track
            station.current_track_id = next_schedule.track_id
            station.current_track_started_at = now
            db.commit()
            db.refresh(station)
            current_track = next_schedule.track
        else:
            # Auto-DJ Fallback Mode: Pick a random approved track
            approved_tracks = db.query(Track).filter(Track.approved == True).all()
            if approved_tracks:
                random_track = random.choice(approved_tracks)
                station.current_track_id = random_track.id
                station.current_track_started_at = now
                db.commit()
                db.refresh(station)
                current_track = random_track
            else:
                station.current_track_id = None
                station.current_track_started_at = None
                db.commit()
                db.refresh(station)
                current_track = None
                
    return current_track

def serialize_station(station: RadioStation, db: Session) -> dict:
    # Ensure stream key exists
    if not station.stream_key:
        station.stream_key = "rs_key_" + secrets.token_hex(16) + "_" + str(int(time.time()))
        db.commit()
        db.refresh(station)

    listeners_count = len(live_stream_manager.listeners.get(station.id, set()))

    # If broadcaster is active, stream live from WebSocket broker
    if live_stream_manager.is_live(station.id):
        return {
            "id": station.id,
            "name": station.name,
            "description": station.description,
            "cover_art_url": station.cover_art_url or "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop",
            "is_active": station.is_active,
            "stream_url": f"/api/radio/{station.id}/live",
            "owner_id": station.owner_id,
            "stream_key": station.stream_key,
            "current_track_id": None,
            "current_track_started_at": None,
            "current_track_title": station.current_program_title or "Live Broadcast",
            "current_track_artist": station.rj_name or station.name,
            "current_track_duration": None,
            "current_offset": 0.0,
            "current_program_title": station.current_program_title,
            "rj_name": station.rj_name,
            "rj_details": station.rj_details,
            "listeners_count": listeners_count,
            "is_online": True
        }

    if station.stream_url:
        return {
            "id": station.id,
            "name": station.name,
            "description": station.description,
            "cover_art_url": station.cover_art_url or "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop",
            "is_active": station.is_active,
            "stream_url": station.stream_url,
            "owner_id": station.owner_id,
            "stream_key": station.stream_key,
            "current_track_id": None,
            "current_track_started_at": None,
            "current_track_title": station.current_program_title or "Live Broadcast",
            "current_track_artist": station.rj_name or station.name,
            "current_track_duration": None,
            "current_offset": 0.0,
            "current_program_title": station.current_program_title,
            "rj_name": station.rj_name,
            "rj_details": station.rj_details,
            "listeners_count": listeners_count,
            "is_online": True
        }

    # Otherwise, the station is offline (no live broadcaster, no stream url)
    return {
        "id": station.id,
        "name": station.name,
        "description": station.description,
        "cover_art_url": station.cover_art_url or "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop",
        "is_active": station.is_active,
        "stream_url": None,
        "owner_id": station.owner_id,
        "stream_key": station.stream_key,
        "current_track_id": None,
        "current_track_started_at": None,
        "current_track_title": "Offline",
        "current_track_artist": "No active broadcast",
        "current_track_duration": None,
        "current_offset": 0.0,
        "current_program_title": station.current_program_title,
        "rj_name": station.rj_name,
        "rj_details": station.rj_details,
        "listeners_count": 0,
        "is_online": False
    }

@router.post("", response_model=RadioStationResponse)
def create_radio_station(
    station_in: RadioStationCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_radio_admin)
):
    if current_user.role == "radio_admin":
        existing_station = db.query(RadioStation).filter(RadioStation.owner_id == current_user.id).first()
        if existing_station:
            raise HTTPException(status_code=400, detail="Radio admin can only register one radio station")

    resolved_owner_id = current_user.id
    if current_user.role == "admin" and station_in.owner_id is not None:
        resolved_owner_id = station_in.owner_id
        
    station = RadioStation(
        name=station_in.name,
        description=station_in.description,
        stream_url=station_in.stream_url,
        owner_id=resolved_owner_id,
        stream_key="rs_key_" + secrets.token_hex(16) + "_" + str(int(time.time())),
        is_active=True
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return serialize_station(station, db)

@router.put("/{id}", response_model=RadioStationResponse)
def update_radio_station(
    id: int,
    station_in: RadioStationUpdate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_radio_admin)
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")
        
    if current_user.role != "admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this station")
        
    if station_in.name is not None:
        station.name = station_in.name
    if station_in.description is not None:
        station.description = station_in.description
    if station_in.stream_url is not None:
        station.stream_url = station_in.stream_url
    if station_in.current_program_title is not None:
        station.current_program_title = station_in.current_program_title
    if station_in.rj_name is not None:
        station.rj_name = station_in.rj_name
    if station_in.rj_details is not None:
        station.rj_details = station_in.rj_details
        
    db.commit()
    db.refresh(station)
    return serialize_station(station, db)

@router.get("", response_model=List[RadioStationResponse])
def list_radio_stations(
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    if current_user and current_user.role == "radio_admin":
        stations = db.query(RadioStation).filter(RadioStation.owner_id == current_user.id, RadioStation.is_active == True).all()
    else:
        stations = db.query(RadioStation).filter(RadioStation.is_active == True).all()
    return [serialize_station(s, db) for s in stations]

@router.post("/{id}/schedule", response_model=RadioScheduleResponse)
def add_track_to_schedule(
    id: int,
    sched_in: RadioScheduleCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_radio_admin)
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")
        
    if current_user.role != "admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this station's schedule")
        
    track = db.query(Track).filter(Track.id == sched_in.track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
        
    # Get max position
    max_pos = 0
    curr_schedules = db.query(RadioSchedule).filter(RadioSchedule.station_id == id).all()
    if curr_schedules:
        max_pos = max(s.position for s in curr_schedules)
        
    schedule = RadioSchedule(
        station_id=id,
        track_id=sched_in.track_id,
        position=max_pos + 1
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    
    # Serialize the linked track using serialize_track
    serialized_track = serialize_track(track, db)
    
    return {
        "id": schedule.id,
        "station_id": schedule.station_id,
        "track_id": schedule.track_id,
        "position": schedule.position,
        "track": serialized_track
    }

@router.get("/{id}/stream")
def get_station_stream_sync(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    """
    Returns current sync info for client playback:
    The current track details and pre-signed streaming URL + HLS URL,
    along with offset in seconds to seek to.
    """
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")
        
    if current_user and current_user.role == "radio_admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Radio admins can only access their own radio station")

    if live_stream_manager.is_live(station.id):
        return {
            "station_id": station.id,
            "station_name": station.name,
            "track_id": station.id * 100,
            "title": "Live Broadcast",
            "artist": station.name,
            "duration": None,
            "stream_url": f"/api/radio/{station.id}/live",
            "offset": 0.0
        }

    if station.stream_url:
        return {
            "station_id": station.id,
            "station_name": station.name,
            "track_id": station.id * 100,
            "title": "Live Broadcast",
            "artist": station.name,
            "duration": None,
            "stream_url": station.stream_url,
            "offset": 0.0
        }

    raise HTTPException(status_code=404, detail="Station is offline (no live broadcast available)")

# New routes for WebSockets live streaming ingestion and HTTP listener streaming
@router.websocket("/stream/ws")
async def websocket_stream_endpoint(
    websocket: WebSocket,
    stream_key: Optional[str] = None,
    token: Optional[str] = None,
    station_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    station = None
    if token:
        # Validate JWT token
        try:
            from jose import jwt
            from app.core.config import settings
            from app.core.security import ALGORITHM
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
            user_id = int(payload.get("sub"))
            
            # Fetch user to verify role and permissions
            from app.models import User
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="User Not Found")
                return
                
            if station_id:
                station = db.query(RadioStation).filter(RadioStation.id == station_id).first()
                if not station:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Station Not Found")
                    return
                # Check permissions: must be admin or the station owner
                if user.role != "admin" and station.owner_id != user.id:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not Authorized")
                    return
            else:
                # Find station owned by this user
                station = db.query(RadioStation).filter(RadioStation.owner_id == user_id).first()
        except Exception as e:
            print("WebSocket token validation failed:", e)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid Token")
            return
    elif stream_key:
        # Verify stream key
        station = db.query(RadioStation).filter(RadioStation.stream_key == stream_key).first()
        if not station:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid Stream Key")
            return

        # Check key expiration (5 minutes validity for connecting)
        try:
            parts = stream_key.split("_")
            if len(parts) >= 4:  # "rs", "key", hex, timestamp
                timestamp = int(parts[-1])
                import time
                if time.time() - timestamp > 300:  # 5 minutes
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Stream Key Expired")
                    return
        except Exception as e:
            print("Error checking stream key expiration:", e)
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid Stream Key Format")
            return
    else:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication Required")
        return

    if not station:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Station Not Found")
        return

    await websocket.accept()
    station_id = station.id
    live_stream_manager.broadcasters[station_id] = True
    print(f"Broadcaster connected to station {station.name} (ID: {station_id})")

    try:
        while True:
            # Receive audio chunk as bytes
            data = await websocket.receive_bytes()
            if data:
                await live_stream_manager.broadcast_chunk(station_id, data)
    except WebSocketDisconnect:
        print(f"Broadcaster disconnected from station {station.name} (ID: {station_id})")
    except Exception as e:
        print(f"Broadcaster error on station {station.name} (ID: {station_id}): {e}")
    finally:
        await live_stream_manager.stop_broadcasting(station_id)

@router.get("/{id}/live")
async def get_live_audio_stream(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")

    if current_user and current_user.role == "radio_admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Radio admins can only access their own radio station")

    async def audio_generator():
        queue = live_stream_manager.register_listener(id)
        try:
            while True:
                if not live_stream_manager.is_live(id):
                    break
                chunk = await queue.get()
                if chunk is None:
                    break
                yield chunk
        except asyncio.CancelledError:
            pass
        finally:
            live_stream_manager.unregister_listener(id, queue)

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        }
    )

@router.post("/{id}/regenerate-key", response_model=RadioStationResponse)
def regenerate_stream_key(
    id: int,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_radio_admin)
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")
        
    if current_user.role != "admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this station")
        
    station.stream_key = "rs_key_" + secrets.token_hex(16) + "_" + str(int(time.time()))
    db.commit()
    db.refresh(station)
    return serialize_station(station, db)
