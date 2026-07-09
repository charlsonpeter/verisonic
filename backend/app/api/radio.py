import datetime
import json
import urllib.request
import urllib.parse
import time
import random
import secrets
import asyncio
from collections import deque
from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Header

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
        # Maps station_id (int) -> deque of recent audio chunks for fast-start
        self.history: Dict[int, deque] = {}

    def is_live(self, station_id: int) -> bool:
        return self.broadcasters.get(station_id, False)

    def register_listener(self, station_id: int) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=10)
        if station_id not in self.listeners:
            self.listeners[station_id] = set()
        self.listeners[station_id].add(q)
        
        # Populate new listener's queue with combined recent history as a single block to start playing instantly
        if station_id in self.history and self.history[station_id]:
            history_data = b"".join(self.history[station_id])
            try:
                q.put_nowait(history_data)
            except asyncio.QueueFull:
                pass
        return q

    def unregister_listener(self, station_id: int, q: asyncio.Queue):
        if station_id in self.listeners:
            self.listeners[station_id].discard(q)
            if not self.listeners[station_id]:
                del self.listeners[station_id]

    async def broadcast_chunk(self, station_id: int, chunk: bytes):
        # Store chunk in sliding window history buffer (last ~100 chunks is about 4.6 seconds)
        if station_id not in self.history:
            self.history[station_id] = deque(maxlen=100)
        self.history[station_id].append(chunk)

        # Push to all HTTP streaming listeners
        for q in list(self.listeners.get(station_id, set())):
            try:
                q.put_nowait(chunk)
            except asyncio.QueueFull:
                try:
                    q.get_nowait()
                    q.put_nowait(chunk)
                except Exception:
                    pass

        # Also push to any active WebRTC relay tracks
        _wm = globals().get('webrtc_manager')
        if _wm is not None:
            await _wm.push_chunk(station_id, chunk)

    async def stop_broadcasting(self, station_id: int):
        self.broadcasters[station_id] = False
        if station_id in self.history:
            del self.history[station_id]
        if station_id in self.listeners:
            for q in list(self.listeners[station_id]):
                try:
                    q.put_nowait(None)
                except Exception:
                    pass

live_stream_manager = LiveStreamManager()

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

            def __init__(self, station_id: int):
                super().__init__()
                self.station_id = station_id
                self._queue: asyncio.Queue = asyncio.Queue(maxsize=35)
                self._pts = 0
                self._sample_rate = 48000
                self._channels = 2
                self._running = True
                self._buffering = True
                
                # Persistent codec context for streaming MP3 decoding
                import av
                self._codec = av.CodecContext.create('mp3', 'r')
                self._codec.open()

                # Resampler to convert 44.1 kHz planar s16p to WebRTC standard 48 kHz packed s16
                self._resampler = av.AudioResampler(
                    format='s16',
                    layout='stereo',
                    rate=48000
                )
                self._resampled_queue = []

            async def recv(self):
                # If we have buffered resampled frames, return the next one immediately
                if self._resampled_queue:
                    frame = self._resampled_queue.pop(0)
                    frame.pts = self._pts
                    self._pts += frame.samples
                    return frame

                # If we are buffering, wait until queue is filled to 22 chunks (~1 second of audio)
                if self._buffering:
                    if self._queue.qsize() < 22:
                        import numpy as np_inner
                        combined = np_inner.zeros((1, 960 * 2), dtype='int16')
                        frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                        frame.sample_rate = 48000
                        frame.time_base = fractions.Fraction(1, 48000)
                        frame.pts = self._pts
                        self._pts += frame.samples
                        return frame
                    else:
                        self._buffering = False

                # Otherwise, fetch the next chunk from the queue (non-blocking)
                try:
                    chunk = self._queue.get_nowait()
                except asyncio.QueueEmpty:
                    # Queue ran dry: play a single silence frame and stay in playing mode
                    import numpy as np_inner
                    combined = np_inner.zeros((1, 960 * 2), dtype='int16')
                    frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                    frame.sample_rate = 48000
                    frame.time_base = fractions.Fraction(1, 48000)
                    frame.pts = self._pts
                    self._pts += frame.samples
                    return frame

                try:
                    pcm_frames = []
                    try:
                        packets = self._codec.parse(chunk)
                        for packet in packets:
                            try:
                                for frame in self._codec.decode(packet):
                                    pcm = frame.to_ndarray()
                                    pcm_frames.append(pcm)
                            except Exception as e:
                                print(f"WebRTC packet decode warning: {e}", flush=True)
                    except Exception as e:
                        print(f"Error parsing WebRTC chunk: {e}", flush=True)

                    if pcm_frames:
                        import numpy as np_inner
                        combined = np_inner.concatenate(pcm_frames, axis=1)
                        # Ensure stereo
                        if combined.shape[0] == 1:
                            combined = np_inner.repeat(combined, 2, axis=0)
                        elif combined.shape[0] > 2:
                            combined = combined[:2, :]
                        
                        # Convert float32 (fltp) to int16 (keeping planar layout channels, samples)
                        if np_inner.issubdtype(combined.dtype, np_inner.floating):
                            combined = np_inner.clip(combined, -1.0, 1.0)
                            combined = (combined * 32767).astype(np_inner.int16)
                        else:
                            combined = combined.astype(np_inner.int16)
                            
                        # Create raw frame at 44100Hz planar layout (channels, samples)
                        raw_frame = AudioFrame.from_ndarray(combined, format='s16p', layout='stereo')
                        raw_frame.sample_rate = 44100
                        raw_frame.time_base = fractions.Fraction(1, 44100)
                        
                        # Resample to 48000Hz s16 packed format
                        resampled = self._resampler.resample(raw_frame)
                        if resampled:
                            for f in resampled:
                                f.sample_rate = 48000
                                f.time_base = fractions.Fraction(1, 48000)
                            self._resampled_queue.extend(resampled)
                    else:
                        # Fallback silence frame directly at 48000Hz packed layout (1, samples * 2)
                        import numpy as np_inner
                        combined = np_inner.zeros((1, 960 * 2), dtype='int16')
                        frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                        frame.sample_rate = 48000
                        frame.time_base = fractions.Fraction(1, 48000)
                        self._resampled_queue.append(frame)

                except Exception as e:
                    print(f"CRITICAL WebRTC track error inside recv: {e}", flush=True)
                    import numpy as np_inner
                    combined = np_inner.zeros((1, 960 * 2), dtype='int16')
                    frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                    frame.sample_rate = 48000
                    frame.time_base = fractions.Fraction(1, 48000)
                    self._resampled_queue.append(frame)

                # Pop and return the first resampled frame
                if self._resampled_queue:
                    frame = self._resampled_queue.pop(0)
                    frame.pts = self._pts
                    self._pts += frame.samples
                    return frame
                else:
                    # Fallback to 20ms of silence if queue is still empty
                    import numpy as np_inner
                    combined = np_inner.zeros((1, 960 * 2), dtype='int16')
                    frame = AudioFrame.from_ndarray(combined, format='s16', layout='stereo')
                    frame.sample_rate = 48000
                    frame.time_base = fractions.Fraction(1, 48000)
                    frame.pts = self._pts
                    self._pts += frame.samples
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

def serialize_station(station: RadioStation, db: Session) -> dict:
    # Ensure stream key exists and check for expiration (5 minutes validity)
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
            "cover_art_url": station.cover_art_url or "https://images.unsplash.com/photo-1507838153414-b4b713384a76?w=150&auto=format&fit=crop",
            "is_active": station.is_active,
            "stream_url": f"/api/radio/{station.id}/live",
            "owner_id": station.owner_id,
            "stream_key": station.stream_key,
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
            **profile_data
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
            "current_track_title": active_program_title or "Live Broadcast",
            "current_track_artist": active_rj_name or station.name,
            "current_track_duration": None,
            "current_offset": 0.0,
            "current_program_title": active_program_title,
            "rj_name": active_rj_name,
            "rj_details": station.rj_details,
            "listeners_count": listeners_count,
            "is_online": True,
            **profile_data
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
        "current_program_title": active_program_title,
        "rj_name": active_rj_name,
        "rj_details": station.rj_details,
        "listeners_count": 0,
        "is_online": False,
        **profile_data
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
        stream_url=station_in.stream_url,
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
        # Station is live - offer WebRTC delivery if available, else fallback to HTTP stream
        use_webrtc = RTCPeerConnection is not None and AUDIO_RELAY_TRACK_CLASS is not None
        return {
            "station_id": station.id,
            "station_name": station.name,
            "track_id": station.id * 100,
            "title": "Live Broadcast",
            "artist": station.name,
            "duration": None,
            "stream_url": f"/api/radio/{station.id}/live",
            "is_webrtc": use_webrtc,
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
    station_id: Optional[int] = None
):
    from app.db.session import SessionLocal
    db = SessionLocal()
    station = None
    try:
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

        station_name = station.name
        resolved_station_id = station.id
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

@router.get("/{id}/live")
async def get_live_audio_stream(
    id: int,
    authorization: Optional[str] = Header(None),
    x_user_mode: Optional[str] = Header(None)
):
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
                if user:
                    user._real_role = user.role
                    if x_user_mode == "listener" and user.role in ["admin", "radio_admin", "studio_admin"]:
                        user.__dict__["role"] = "listener"
                    current_user = user
            except Exception:
                pass

        station = db.query(RadioStation).filter(RadioStation.id == id).first()
        if not station:
            raise HTTPException(status_code=404, detail="Radio station not found")

        if current_user and current_user.role == "radio_admin" and station.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Radio admins can only access their own radio station")
    finally:
        db.close()

    async def audio_generator():
        queue = live_stream_manager.register_listener(id)
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
            "Access-Control-Allow-Origin": "*",
            "icy-name": "VeriSonic Live",
            "icy-metaint": "0",
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


@router.post("/{id}/webrtc/listener")
async def webrtc_listener(id: int, params: dict, db: Session = Depends(get_db)):
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

    offer = RTCSessionDescription(sdp=params["sdp"], type=params["type"])
    
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
    relay_track = AUDIO_RELAY_TRACK_CLASS(id)
    pc.addTrack(relay_track)

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    # Register so LiveStreamManager pushes chunks to this relay track
    webrtc_manager.register_listener(id, pc, relay_track)

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}
