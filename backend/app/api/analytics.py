from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.models import User, Track, ListeningHistory, StreamingLog
from app.schemas import DashboardResponse, QualityStats, PopularTrack
from app.api.auth import get_current_admin

router = APIRouter(prefix="/analytics", tags=["analytics"])

@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard_analytics(
    db: Session = Depends(get_db),
    current_user = Depends(get_current_admin)
):
    """
    Fetch comprehensive analytics metrics (Admin only).
    """
    # 1. Total Plays
    total_plays = db.query(func.count(ListeningHistory.id)).scalar() or 0
    
    # 2. Total Listeners (Unique user IDs who have listened)
    total_listeners = db.query(func.count(func.distinct(ListeningHistory.user_id))).scalar() or 0
    
    # 3. Total Tracks
    total_tracks = db.query(func.count(Track.id)).scalar() or 0
    
    # 4. Total Bandwidth Usage (in Gigabytes)
    total_bytes = db.query(func.sum(StreamingLog.bytes_streamed)).scalar() or 0
    bandwidth_gb = round(total_bytes / (1024 * 1024 * 1024), 2)
    
    # 5. Quality Distribution
    quality_counts = db.query(
        Track.quality_level, 
        func.count(Track.id)
    ).group_by(Track.quality_level).all()
    
    poor = 0
    average = 0
    good = 0
    studio = 0
    
    for level, count in quality_counts:
        if level == "Studio Quality":
            studio = count
        elif level == "Good":
            good = count
        elif level == "Average":
            average = count
        elif level == "Poor":
            poor = count
            
    quality_stats = QualityStats(
        poor=poor,
        average=average,
        good=good,
        studio=studio
    )
    
    # 6. Popular Tracks
    # Get top 5 tracks by listening count
    popular_query = db.query(
        Track.id,
        Track.title,
        func.count(ListeningHistory.id).label("play_count")
    ).join(ListeningHistory, Track.id == ListeningHistory.track_id)\
     .group_by(Track.id, Track.title)\
     .order_by(func.count(ListeningHistory.id).desc())\
     .limit(5).all()
     
    popular_tracks = []
    for track_id, title, play_count in popular_query:
        # Resolve artist stage name
        track = db.query(Track).filter(Track.id == track_id).first()
        artist_name = track.artist.stage_name if track and track.artist else "Unknown Artist"
        popular_tracks.append(
            PopularTrack(
                id=track_id,
                title=title,
                artist_name=artist_name,
                play_count=play_count
            )
        )
        
    return DashboardResponse(
        total_plays=total_plays,
        total_listeners=total_listeners,
        total_tracks=total_tracks,
        bandwidth_gb=bandwidth_gb,
        quality_distribution=quality_stats,
        popular_tracks=popular_tracks
    )
