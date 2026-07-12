import datetime
import os
import json
import urllib.request
import urllib.parse
import time
import random
import secrets
import asyncio
from collections import deque
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Header, Request, File, UploadFile
from pydantic import BaseModel

try:
    from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack, RTCConfiguration, RTCIceServer
except ImportError:
    RTCPeerConnection = None
    RTCSessionDescription = None
    RTCConfiguration = None
    RTCIceServer = None
    class MediaStreamTrack:
        pass
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Dict, Set, Optional

from app.db.session import get_db
from app.models import RadioStation, RadioSchedule, Track, Artist, User
from app.schemas import (
    RadioStationCreate,
    RadioStationUpdate,
    RadioStationResponse,
    RadioScheduleCreate,
    RadioScheduleResponse,
    VerifyBroadcastKeyRequest,
    VerifyBroadcastKeyResponse,
)
from app.api.auth import get_current_admin, get_current_user, get_current_radio_admin, get_optional_current_user
from app.core.rate_limit import enforce_rate_limit
from app.core.stream_url import validate_radio_stream_url
from app.core.user_mode import apply_user_mode
from app.core.ws_auth import extract_ws_token, resolve_ws_user
from app.api.music import serialize_track
from app.services.storage import generate_presigned_url
from app.services.live_stream import live_stream_manager
from app.services.licence_documents import licence_document_url, store_licence_document
from app.services.cover_images import resolve_cover_art_url_with_fallback, store_profile_cover

# =====================================================================
# SERVER-SIDE WEBRTC DELIVERY (SFU relay from LiveStreamManager queue)
# =====================================================================
if RTCPeerConnection is not None:
    try:
        import fractions
        from av import AudioFrame
        import numpy as np

        class AudioRelayTrack(MediaStreamTrack):
            """A server-side MediaStreamTrack that pulls decoded PCM audio
            from LiveStreamManager's queue and streams it to a WebRTC listener.
            The inbound stream is MP3; we decode with PyAV and relay raw PCM."""
            kind = "audio"

            def __init__(self, station_id: int, buffer_sec: Optional[float] = None):
                super().__init__()
                self.station_id = station_id
                self._pts = 0
                self._sample_rate = 48000
                self._channels = 2
                self._running = True
                self._buffering = True
                self._queue: asyncio.Queue = asyncio.Queue(maxsize=100)
                self._frames_sent = 0
                
                # Configurable buffering threshold (default: 1.5 seconds)
                default_buffer = float(os.environ.get("WEBRTC_BUFFER_SEC", "1.5"))
                self._buffer_sec = buffer_sec if buffer_sec is not None else default_buffer
                self._buffering_threshold = int(self._buffer_sec * 48000)

                import av
                self._codec = av.CodecContext.create('mp3', 'r')
                self._codec.open()
                self._resampler = av.AudioResampler(
                    format='s16',
                    layout='stereo',
                    rate=48000
                )
                self._fifo = av.AudioFifo()

            async def recv(self):
                try:
                    # 1. Buffering state: block and wait for chunks until the FIFO has enough samples
                    if self._buffering:
                        while self._fifo.samples < self._buffering_threshold:
                            chunk = await self._queue.get()
                            try:
                                packets = self._codec.parse(chunk)
                                for packet in packets:
                                    for frame in self._codec.decode(packet):
                                        if self._frames_sent % 500 == 0:
                                            print(f"DEBUG Incoming: Layout={frame.layout.name}, rate={frame.sample_rate}", flush=True)
                                        resampled = self._resampler.resample(frame)
                                        if resampled:
                                            for f in resampled:
                                                self._fifo.write(f)
                            except Exception as e:
                                print(f"Error decoding during WebRTC buffering: {e}", flush=True)
                        self._buffering = False

                    # 2. Underflow protection: if buffer ran dry during active play
                    if self._fifo.samples < 960:
                        self._buffering = True
                        combined = np.zeros((1, 960 * 2), dtype='int16')
                        frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                        frame.sample_rate = 48000
                        frame.time_base = fractions.Fraction(1, 48000)
                        frame.pts = self._pts
                        self._pts += 960
                        return frame

                    # 3. Read exactly 960 samples from the FIFO (20ms Opus frame)
                    frame = self._fifo.read(960)
                    if self._frames_sent % 500 == 0:
                        print(f"DEBUG WebRTC: Frame format={frame.format.name}, layout={frame.layout.name}, samples={frame.samples}, rate={frame.sample_rate}", flush=True)
                    
                    frame.pts = self._pts
                    frame.time_base = fractions.Fraction(1, 48000)
                    self._pts += 960
                    self._frames_sent += 1
                    return frame
                except Exception as e:
                    import traceback
                    print(f"FATAL ERROR in recv(): {type(e)} {e}", flush=True)
                    print(traceback.format_exc(), flush=True)
                    
                    combined = np.zeros((1, 960 * 2), dtype='int16')
                    frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                    frame.sample_rate = 48000
                    frame.time_base = fractions.Fraction(1, 48000)
                    frame.pts = self._pts
                    self._pts += 960
                    return frame

        AUDIO_RELAY_TRACK_CLASS = AudioRelayTrack
    except ImportError:
        AUDIO_RELAY_TRACK_CLASS = None
else:
    AUDIO_RELAY_TRACK_CLASS = None


class WebRTCManager:
    """Manages WebRTC listener peer connections for server-side audio relay."""
    def __init__(self):
        # Maps station_id -> Set[RTCPeerConnection]
        self.listeners: Dict[int, Set] = {}
        # Maps station_id -> Set[AudioRelayTrack] so we can push chunks
        self.relay_tracks: Dict[int, Set] = {}

    def is_live(self, station_id: int) -> bool:
        # WebRTC is live when the underlying LiveStreamManager has an active WS broadcaster
        return live_stream_manager.is_live(station_id)

    def register_listener(self, station_id: int, pc, track):
        if station_id not in self.listeners:
            self.listeners[station_id] = set()
            self.relay_tracks[station_id] = set()
        self.listeners[station_id].add(pc)
        self.relay_tracks[station_id].add(track)
        print(f"DEBUG: WebRTC listener registered. Initial connectionState: {pc.connectionState}", flush=True)

        # Pre-populate the WebRTC track's queue with history chunks to fill the buffer instantly
        history = live_stream_manager.history.get(station_id)
        if history:
            for chunk in history:
                try:
                    track._queue.put_nowait(chunk)
                except asyncio.QueueFull:
                    break

        @pc.on("connectionstatechange")
        def on_state_change():
            print(f"DEBUG: WebRTC connection state change for station {station_id}: {pc.connectionState}", flush=True)
            if pc.connectionState in ["failed", "closed", "disconnected"]:
                self.listeners.get(station_id, set()).discard(pc)
                self.relay_tracks.get(station_id, set()).discard(track)

    async def push_chunk(self, station_id: int, chunk: bytes):
        """Push an MP3 chunk to all relay tracks for this station."""
        for track in list(self.relay_tracks.get(station_id, set())):
            try:
                track._queue.put_nowait(chunk)
            except asyncio.QueueFull:
                try:
                    track._queue.get_nowait()
                    track._queue.put_nowait(chunk)
                except Exception:
                    pass


webrtc_manager = WebRTCManager()

router = APIRouter(prefix="/radio", tags=["radio"])



def get_timezone_from_location(country: str, state: str, postal_code: str) -> str:
    parts = []
    if postal_code:
        parts.append(postal_code)
    if state:
        parts.append(state)
    if country:
        parts.append(country)
        
    if not parts:
        return "UTC"
        
    query = ", ".join(parts)
    encoded_query = urllib.parse.quote(query)
    
    # 1. Geocode via Nominatim
    geocode_url = f"https://nominatim.openstreetmap.org/search?q={encoded_query}&format=json&limit=1"
    req = urllib.request.Request(
        geocode_url, 
        headers={'User-Agent': 'VeriSonicBroadcaster/1.0 (contact@verisonic.com)'}
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            data = json.loads(response.read().decode())
            if data and len(data) > 0:
                lat = data[0].get("lat")
                lon = data[0].get("lon")
                
                # 2. Lookup Timezone via timeapi.io
                tz_url = f"https://timeapi.io/api/Time/current/coordinate?latitude={lat}&longitude={lon}"
                tz_req = urllib.request.Request(tz_url, headers={'User-Agent': 'VeriSonicBroadcaster/1.0'})
                with urllib.request.urlopen(tz_req, timeout=3) as tz_response:
                    tz_data = json.loads(tz_response.read().decode())
                    timezone_name = tz_data.get("timeZone")
                    if timezone_name:
                        return timezone_name
    except Exception as e:
        print(f"Error resolving timezone: {e}")
        
    # Static mappings fallback for safety if APIs fail or are offline
    country_upper = country.upper() if country else ""
    if "US" in country_upper or "UNITED STATES" in country_upper:
        state_upper = state.upper() if state else ""
        if state_upper in ["CA", "OR", "WA", "NV"]: return "America/Los_Angeles"
        if state_upper in ["NY", "NJ", "MA", "PA", "FL", "GA", "NC"]: return "America/New_York"
        if state_upper in ["TX", "IL", "CH", "MX"]: return "America/Chicago"
        if state_upper in ["CO", "AZ", "UT", "NM"]: return "America/Denver"
        return "America/New_York"
    if "IN" in country_upper or "INDIA" in country_upper:
        return "Asia/Kolkata"
    if "GB" in country_upper or "UK" in country_upper or "UNITED KINGDOM" in country_upper:
        return "Europe/London"
    if "AU" in country_upper or "AUSTRALIA" in country_upper:
        return "Australia/Sydney"
        
    return "UTC"


def _viewer_can_see_stream_key(viewer: Optional[User], station: RadioStation) -> bool:
    if viewer is None:
        return False
    role = getattr(viewer, "_real_role", None) or viewer.role
    if role == "admin":
        return True
    if role == "radio_admin" and station.owner_id == viewer.id:
        return True
    return False


def _ensure_stream_key_fresh(station: RadioStation, db: Session) -> None:
    is_expired = False
    if station.stream_key:
        try:
            parts = station.stream_key.split("_")
            if len(parts) >= 4:
                timestamp = int(parts[-1])
                if int(time.time()) - timestamp > 300:
                    is_expired = True
        except Exception:
            is_expired = True

    if not station.stream_key or is_expired:
        station.stream_key = "rs_key_" + secrets.token_hex(16) + "_" + str(int(time.time()))
        db.commit()
        db.refresh(station)


def _verify_station_stream_key(station: RadioStation, stream_key: str) -> bool:
    provided = stream_key.strip()
    if not provided or not station.stream_key or station.stream_key != provided:
        return False
    try:
        parts = provided.split("_")
        if len(parts) < 4 or not provided.startswith("rs_key_"):
            return False
        timestamp = int(parts[-1])
        if time.time() - timestamp > 330:
            return False
        return True
    except Exception:
        return False


def _admin_owner_fields(db: Session, viewer: Optional[User], owner_id: Optional[int]) -> dict:
    if not viewer or getattr(viewer, "role", None) != "admin" or not owner_id:
        return {}
    owner = db.query(User).filter(User.id == owner_id).first()
    if not owner:
        return {}
    return {"owner_name": owner.full_name, "owner_email": owner.email}


def _can_view_licence_document(viewer: Optional[User], owner_id: Optional[int]) -> bool:
    if not viewer:
        return False
    if getattr(viewer, "role", None) == "admin":
        return True
    if getattr(viewer, "role", None) == "radio_admin" and owner_id == viewer.id:
        return True
    return False


def serialize_station(
    station: RadioStation,
    db: Session,
    viewer: Optional[User] = None,
    *,
    include_stream_key: bool = False,
) -> dict:
    admin_owner = _admin_owner_fields(db, viewer, station.owner_id)
    stream_key_value = None
    if include_stream_key and _viewer_can_see_stream_key(viewer, station):
        _ensure_stream_key_fresh(station, db)
        stream_key_value = station.stream_key

    webrtc_listeners = len(webrtc_manager.listeners.get(station.id, set())) if hasattr(webrtc_manager, 'listeners') else 0
    websocket_listeners = len(live_stream_manager.listeners.get(station.id, set()))
    listeners_count = webrtc_listeners + websocket_listeners

    # Determine dynamic active program title and RJ name based on current time
    active_program_title = station.current_program_title
    active_rj_name = station.rj_name

    if station.programs_list:
        try:
            programs = json.loads(station.programs_list)
            if isinstance(programs, list) and len(programs) > 0:
                current_time = datetime.datetime.utcnow() # Always resolve active program based on current UTC time!
                current_minutes = current_time.hour * 60 + current_time.minute
                matched = False
                for prog in programs:
                    time_from = prog.get('timeFrom')
                    time_to = prog.get('timeTo')
                    if time_from and time_to:
                        try:
                            from_h, from_m = map(int, time_from.split(':'))
                            to_h, to_m = map(int, time_to.split(':'))
                            from_min = from_h * 60 + from_m
                            to_min = to_h * 60 + to_m
                            
                            if to_min > from_min:
                                if from_min <= current_minutes <= to_min:
                                    active_program_title = prog.get('title')
                                    active_rj_name = prog.get('rj')
                                    matched = True
                                    break
                            else:
                                if current_minutes >= from_min or current_minutes <= to_min:
                                    active_program_title = prog.get('title')
                                    active_rj_name = prog.get('rj')
                                    matched = True
                                    break
                        except Exception:
                            continue
                if not matched:
                    # Fallback to first program if none matched
                    active_program_title = programs[0].get('title')
                    active_rj_name = programs[0].get('rj')
        except Exception:
            pass

    # Common profile fields
    profile_data = {
        "category": station.category,
        "licence": station.licence,
        "licence_document_url": (
            licence_document_url(station.licence_document_path)
            if _can_view_licence_document(viewer, station.owner_id)
            else None
        ),
        "street_address": station.street_address,
        "city": station.city,
        "state_province": station.state_province,
        "postal_code": station.postal_code,
        "country": station.country,
        "phone": station.phone,
        "email": station.email,
        "website": station.website,
        "broadcast_frequency": station.broadcast_frequency,
        "languages": station.languages,
        "social_twitter": station.social_twitter,
        "social_instagram": station.social_instagram,
        "programs_list": station.programs_list,
        "timezone": station.timezone or "UTC",
    }

    # If broadcaster is active (WebSocket ingest), serve live stream
    # WebRTC delivery is available as an alternative transport for listeners
    if live_stream_manager.is_live(station.id):
        return {
            "id": station.id,
            "name": station.name,
            "description": station.description,
            "cover_art_url": resolve_cover_art_url_with_fallback(station.cover_art_url),
            "is_active": station.is_active,
            "stream_url": f"/api/radio/{station.id}/live",
            "owner_id": station.owner_id,
            "stream_key": stream_key_value,
            "current_track_id": None,
            "current_track_started_at": None,
            "current_track_title": active_program_title or "Live Broadcast",
            "current_track_artist": active_rj_name or station.name,
            "current_track_duration": None,
            "current_offset": 0.0,
            "current_program_title": active_program_title,
            "rj_name": active_rj_name,
            "rj_details": station.rj_details,
            "listeners_count": listeners_count,
            "is_online": True,
            **profile_data,
            **admin_owner,
        }

    if station.stream_url and station.stream_url.startswith("/api/radio/"):
        return {
            "id": station.id,
            "name": station.name,
            "description": station.description,
            "cover_art_url": resolve_cover_art_url_with_fallback(station.cover_art_url),
            "is_active": station.is_active,
            "stream_url": station.stream_url,
            "owner_id": station.owner_id,
            "stream_key": stream_key_value,
            "current_track_id": None,
            "current_track_started_at": None,
            "current_track_title": active_program_title or "Live Broadcast",
            "current_track_artist": active_rj_name or station.name,
            "current_track_duration": None,
            "current_offset": 0.0,
            "current_program_title": active_program_title,
            "rj_name": active_rj_name,
            "rj_details": station.rj_details,
            "listeners_count": listeners_count,
            "is_online": True,
            **profile_data,
            **admin_owner,
        }

    # Otherwise, the station is offline (no live broadcaster, no stream url)
    return {
        "id": station.id,
        "name": station.name,
        "description": station.description,
        "cover_art_url": resolve_cover_art_url_with_fallback(station.cover_art_url),
        "is_active": station.is_active,
        "stream_url": None,
        "owner_id": station.owner_id,
        "stream_key": stream_key_value,
        "current_track_id": None,
        "current_track_started_at": None,
        "current_track_title": "Offline",
        "current_track_artist": "No active broadcast",
        "current_track_duration": None,
        "current_offset": 0.0,
        "current_program_title": active_program_title,
        "rj_name": active_rj_name,
        "rj_details": station.rj_details,
        "listeners_count": 0,
        "is_online": False,
        **profile_data,
        **admin_owner,
    }

@router.post("", response_model=RadioStationResponse)
def create_radio_station(
    station_in: RadioStationCreate,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_radio_admin)
):
    resolved_owner_id = current_user.id
    if current_user.role == "admin" and station_in.owner_id is not None:
        resolved_owner_id = station_in.owner_id
        
    resolved_tz = station_in.timezone
    if not resolved_tz:
        resolved_tz = get_timezone_from_location(
            station_in.country,
            station_in.state_province,
            station_in.postal_code
        )

    station = RadioStation(
        name=station_in.name,
        description=station_in.description,
        stream_url=validate_radio_stream_url(station_in.stream_url) if station_in.stream_url else None,
        owner_id=resolved_owner_id,
        stream_key="rs_key_" + secrets.token_hex(16) + "_" + str(int(time.time())),
        is_active=True,
        category=station_in.category,
        licence=station_in.licence,
        street_address=station_in.street_address,
        city=station_in.city,
        state_province=station_in.state_province,
        postal_code=station_in.postal_code,
        country=station_in.country,
        phone=station_in.phone,
        email=station_in.email,
        website=station_in.website,
        broadcast_frequency=station_in.broadcast_frequency,
        languages=station_in.languages,
        social_twitter=station_in.social_twitter,
        social_instagram=station_in.social_instagram,
        programs_list=station_in.programs_list,
        timezone=resolved_tz
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return serialize_station(station, db, viewer=current_user, include_stream_key=True)

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
        
    # Check if radio admin is trying to bypass deactivation or alter disabled_reason directly
    if current_user.role != "admin":
        if station_in.is_active is not None or station_in.disabled_reason is not None:
            raise HTTPException(status_code=403, detail="Only platform admins can change active status or edit disable reason.")
        
    if station_in.name is not None:
        station.name = station_in.name
    if station_in.description is not None:
        station.description = station_in.description
    if station_in.stream_url is not None:
        station.stream_url = validate_radio_stream_url(station_in.stream_url)
    if station_in.current_program_title is not None:
        station.current_program_title = station_in.current_program_title
    if station_in.rj_name is not None:
        station.rj_name = station_in.rj_name
    if station_in.rj_details is not None:
        station.rj_details = station_in.rj_details
    if station_in.category is not None:
        station.category = station_in.category
    if station_in.licence is not None:
        station.licence = station_in.licence
    if station_in.street_address is not None:
        station.street_address = station_in.street_address
    if station_in.city is not None:
        station.city = station_in.city
    loc_changed = False
    if station_in.state_province is not None:
        station.state_province = station_in.state_province
        loc_changed = True
    if station_in.postal_code is not None:
        station.postal_code = station_in.postal_code
        loc_changed = True
    if station_in.country is not None:
        station.country = station_in.country
        loc_changed = True
        
    if station_in.timezone is not None:
        station.timezone = station_in.timezone
    elif loc_changed:
        station.timezone = get_timezone_from_location(
            station.country,
            station.state_province,
            station.postal_code
        )

    if station_in.phone is not None:
        station.phone = station_in.phone
    if station_in.email is not None:
        station.email = station_in.email
    if station_in.website is not None:
        station.website = station_in.website
    if station_in.broadcast_frequency is not None:
        station.broadcast_frequency = station_in.broadcast_frequency
    if station_in.languages is not None:
        station.languages = station_in.languages
    if station_in.social_twitter is not None:
        station.social_twitter = station_in.social_twitter
    if station_in.social_instagram is not None:
        station.social_instagram = station_in.social_instagram
    if station_in.programs_list is not None:
        station.programs_list = station_in.programs_list
    if station_in.is_active is not None:
        station.is_active = station_in.is_active
        if station.is_active:
            station.disabled_reason = None
            station.reactivation_reason = None
            station.reactivation_requested = False
    if station_in.disabled_reason is not None:
        station.disabled_reason = station_in.disabled_reason
    if station_in.reactivation_reason is not None:
        station.reactivation_reason = station_in.reactivation_reason
    if station_in.reactivation_requested is not None:
        station.reactivation_requested = station_in.reactivation_requested
        
    db.commit()
    db.refresh(station)
    return serialize_station(station, db, viewer=current_user, include_stream_key=True)


@router.post("/{id}/licence-document", response_model=RadioStationResponse)
async def upload_station_licence_document(
    id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_radio_admin),
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")

    real_role = getattr(current_user, "_real_role", None) or current_user.role
    if real_role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only view licence documents",
        )
    if station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this station")

    station.licence_document_path = await store_licence_document(file, "radio", station.id)
    db.commit()
    db.refresh(station)
    return serialize_station(station, db, viewer=current_user, include_stream_key=True)


@router.post("/{id}/cover", response_model=RadioStationResponse)
async def upload_station_cover(
    id: int,
    cover_image: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_radio_admin),
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")

    real_role = getattr(current_user, "_real_role", None) or current_user.role
    if real_role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Platform admins can only view station covers",
        )
    if station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this station")

    station.cover_art_url = await store_profile_cover(cover_image, "radio", station.id)
    db.commit()
    db.refresh(station)
    return serialize_station(station, db, viewer=current_user, include_stream_key=True)


@router.get("", response_model=List[RadioStationResponse])
def list_radio_stations(
    db: Session = Depends(get_db),
    current_user = Depends(get_optional_current_user)
):
    if current_user and current_user.role == "admin":
        stations = db.query(RadioStation).all()
    elif current_user and current_user.role == "radio_admin":
        stations = db.query(RadioStation).filter(RadioStation.owner_id == current_user.id).all()
    else:
        stations = db.query(RadioStation).filter(RadioStation.is_active == True).all()
    return [serialize_station(s, db, viewer=current_user) for s in stations]

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
    skip_history: bool = False,
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
        
    if current_user:
        real_role = getattr(current_user, "_real_role", None) or current_user.role
        if real_role == "radio_admin" and current_user.role == "radio_admin" and station.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Radio admins can only access their own radio station")
 
    if live_stream_manager.is_live(station.id):
        stream_url = f"/api/radio/{station.id}/live"
        if skip_history:
            stream_url += "?skip_history=true"
        return {
            "station_id": station.id,
            "station_name": station.name,
            "track_id": station.id * 100,
            "title": "Live Broadcast",
            "artist": station.name,
            "duration": None,
            "stream_url": stream_url,
            "is_websocket": True,
            "offset": 0.0
        }

    if station.stream_url and station.stream_url.startswith("/api/radio/"):
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
    station_id: Optional[int] = None
):
    from app.db.session import SessionLocal
    db = SessionLocal()
    station = None
    try:
        if token:
            resolved_token = extract_ws_token(websocket, token)
            user = resolve_ws_user(resolved_token)
            if not user:
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid Token")
                return
            user_id = user.id
            if station_id:
                station = db.query(RadioStation).filter(RadioStation.id == station_id).first()
                if not station:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Station Not Found")
                    return
                if user.role != "admin" and station.owner_id != user.id:
                    await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not Authorized")
                    return
            else:
                station = db.query(RadioStation).filter(RadioStation.owner_id == user_id).first()
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

        resolved_station_id = station.id
        if live_stream_manager.is_live(resolved_station_id):
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Broadcaster already connected")
            return

        station_name = station.name
    finally:
        db.close()

    await websocket.accept()
    live_stream_manager.broadcasters[resolved_station_id] = True
    print(f"Broadcaster connected to station {station_name} (ID: {resolved_station_id})", flush=True)

    try:
        while True:
            # Receive audio chunk as bytes
            data = await websocket.receive_bytes()
            if data:
                await live_stream_manager.broadcast_chunk(resolved_station_id, data)
    except WebSocketDisconnect:
        print(f"Broadcaster disconnected from station {station_name} (ID: {resolved_station_id})", flush=True)
    except Exception as e:
        print(f"Broadcaster error on station {station_name} (ID: {resolved_station_id}): {e}", flush=True)
    finally:
        await live_stream_manager.stop_broadcasting(resolved_station_id)


@router.websocket("/{id}/stream/ws/listener")
async def websocket_listener_endpoint(
    websocket: WebSocket,
    id: int,
    skip_history: bool = False
):
    try:
        queue = live_stream_manager.register_listener(id, skip_history=skip_history)
    except RuntimeError:
        await websocket.close(code=1013, reason="Listener capacity reached")
        return

    await websocket.accept()
    print(f"WebSocket listener connected to station ID: {id}", flush=True)
    
    try:
        while True:
            chunk = await queue.get()
            if chunk is None:
                break
            await websocket.send_bytes(chunk)
    except WebSocketDisconnect:
        print(f"WebSocket listener disconnected from station ID: {id}", flush=True)
    except Exception as e:
        print(f"WebSocket listener error on station ID: {id}: {e}", flush=True)
    finally:
        live_stream_manager.unregister_listener(id, queue)


@router.get("/{id}/live")
async def get_live_audio_stream(
    request: Request,
    id: int,
    skip_history: bool = False,
    authorization: Optional[str] = Header(None),
):
    enforce_rate_limit(request, "radio-live", limit=60, window_sec=60)
    # Custom, dependency-free optional user resolution to avoid DB connection leaks
    current_user = None
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split(" ")[1]
            try:
                from jose import jwt
                from app.core.config import settings
                from app.core.security import ALGORITHM
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
                user_id = int(payload.get("sub"))
                
                from app.models import User
                user = db.query(User).filter(User.id == user_id).first()
                if user and user.is_active:
                    apply_user_mode(user)
                    current_user = user
            except Exception:
                pass

        station = db.query(RadioStation).filter(RadioStation.id == id).first()
        if not station:
            raise HTTPException(status_code=404, detail="Radio station not found")

        if current_user:
            real_role = getattr(current_user, "_real_role", None) or current_user.role
            if real_role == "radio_admin" and current_user.role == "radio_admin" and station.owner_id != current_user.id:
                raise HTTPException(status_code=403, detail="Radio admins can only access their own radio station")
            
        if not station.is_active and (not current_user or current_user.role != "admin"):
            raise HTTPException(status_code=403, detail="Radio station is disabled")
    finally:
        db.close()

    async def audio_generator():
        try:
            queue = live_stream_manager.register_listener(id, skip_history=skip_history)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        print(f"Listener registered for station {id}", flush=True)
        try:
            while True:
                if not live_stream_manager.is_live(id):
                    print(f"Station {id} went offline. Stopping listener stream.", flush=True)
                    break
                try:
                    chunk = await asyncio.wait_for(queue.get(), timeout=10.0)
                except asyncio.TimeoutError:
                    print(f"Listener timeout waiting for chunks on station {id}...", flush=True)
                    if not live_stream_manager.is_live(id):
                        break
                    continue
                if chunk is None:
                    print(f"Listener received None chunk on station {id}. Closing stream.", flush=True)
                    break
                yield chunk
        except asyncio.CancelledError:
            print(f"Listener connection cancelled/closed on station {id}", flush=True)
            pass
        finally:
            live_stream_manager.unregister_listener(id, queue)
            print(f"Listener unregistered for station {id}", flush=True)

    return StreamingResponse(
        audio_generator(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
            "Transfer-Encoding": "chunked",
            "X-Accel-Buffering": "no",
            "icy-name": "VeriSonic Live",
            "icy-metaint": "0",
        }
    )

@router.get("/{id}/broadcast-key")
def get_broadcast_key(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_radio_admin),
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")
    if current_user.role != "admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    _ensure_stream_key_fresh(station, db)
    return {"stream_key": station.stream_key}

@router.post("/{id}/verify-broadcast-key", response_model=VerifyBroadcastKeyResponse)
def verify_broadcast_key(
    id: int,
    body: VerifyBroadcastKeyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_radio_admin),
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")
    if current_user.role != "admin" and station.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    return {"valid": _verify_station_stream_key(station, body.stream_key)}

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
    return serialize_station(station, db, viewer=current_user, include_stream_key=True)


def customize_sdp(sdp: str) -> str:
    lines = sdp.split("\r\n")
    opus_pt = None
    
    # 1. Find the payload type for opus (e.g., a=rtpmap:111 opus/48000/2)
    for line in lines:
        if "opus/48000" in line:
            parts = line.split(":")
            if len(parts) > 1:
                pt_part = parts[1].split(" ")
                if len(pt_part) > 0:
                    opus_pt = pt_part[0]
                    break
                    
    # 2. Add or modify the a=fmtp line for that payload type
    if opus_pt:
        fmtp_prefix = f"a=fmtp:{opus_pt}"
        for i, line in enumerate(lines):
            if line.startswith(fmtp_prefix):
                # Append high-quality stereo parameters and disable voice processing
                extra_params = ";stereo=1;sprop-stereo=1;maxaveragebitrate=256000;echoCancellation=false;noiseSuppression=false;autoGainControl=false"
                lines[i] = line + extra_params
                break
        else:
            # If no fmtp line exists, find the rtpmap line and insert the fmtp line after it
            for i, line in enumerate(lines):
                if line.startswith(f"a=rtpmap:{opus_pt}"):
                    lines.insert(i + 1, f"a=fmtp:{opus_pt} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=256000;echoCancellation=false;noiseSuppression=false;autoGainControl=false")
                    break

    return "\r\n".join(lines)


@router.post("/{id}/webrtc/listener")
async def webrtc_listener(id: int, params: dict, buffer_sec: Optional[float] = None, db: Session = Depends(get_db)):
    """WebRTC listener signaling: creates a server-side relay track bridging the
    LiveStreamManager MP3 queue into a WebRTC audio stream for the browser."""
    if RTCPeerConnection is None:
        raise HTTPException(status_code=500, detail="WebRTC support is not loaded on server")

    if AUDIO_RELAY_TRACK_CLASS is None:
        raise HTTPException(status_code=500, detail="PyAV not available for audio relay")

    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    if not live_stream_manager.is_live(id):
        raise HTTPException(status_code=404, detail="Station is offline (no active broadcast)")

    # Munge the remote offer to enable high-quality stereo Opus
    munged_offer = customize_sdp(params["sdp"])
    offer = RTCSessionDescription(sdp=munged_offer, type=params["type"])
    
    # Configure STUN servers to resolve the server's public IP address on AWS
    config = None
    if RTCConfiguration is not None and RTCIceServer is not None:
        config = RTCConfiguration(
            iceServers=[
                RTCIceServer(urls="stun:stun.l.google.com:19302"),
                RTCIceServer(urls="stun:stun1.l.google.com:19302")
            ]
        )
    pc = RTCPeerConnection(configuration=config) if config else RTCPeerConnection()

    # Create a relay track that will receive MP3 chunks from LiveStreamManager
    relay_track = AUDIO_RELAY_TRACK_CLASS(id, buffer_sec)
    pc.addTrack(relay_track)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    
    # Munge the answer SDP to enable high-quality stereo Opus
    munged_sdp = customize_sdp(answer.sdp)
    answer = RTCSessionDescription(sdp=munged_sdp, type=answer.type)
    
    await pc.setLocalDescription(answer)

    # Register so LiveStreamManager pushes chunks to this relay track
    webrtc_manager.register_listener(id, pc, relay_track)

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}


class RadioListenStartResponse(BaseModel):
    session_token: Optional[str] = None
    billable: bool = False


class RadioListenHeartbeatRequest(BaseModel):
    session_token: str


class RadioListenHeartbeatResponse(BaseModel):
    total_credit_paise: int = 0


class RadioListenEndRequest(BaseModel):
    session_token: str


@router.post("/{id}/listen-session/start", response_model=RadioListenStartResponse)
def start_radio_listen_billing(
    id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    station = db.query(RadioStation).filter(RadioStation.id == id).first()
    if not station:
        raise HTTPException(status_code=404, detail="Radio station not found")

    from app.services.wallet_service import is_billable_listener, start_radio_listen_session

    if not is_billable_listener(current_user):
        return RadioListenStartResponse(session_token=None, billable=False)

    token = start_radio_listen_session(db, listener=current_user, station=station)
    return RadioListenStartResponse(session_token=token, billable=token is not None)


@router.post("/{id}/listen-session/heartbeat", response_model=RadioListenHeartbeatResponse)
def heartbeat_radio_listen_billing(
    id: int,
    body: RadioListenHeartbeatRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.services.wallet_service import heartbeat_radio_listen_session

    total_credit = heartbeat_radio_listen_session(
        db,
        listener=current_user,
        session_token=body.session_token,
    )
    return RadioListenHeartbeatResponse(total_credit_paise=total_credit or 0)


@router.post("/{id}/listen-session/end", status_code=status.HTTP_204_NO_CONTENT)
def end_radio_listen_billing(
    id: int,
    body: RadioListenEndRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    from app.services.wallet_service import end_radio_listen_session

    end_radio_listen_session(db, listener=current_user, session_token=body.session_token)
    return None
