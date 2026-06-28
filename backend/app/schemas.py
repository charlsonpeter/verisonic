from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenPayload(BaseModel):
    sub: Optional[int] = None

# --- User Schemas ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: Optional[str] = None
    role: Optional[str] = "listener" # listener, artist, admin

class UserLogin(BaseModel):
    email: EmailStr
    password: str

# --- Artist Schemas ---
class ArtistCreate(BaseModel):
    stage_name: str
    bio: Optional[str] = None

class ArtistResponse(BaseModel):
    id: int
    user_id: int
    stage_name: str
    bio: Optional[str] = None

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: datetime
    artist_profile: Optional[ArtistResponse] = None

    class Config:
        from_attributes = True

# --- Album Schemas ---
class AlbumCreate(BaseModel):
    title: str
    release_year: Optional[int] = None

class AlbumResponse(BaseModel):
    id: int
    title: str
    cover_art_url: Optional[str] = None
    release_year: Optional[int] = None
    artist_id: int

    class Config:
        from_attributes = True

# --- Genre Schemas ---
class GenreResponse(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True

# --- Track Schemas ---
class TrackCreate(BaseModel):
    title: str
    album_title: Optional[str] = None
    genres: Optional[List[str]] = []

class TrackResponse(BaseModel):
    id: int
    title: str
    artist_id: int
    artist_name: Optional[str] = None
    album_id: Optional[int] = None
    album_title: Optional[str] = None
    duration: Optional[float] = None
    file_format: Optional[str] = None
    bitrate: Optional[int] = None
    sample_rate: Optional[int] = None
    bit_depth: Optional[int] = None
    channels: Optional[int] = None
    quality_score: Optional[int] = None
    quality_level: Optional[str] = None
    approved: bool
    original_file_path: Optional[str] = None
    hls_playlist_path: Optional[str] = None
    mp3_320_path: Optional[str] = None
    aac_256_path: Optional[str] = None
    aac_128_path: Optional[str] = None
    cover_art_url: Optional[str] = None
    lyrics: Optional[str] = None
    composer: Optional[str] = None
    lyricist: Optional[str] = None
    year: Optional[int] = None
    language: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AudioAnalysisReportResponse(BaseModel):
    id: int
    track_id: int
    max_frequency: Optional[float] = None
    cutoff_frequency: Optional[float] = None
    high_frequency_energy: Optional[float] = None
    spectrogram_path: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# --- Playlist Schemas ---
class PlaylistCreate(BaseModel):
    name: str
    is_public: Optional[bool] = True

class PlaylistTrackAdd(BaseModel):
    track_id: int

class PlaylistResponse(BaseModel):
    id: int
    name: str
    user_id: int
    is_public: bool
    created_at: datetime
    tracks: Optional[List[TrackResponse]] = []

    class Config:
        from_attributes = True

# --- Radio Station Schemas ---
class RadioStationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    stream_url: Optional[str] = None
    owner_id: Optional[int] = None

class RadioStationResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    cover_art_url: Optional[str] = None
    is_active: bool
    stream_url: Optional[str] = None
    owner_id: Optional[int] = None
    stream_key: Optional[str] = None
    current_track_id: Optional[int] = None
    current_track_started_at: Optional[datetime] = None
    current_track_title: Optional[str] = None
    current_track_artist: Optional[str] = None
    current_track_duration: Optional[float] = None
    current_offset: Optional[float] = 0.0

    class Config:
        from_attributes = True

class RadioScheduleCreate(BaseModel):
    track_id: int

class RadioScheduleResponse(BaseModel):
    id: int
    station_id: int
    track_id: int
    position: int
    track: TrackResponse

    class Config:
        from_attributes = True

# --- Analytics Schemas ---
class QualityStats(BaseModel):
    poor: int
    average: int
    good: int
    studio: int

class PopularTrack(BaseModel):
    id: int
    title: str
    artist_name: str
    play_count: int

class DashboardResponse(BaseModel):
    total_plays: int
    total_listeners: int
    total_tracks: int
    bandwidth_gb: float
    quality_distribution: QualityStats
    popular_tracks: List[PopularTrack]
