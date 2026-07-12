import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from app.db.base_class import Base

# Association table for track-genre many-to-many relationship
track_genres = Table(
    "track_genres",
    Base.metadata,
    Column("track_id", Integer, ForeignKey("tracks.id", ondelete="CASCADE"), primary_key=True),
    Column("genre_id", Integer, ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, default="listener") # admin, artist, listener
    subscription = Column(String, default="free") # free, premium, unlimited
    subscription_cycle = Column(String, nullable=True) # monthly, yearly, null
    subscription_expires_at = Column(DateTime, nullable=True)
    subscription_activated_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    must_reset_password = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    stream_quality = Column(String, nullable=True)  # normal, high, hires, lossless
    pending_plan_id = Column(String, nullable=True)
    pending_plan_paid = Column(Boolean, default=False)
    subscription_cancel_at_period_end = Column(Boolean, default=False)

    @property
    def real_role(self) -> str:
        if hasattr(self, "_real_role") and self._real_role:
            return self._real_role
        return self.role

    artist_profile = relationship("Artist", back_populates="user", uselist=False)
    playlists = relationship("Playlist", back_populates="user")
    favorites = relationship("Favorite", back_populates="user")
    listening_history = relationship("ListeningHistory", back_populates="user")
    subscription_payments = relationship("SubscriptionPayment", back_populates="user")
    wallet = relationship("OwnerWallet", back_populates="user", uselist=False)
    bank_account = relationship("OwnerBankAccount", back_populates="user", uselist=False)
    withdrawal_requests = relationship("WithdrawalRequest", back_populates="user", foreign_keys="WithdrawalRequest.user_id")

class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id = Column(String, nullable=False)
    amount_paise = Column(Integer, nullable=False)
    currency = Column(String, default="INR", nullable=False)
    razorpay_order_id = Column(String, unique=True, index=True, nullable=False)
    razorpay_payment_id = Column(String, unique=True, index=True, nullable=True)
    status = Column(String, default="created")  # created, paid, failed
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="subscription_payments")

class Artist(Base):
    __tablename__ = "artists"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    stage_name = Column(String, index=True, nullable=False)
    bio = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    disabled_reason = Column(String, nullable=True)
    reactivation_reason = Column(String, nullable=True)
    reactivation_requested = Column(Boolean, default=False)
    profile_complete = Column(Boolean, default=False)

    # Detailed profile metadata
    category = Column(String, nullable=True)
    licence = Column(String, nullable=True)
    street_address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state_province = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    languages = Column(String, nullable=True)
    social_twitter = Column(String, nullable=True)
    social_instagram = Column(String, nullable=True)

    user = relationship("User", back_populates="artist_profile")
    tracks = relationship("Track", back_populates="artist")
    albums = relationship("Album", back_populates="artist")

class Album(Base):
    __tablename__ = "albums"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    artist_id = Column(Integer, ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    cover_art_url = Column(String, nullable=True)
    release_year = Column(Integer, nullable=True)

    artist = relationship("Artist", back_populates="albums")
    tracks = relationship("Track", back_populates="album")

class Genre(Base):
    __tablename__ = "genres"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)

class Track(Base):
    __tablename__ = "tracks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True, nullable=False)
    artist_id = Column(Integer, ForeignKey("artists.id", ondelete="CASCADE"), nullable=False)
    album_id = Column(Integer, ForeignKey("albums.id", ondelete="SET NULL"), nullable=True)
    duration = Column(Float, nullable=True) # in seconds
    
    # Storage details
    original_file_path = Column(String, nullable=True) # path in S3
    hls_playlist_path = Column(String, nullable=True) # .m3u8 path in S3
    mp3_320_path = Column(String, nullable=True)
    aac_256_path = Column(String, nullable=True)
    aac_128_path = Column(String, nullable=True)
    
    # Metadata details
    file_format = Column(String, nullable=True) # FLAC, WAV, etc.
    bitrate = Column(Integer, nullable=True)
    sample_rate = Column(Integer, nullable=True)
    bit_depth = Column(Integer, nullable=True)
    channels = Column(Integer, nullable=True)
    
    # Verification details
    quality_score = Column(Integer, nullable=True)
    quality_level = Column(String, nullable=True) # Studio Quality, Good, Average, Poor
    approved = Column(Boolean, default=False)
    
    # Custom details
    cover_image_path = Column(String, nullable=True)
    lyrics = Column(String, nullable=True)
    composer = Column(String, nullable=True)
    lyricist = Column(String, nullable=True)
    year = Column(Integer, nullable=True)
    artist_name_override = Column(String, nullable=True)
    language = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    artist = relationship("Artist", back_populates="tracks")
    album = relationship("Album", back_populates="tracks")
    genres = relationship("Genre", secondary=track_genres)
    analysis_report = relationship("AudioAnalysisReport", back_populates="track", uselist=False, cascade="all, delete-orphan")
    playlist_tracks = relationship("PlaylistTrack", back_populates="track", cascade="all, delete-orphan")
    listening_history = relationship("ListeningHistory", back_populates="track", cascade="all, delete-orphan")
    favorites = relationship("Favorite", back_populates="track", cascade="all, delete-orphan")

class Playlist(Base):
    __tablename__ = "playlists"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_public = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="playlists")
    playlist_tracks = relationship("PlaylistTrack", back_populates="playlist", order_by="PlaylistTrack.position", cascade="all, delete-orphan")

class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"
    __table_args__ = (
        UniqueConstraint("playlist_id", "track_id", name="uq_playlist_tracks_playlist_track"),
    )
    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, default=0)

    playlist = relationship("Playlist", back_populates="playlist_tracks")
    track = relationship("Track", back_populates="playlist_tracks")

class RadioStation(Base):
    __tablename__ = "radio_stations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    description = Column(String, nullable=True)
    cover_art_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    disabled_reason = Column(String, nullable=True)
    reactivation_reason = Column(String, nullable=True)
    reactivation_requested = Column(Boolean, default=False)
    stream_url = Column(String, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    stream_key = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Dynamic playback metadata
    current_track_id = Column(Integer, ForeignKey("tracks.id", ondelete="SET NULL"), nullable=True)
    current_track_started_at = Column(DateTime, nullable=True)

    # Dynamic program and RJ metadata
    current_program_title = Column(String, nullable=True)
    rj_name = Column(String, nullable=True)
    rj_details = Column(String, nullable=True)

    # Detailed profile metadata
    category = Column(String, nullable=True)
    licence = Column(String, nullable=True)
    street_address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    state_province = Column(String, nullable=True)
    postal_code = Column(String, nullable=True)
    country = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    website = Column(String, nullable=True)
    broadcast_frequency = Column(String, nullable=True)
    languages = Column(String, nullable=True)
    social_twitter = Column(String, nullable=True)
    social_instagram = Column(String, nullable=True)
    programs_list = Column(String, nullable=True)
    timezone = Column(String, nullable=True, default="UTC")
    
    schedules = relationship("RadioSchedule", back_populates="station", cascade="all, delete-orphan")

class RadioSchedule(Base):
    __tablename__ = "radio_schedules"
    id = Column(Integer, primary_key=True, index=True)
    station_id = Column(Integer, ForeignKey("radio_stations.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, default=0) # order in the Radio Playlist/Queue

    station = relationship("RadioStation", back_populates="schedules")
    track = relationship("Track")

class ListeningHistory(Base):
    __tablename__ = "listening_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    played_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="listening_history")
    track = relationship("Track", back_populates="listening_history")

class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "track_id", name="uq_favorites_user_track"),
    )
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="favorites")
    track = relationship("Track", back_populates="favorites")

class AudioAnalysisReport(Base):
    __tablename__ = "audio_analysis_reports"
    id = Column(Integer, primary_key=True, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), unique=True, nullable=False)
    max_frequency = Column(Float, nullable=True)
    cutoff_frequency = Column(Float, nullable=True)
    high_frequency_energy = Column(Float, nullable=True)
    spectrogram_path = Column(String, nullable=True) # path in S3/MinIO
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    track = relationship("Track", back_populates="analysis_report")

class StreamingLog(Base):
    __tablename__ = "streaming_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False)
    bytes_streamed = Column(Integer, default=0)
    played_at = Column(DateTime, default=datetime.datetime.utcnow)


class PlatformRevenueSettings(Base):
    __tablename__ = "platform_revenue_settings"
    id = Column(Integer, primary_key=True, index=True)
    premium_monthly_paise = Column(Integer, default=9900, nullable=False)
    premium_yearly_paise = Column(Integer, default=99900, nullable=False)
    company_share_bps = Column(Integer, default=3000, nullable=False)
    owner_share_bps = Column(Integer, default=7000, nullable=False)
    studio_pool_bps = Column(Integer, default=6000, nullable=False)
    radio_pool_bps = Column(Integer, default=4000, nullable=False)
    min_track_seconds = Column(Integer, default=30, nullable=False)
    min_radio_heartbeat_sec = Column(Integer, default=30, nullable=False)
    estimated_qualifying_plays_per_day = Column(Integer, default=10, nullable=False)
    estimated_radio_minutes_per_day = Column(Integer, default=60, nullable=False)
    min_withdrawal_paise = Column(Integer, default=10000, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class OwnerWallet(Base):
    __tablename__ = "owner_wallets"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    balance_paise = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="wallet")
    ledger_entries = relationship("WalletLedgerEntry", back_populates="wallet", cascade="all, delete-orphan")


class WalletLedgerEntry(Base):
    __tablename__ = "wallet_ledger_entries"
    id = Column(Integer, primary_key=True, index=True)
    wallet_id = Column(Integer, ForeignKey("owner_wallets.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    entry_type = Column(String, nullable=False)  # track_play, radio_listen, withdrawal, adjustment
    description = Column(String, nullable=True)
    reference_id = Column(String, nullable=True)
    listener_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    wallet = relationship("OwnerWallet", back_populates="ledger_entries")


class OwnerBankAccount(Base):
    __tablename__ = "owner_bank_accounts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    account_holder_name = Column(String, nullable=False)
    bank_name = Column(String, nullable=True)
    account_number = Column(String, nullable=False)
    ifsc_code = Column(String, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="bank_account")


class WithdrawalRequest(Base):
    __tablename__ = "withdrawal_requests"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount_paise = Column(Integer, nullable=False)
    status = Column(String, default="pending", nullable=False)  # pending, paid, rejected
    admin_note = Column(String, nullable=True)
    # Fernet-encrypted at rest (see wallet_service.encrypt_withdrawal_bank_snapshot)
    account_holder_name = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    account_number_masked = Column(String, nullable=True)  # masked only, never full number
    ifsc_code = Column(String, nullable=True)
    utr_reference = Column(String, nullable=True)
    processed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="withdrawal_requests", foreign_keys=[user_id])


class BillableTrackPlay(Base):
    __tablename__ = "billable_track_plays"
    __table_args__ = (
        UniqueConstraint("listener_user_id", "track_id", "play_date", name="uq_billable_track_plays_listener_track_day"),
    )
    id = Column(Integer, primary_key=True, index=True)
    listener_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    track_id = Column(Integer, ForeignKey("tracks.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    listened_seconds = Column(Float, nullable=False)
    credit_paise = Column(Integer, nullable=False)
    play_date = Column(String, nullable=False)  # YYYY-MM-DD UTC
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RadioListenSession(Base):
    __tablename__ = "radio_listen_sessions"
    id = Column(Integer, primary_key=True, index=True)
    session_token = Column(String, unique=True, index=True, nullable=False)
    listener_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    station_id = Column(Integer, ForeignKey("radio_stations.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    total_seconds = Column(Integer, default=0, nullable=False)
    total_credit_paise = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    last_heartbeat_at = Column(DateTime, nullable=True)
