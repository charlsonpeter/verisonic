import datetime
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Float, Table
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
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    @property
    def real_role(self) -> str:
        if hasattr(self, "_real_role") and self._real_role:
            return self._real_role
        return self.role

    artist_profile = relationship("Artist", back_populates="user", uselist=False)
    playlists = relationship("Playlist", back_populates="user")
    favorites = relationship("Favorite", back_populates="user")
    listening_history = relationship("ListeningHistory", back_populates="user")

class Artist(Base):
    __tablename__ = "artists"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    stage_name = Column(String, index=True, nullable=False)
    bio = Column(String, nullable=True)

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
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="playlists")
    playlist_tracks = relationship("PlaylistTrack", back_populates="playlist", order_by="PlaylistTrack.position", cascade="all, delete-orphan")

class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"
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
