from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    refresh_token: Optional[str] = None

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

class SwitchModeRequest(BaseModel):
    mode: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str

class ResetInitialPasswordRequest(BaseModel):
    new_password: str

# --- Artist Schemas ---
class ArtistProfileFields(BaseModel):
    stage_name: Optional[str] = None
    bio: Optional[str] = None
    category: Optional[str] = None
    licence: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    languages: Optional[str] = None
    social_twitter: Optional[str] = None
    social_instagram: Optional[str] = None

class ArtistCreate(BaseModel):
    stage_name: str
    bio: Optional[str] = None

class ArtistResponse(BaseModel):
    id: int
    user_id: int
    stage_name: str
    bio: Optional[str] = None
    is_active: bool
    disabled_reason: Optional[str] = None
    reactivation_reason: Optional[str] = None
    reactivation_requested: Optional[bool] = None
    profile_complete: bool = False
    category: Optional[str] = None
    licence: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    languages: Optional[str] = None
    social_twitter: Optional[str] = None
    social_instagram: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    licence_document_url: Optional[str] = None
    cover_art_url: Optional[str] = None

    class Config:
        from_attributes = True

class ArtistUpdate(ArtistProfileFields):
    is_active: Optional[bool] = None
    disabled_reason: Optional[str] = None
    reactivation_reason: Optional[str] = None
    reactivation_requested: Optional[bool] = None
    profile_complete: Optional[bool] = None

class StudioProfileUpdate(ArtistProfileFields):
    stage_name: str
    bio: str

class UserResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: Optional[str] = None
    profile_image_url: Optional[str] = None
    role: str
    subscription: str
    subscription_cycle: Optional[str] = None
    subscription_expires_at: Optional[datetime] = None
    subscription_activated_at: Optional[datetime] = None
    real_role: Optional[str] = None
    is_active: bool
    must_reset_password: bool = False
    created_at: datetime
    stream_quality: Optional[str] = None
    pending_plan_id: Optional[str] = None
    pending_plan_paid: bool = False
    subscription_cancel_at_period_end: bool = False
    artist_profile: Optional[ArtistResponse] = None

    class Config:
        from_attributes = True


class UserSettingsUpdate(BaseModel):
    stream_quality: Optional[str] = None

# --- Album Schemas ---
class AlbumCreate(BaseModel):
    title: str
    release_year: Optional[int] = None

class AlbumUpdate(BaseModel):
    title: Optional[str] = None
    release_year: Optional[int] = None

class AlbumResponse(BaseModel):
    id: int
    title: str
    cover_art_url: Optional[str] = None
    release_year: Optional[int] = None
    artist_id: int
    artist_name: Optional[str] = None
    track_count: Optional[int] = 0

    class Config:
        from_attributes = True

# --- Genre Schemas ---
class GenreCreate(BaseModel):
    name: str

class GenreUpdate(BaseModel):
    name: str

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
    genres: Optional[List[str]] = []
    created_at: datetime
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None

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


class ScoreBreakdownItem(BaseModel):
    check: str
    description: str
    value: str
    threshold: str
    passed: bool
    deduction: int
    max_points: int
    points_achieved: int
    calculation: str


class QualityScoreTier(BaseModel):
    min_score: int
    label: str
    description: str


class QualityReportDetailResponse(AudioAnalysisReportResponse):
    base_score: int = 100
    final_score: Optional[int] = None
    quality_level: Optional[str] = None
    score_breakdown: List[ScoreBreakdownItem] = []
    rejection_reasons: List[str] = []
    quality_tiers: List[QualityScoreTier] = []

# --- Playlist Schemas ---
class PlaylistCreate(BaseModel):
    name: str
    is_public: Optional[bool] = False

class PlaylistTrackAdd(BaseModel):
    track_id: int

class PlaylistTrackReorder(BaseModel):
    track_ids: List[int]

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
    category: Optional[str] = None
    licence: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    broadcast_frequency: Optional[str] = None
    languages: Optional[str] = None
    social_twitter: Optional[str] = None
    social_instagram: Optional[str] = None
    programs_list: Optional[str] = None
    timezone: Optional[str] = None

class RadioStationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    stream_url: Optional[str] = None
    current_program_title: Optional[str] = None
    rj_name: Optional[str] = None
    rj_details: Optional[str] = None
    category: Optional[str] = None
    licence: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    broadcast_frequency: Optional[str] = None
    languages: Optional[str] = None
    social_twitter: Optional[str] = None
    social_instagram: Optional[str] = None
    programs_list: Optional[str] = None
    timezone: Optional[str] = None
    is_active: Optional[bool] = None
    disabled_reason: Optional[str] = None
    reactivation_reason: Optional[str] = None
    reactivation_requested: Optional[bool] = None

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
    current_program_title: Optional[str] = None
    rj_name: Optional[str] = None
    rj_details: Optional[str] = None
    listeners_count: Optional[int] = 0
    is_online: Optional[bool] = True
    category: Optional[str] = None
    licence: Optional[str] = None
    street_address: Optional[str] = None
    city: Optional[str] = None
    state_province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    broadcast_frequency: Optional[str] = None
    languages: Optional[str] = None
    social_twitter: Optional[str] = None
    social_instagram: Optional[str] = None
    programs_list: Optional[str] = None
    timezone: Optional[str] = None
    disabled_reason: Optional[str] = None
    reactivation_reason: Optional[str] = None
    reactivation_requested: Optional[bool] = None
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    licence_document_url: Optional[str] = None

    class Config:
        from_attributes = True

class VerifyBroadcastKeyRequest(BaseModel):
    stream_key: str

class VerifyBroadcastKeyResponse(BaseModel):
    valid: bool

class RadioScheduleCreate(BaseModel):
    track_id: int

class RequestReactivationSchema(BaseModel):
    reason: str

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


class TrackCommentCreate(BaseModel):
    body: str

class TrackCommentResponse(BaseModel):
    id: int
    track_id: int
    user_id: int
    author_name: Optional[str] = None
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class ListeningHistoryEntryResponse(BaseModel):
    id: int
    played_at: datetime
    track: TrackResponse


class StudioBrowseResponse(BaseModel):
    id: int
    stage_name: str
    bio: Optional[str] = None
    category: Optional[str] = None
    cover_art_url: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    track_count: int = 0


class ArtistAlbumSummary(BaseModel):
    title: str
    cover_art_url: Optional[str] = None
    release_year: Optional[int] = None
    track_count: int


class ArtistRelatedSummary(BaseModel):
    name: str
    track_count: int
    cover_art_url: Optional[str] = None


class ArtistDetailResponse(BaseModel):
    name: str
    track_count: int
    studio: Optional[StudioBrowseResponse] = None
    tracks: List[TrackResponse]
    albums: List[ArtistAlbumSummary]
    related_artists: List[ArtistRelatedSummary]


class PaginatedTrackListResponse(BaseModel):
    items: List[TrackResponse]
    total: int
    has_more: bool


class PaginatedUserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
    has_more: bool


class PaginatedArtistListResponse(BaseModel):
    items: List[ArtistResponse]
    total: int
    has_more: bool


class PaginatedRadioStationListResponse(BaseModel):
    items: List[RadioStationResponse]
    total: int
    has_more: bool
