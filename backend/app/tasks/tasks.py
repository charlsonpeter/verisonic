import os
import shutil
import tempfile
import subprocess
from celery_worker import celery_app
from app.db.session import SessionLocal
from app.models import Track, AudioAnalysisReport
from app.services.audio import extract_metadata, analyze_audio_spectral, calculate_quality_score
from app.services.storage import upload_file_path, upload_file

@celery_app.task(name="app.tasks.tasks.analyze_audio_task")
def analyze_audio_task(track_id: int, temp_file_path: str):
    """
    Asynchronously analyzes uploaded audio, performs spectral checks,
    generates spectrogram, scores quality, and determines approval.
    """
    db = SessionLocal()
    try:
        # Check track existence
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            print(f"Track with ID {track_id} not found.")
            return {"status": "error", "error": "Track not found"}

        # 1. Metadata analysis (FFprobe)
        metadata = extract_metadata(temp_file_path)
        
        # Create temporary spectrogram image path
        fd, temp_img_path = tempfile.mkstemp(suffix=".png")
        os.close(fd)
        
        # 2. Spectral analysis & 3. Fake 320kbps check
        spectral = analyze_audio_spectral(temp_file_path, temp_img_path)
        
        # 4. Scoring & Approval
        quality = calculate_quality_score(metadata, spectral)
        
        # Upload spectrogram image to MinIO
        img_key = f"spectrograms/{track_id}.png"
        upload_file_path(temp_img_path, img_key, content_type="image/png")
        os.remove(temp_img_path)
        
        # Upload original file to S3 storage
        ext = os.path.splitext(temp_file_path)[1].lower() or ".wav"
        original_key = f"originals/{track_id}{ext}"
        upload_file_path(temp_file_path, original_key, content_type="audio/x-wav" if ext == ".wav" else "audio/flac")

        # Update Track metadata in DB
        track.duration = metadata["duration"]
        track.file_format = metadata["codec"].upper()
        track.bitrate = metadata["bitrate"]
        track.sample_rate = metadata["sample_rate"]
        track.bit_depth = metadata["bit_depth"]
        track.channels = metadata["channels"]
        track.original_file_path = original_key
        
        # If no lyrics exist, try to populate from metadata or auto-transcribe (fallback to English AI transcript)
        if not track.lyrics:
            if metadata.get("lyrics"):
                track.lyrics = metadata["lyrics"]
        
        track.quality_score = quality["quality_score"]
        track.quality_level = quality["quality_level"]
        track.approved = quality["approved"]
        
        # Create or update analysis report
        report = db.query(AudioAnalysisReport).filter(
            AudioAnalysisReport.track_id == track_id
        ).first()
        if report:
            report.max_frequency = spectral["max_frequency"]
            report.cutoff_frequency = spectral["cutoff_frequency"]
            report.high_frequency_energy = spectral["high_frequency_energy"]
            report.spectrogram_path = img_key
        else:
            report = AudioAnalysisReport(
                track_id=track_id,
                max_frequency=spectral["max_frequency"],
                cutoff_frequency=spectral["cutoff_frequency"],
                high_frequency_energy=spectral["high_frequency_energy"],
                spectrogram_path=img_key
            )
            db.add(report)
        db.commit()
        
        # If approved, run transcoding
        if quality["approved"]:
            db.refresh(track)
            transcode_audio_task.delay(track_id, temp_file_path)
        else:
            # Clean up the file if rejected
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                
        return {
            "status": "success",
            "approved": quality["approved"],
            "score": quality["quality_score"],
            "level": quality["quality_level"]
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error in analyze_audio_task: {e}")
        # Clean up file in case of exception
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        return {"status": "error", "error": str(e)}
    finally:
        db.close()

@celery_app.task(name="app.tasks.tasks.transcode_audio_task")
def transcode_audio_task(track_id: int, local_file_path: str = None):
    """
    Transcodes approved audio to:
    - 320kbps MP3
    - 256kbps AAC
    - 128kbps AAC
    - HLS Adaptive Bitrate segments (.m3u8)
    Uploads all outputs to S3/MinIO and updates DB paths.
    """
    db = SessionLocal()
    temp_dir = tempfile.mkdtemp()
    
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return {"status": "error", "error": "Track not found"}

        input_file_path = local_file_path
        if not input_file_path or not os.path.exists(input_file_path):
            if not track.original_file_path:
                return {"status": "error", "error": "Original file path not found"}
            
            from app.services.storage import s3_client, settings
            ext = os.path.splitext(track.original_file_path)[1].lower() or ".wav"
            fd, downloaded_temp_file = tempfile.mkstemp(suffix=ext, dir=temp_dir)
            os.close(fd)
            
            s3_client.download_file(
                Bucket=settings.S3_BUCKET_NAME,
                Key=track.original_file_path,
                Filename=downloaded_temp_file
            )
            input_file_path = downloaded_temp_file

        # 1. Transcode to 320kbps MP3
        mp3_path = os.path.join(temp_dir, f"track_{track_id}_320.mp3")
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "libmp3lame", "-b:a", "320k",
            mp3_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        mp3_key = f"transcoded/{track_id}/320k.mp3"
        upload_file_path(mp3_path, mp3_key, content_type="audio/mpeg")
        track.mp3_320_path = mp3_key
        
        # 2. Transcode to 256kbps AAC
        aac_256_path = os.path.join(temp_dir, f"track_{track_id}_256.aac")
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "aac", "-b:a", "256k",
            aac_256_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        aac_256_key = f"transcoded/{track_id}/256k.aac"
        upload_file_path(aac_256_path, aac_256_key, content_type="audio/aac")
        track.aac_256_path = aac_256_key
        
        # 3. Transcode to 128kbps AAC
        aac_128_path = os.path.join(temp_dir, f"track_{track_id}_128.aac")
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "aac", "-b:a", "128k",
            aac_128_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        aac_128_key = f"transcoded/{track_id}/128k.aac"
        upload_file_path(aac_128_path, aac_128_key, content_type="audio/aac")
        track.aac_128_path = aac_128_key
 
        # 4. Transcode to HLS stream (AAC master & segments)
        hls_dir = os.path.join(temp_dir, "hls")
        os.makedirs(hls_dir, exist_ok=True)
        hls_playlist = os.path.join(hls_dir, "playlist.m3u8")
        
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "aac", "-b:a", "256k",
            "-hls_time", "6",
            "-hls_playlist_type", "vod",
            "-hls_segment_filename", os.path.join(hls_dir, "segment_%03d.ts"),
            hls_playlist
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Upload all HLS files
        hls_prefix = f"hls/{track_id}"
        playlist_key = f"{hls_prefix}/playlist.m3u8"
        
        # Upload files in directory
        for filename in os.listdir(hls_dir):
            file_path = os.path.join(hls_dir, filename)
            key = f"{hls_prefix}/{filename}"
            if filename.endswith(".m3u8"):
                upload_file_path(file_path, key, content_type="application/x-mpegURL")
            elif filename.endswith(".ts"):
                upload_file_path(file_path, key, content_type="video/MP2T")
 
        track.hls_playlist_path = playlist_key
        db.commit()
        
        return {"status": "success", "track_id": track_id}
        
    except Exception as e:
        db.rollback()
        print(f"Error in transcode_audio_task: {e}")
        return {"status": "error", "error": str(e)}
        
    finally:
        db.close()
        # Clean up temporary directory & input local file
        shutil.rmtree(temp_dir, ignore_errors=True)
        if local_file_path and os.path.exists(local_file_path):
            os.remove(local_file_path)


@celery_app.task(name="app.tasks.tasks.settle_daily_revenue_task")
def settle_daily_revenue_task(settlement_date: str | None = None):
    """Settle previous UTC day (or an explicit YYYY-MM-DD) into owner wallets."""
    from app.services.daily_settlement_service import settle_day, settle_previous_utc_day

    db = SessionLocal()
    try:
        if settlement_date:
            run = settle_day(db, settlement_date)
        else:
            run = settle_previous_utc_day(db)
        return {
            "status": run.status,
            "settlement_date": run.settlement_date,
            "listeners_processed": run.listeners_processed,
            "owners_credited": run.owners_credited,
            "total_credited_paise": run.total_credited_paise,
            "error_message": run.error_message,
        }
    finally:
        db.close()
