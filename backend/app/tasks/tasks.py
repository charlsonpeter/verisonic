import os
import shutil
import tempfile
import subprocess
import uuid
from celery_worker import celery_app
from app.db.session import SessionLocal
from app.models import Track, AudioAnalysisReport
from app.services.audio import extract_metadata, analyze_audio_spectral, calculate_quality_score
from app.services.storage import upload_file_path, delete_prefix_except
from app.core.redis_client import get_redis
from app.db.session import SQLALCHEMY_DATABASE_URL
from sqlalchemy import or_, text, create_engine
from sqlalchemy.pool import NullPool


HLS_TRANSCODE_LOCK_TTL_SEC = 7200
HLS_RETRANSCODE_SWEEP_LOCK_TTL_SEC = 300
# Keep prior gens at least 2h, longer for long tracks, so in-flight listeners survive republish
HLS_OLD_GEN_CLEANUP_MIN_SEC = 7200
HLS_OLD_GEN_CLEANUP_DURATION_FACTOR = 3
HLS_OLD_GEN_CLEANUP_PADDING_SEC = 600

# Postgres advisory-lock namespace (avoid colliding with unrelated app locks).
# Sweep uses a dedicated high key; track locks use a separate range that cannot
# overlap it (track_id 1 must not equal the sweep key).
_PG_LOCK_SWEEP_KEY = 2_100_000_000
_PG_LOCK_TRACK_BASE = 2_200_000_000

# Dedicated NullPool engine so long-held advisory locks do not starve the app pool
_lock_engine = create_engine(SQLALCHEMY_DATABASE_URL, poolclass=NullPool, pool_pre_ping=True)


def _transcode_lock_key(track_id: int) -> bytes:
    return f"hls:transcode:{track_id}".encode()


def _pg_lock_key_for_track(track_id: int) -> int:
    return _PG_LOCK_TRACK_BASE + int(track_id)


def _acquire_pg_advisory_lock(lock_key: int):
    """
    Session-scoped Postgres advisory lock on a NullPool connection.
    Caller must release via _release_pg_advisory_lock.
    """
    conn = _lock_engine.connect()
    try:
        acquired = conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"),
            {"k": lock_key},
        ).scalar()
        if not acquired:
            conn.close()
            return None
        return conn
    except Exception:
        try:
            conn.close()
        except Exception:
            pass
        return None


def _release_pg_advisory_lock(conn, lock_key: int) -> None:
    if conn is None:
        return
    try:
        conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": lock_key})
    except Exception:
        pass
    try:
        conn.close()
    except Exception:
        pass


def _acquire_transcode_lock(track_id: int):
    """
    Acquire a cross-worker lock for this track.
    Postgres advisory lock is authoritative (works when Redis is down).
    Redis marker is best-effort for sweep heuristics.
    Returns (pg_conn_or_None, acquired: bool).
    """
    pg_conn = _acquire_pg_advisory_lock(_pg_lock_key_for_track(track_id))
    if pg_conn is None:
        return None, False

    client = get_redis()
    if client:
        try:
            client.set(
                _transcode_lock_key(track_id),
                b"1",
                ex=HLS_TRANSCODE_LOCK_TTL_SEC,
            )
        except Exception:
            pass
    return pg_conn, True


def _release_transcode_lock(track_id: int, pg_conn) -> None:
    _release_pg_advisory_lock(pg_conn, _pg_lock_key_for_track(track_id))
    client = get_redis()
    if not client:
        return
    try:
        client.delete(_transcode_lock_key(track_id))
    except Exception:
        pass


def _acquire_retranscode_sweep_lock():
    """Sweep lock: Redis NX when possible, else Postgres advisory."""
    client = get_redis()
    if client:
        try:
            if client.set(
                b"hls:retranscode_sweep",
                b"1",
                nx=True,
                ex=HLS_RETRANSCODE_SWEEP_LOCK_TTL_SEC,
            ):
                return ("redis", None)
            return None  # not acquired
        except Exception:
            pass

    pg_conn = _acquire_pg_advisory_lock(_PG_LOCK_SWEEP_KEY)
    if pg_conn is None:
        return None
    return ("pg", pg_conn)


def _release_retranscode_sweep_lock(token) -> None:
    if not token:
        return
    kind, pg_conn = token
    if kind == "pg":
        _release_pg_advisory_lock(pg_conn, _PG_LOCK_SWEEP_KEY)
    # Redis sweep key expires via TTL


def _is_transcode_locked(track_id: int) -> bool:
    client = get_redis()
    if client:
        try:
            if client.exists(_transcode_lock_key(track_id)):
                return True
        except Exception:
            pass
    # Probe PG lock without holding it
    conn = _acquire_pg_advisory_lock(_pg_lock_key_for_track(track_id))
    if conn is None:
        return True
    _release_pg_advisory_lock(conn, _pg_lock_key_for_track(track_id))
    return False


def _hls_cleanup_countdown_sec(duration: float | None) -> int:
    duration_sec = float(duration or 0)
    return int(
        max(
            HLS_OLD_GEN_CLEANUP_MIN_SEC,
            duration_sec * HLS_OLD_GEN_CLEANUP_DURATION_FACTOR + HLS_OLD_GEN_CLEANUP_PADDING_SEC,
        )
    )

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


def _ffmpeg_hls(
    input_file_path: str,
    out_dir: str,
    audio_args: list,
    segment_type: str = "mpegts",
) -> str:
    """Run ffmpeg HLS encode into out_dir; return local playlist path."""
    os.makedirs(out_dir, exist_ok=True)
    playlist = os.path.join(out_dir, "playlist.m3u8")
    cmd = [
        "ffmpeg", "-y", "-i", input_file_path,
        "-vn",
        *audio_args,
        "-f", "hls",
        "-hls_time", "6",
        "-hls_playlist_type", "vod",
    ]
    if segment_type == "fmp4":
        cmd.extend([
            "-hls_segment_type", "fmp4",
            "-hls_fmp4_init_filename", "init.mp4",
            "-hls_segment_filename", os.path.join(out_dir, "segment_%03d.m4s"),
        ])
    else:
        cmd.extend([
            "-hls_segment_filename", os.path.join(out_dir, "segment_%03d.ts"),
        ])
    cmd.append(playlist)
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return playlist


def _upload_hls_directory(local_dir: str, s3_prefix: str) -> str:
    """Upload all HLS artifacts under local_dir to s3_prefix; return playlist key."""
    playlist_key = f"{s3_prefix}/playlist.m3u8"
    for filename in os.listdir(local_dir):
        file_path = os.path.join(local_dir, filename)
        if not os.path.isfile(file_path):
            continue
        key = f"{s3_prefix}/{filename}"
        lower = filename.lower()
        if lower.endswith(".m3u8"):
            content_type = "application/x-mpegURL"
        elif lower.endswith(".ts"):
            content_type = "video/MP2T"
        elif lower.endswith(".m4s"):
            content_type = "video/iso.segment"
        elif lower.endswith(".mp4"):
            content_type = "video/mp4"
        else:
            content_type = "application/octet-stream"
        upload_file_path(file_path, key, content_type=content_type)
    return playlist_key


@celery_app.task(name="app.tasks.tasks.transcode_audio_task")
def transcode_audio_task(track_id: int, local_file_path: str = None):
    """
    Transcodes approved audio to progressive download fallbacks plus four
    quality-tier HLS playlists:
      - normal:   AAC 128 kbps (MPEG-TS)
      - high:     AAC 256 kbps (MPEG-TS)
      - lossless: FLAC CD quality 16-bit/44.1 kHz (fMP4)
      - hires:    FLAC at original sample rate / bit depth (fMP4)
    """
    pg_lock_conn, lock_acquired = _acquire_transcode_lock(track_id)
    if not lock_acquired:
        # Avoid duplicate parallel work from overlapping startup/approve queues
        if local_file_path and os.path.exists(local_file_path):
            os.remove(local_file_path)
        return {"status": "skipped", "reason": "transcode already in progress", "track_id": track_id}

    db = SessionLocal()
    temp_dir = tempfile.mkdtemp()
    
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return {"status": "error", "error": "Track not found"}

        # Another queued job may have finished while we waited for the lock/countdown
        if (
            local_file_path is None
            and track.hls_normal_path
            and track.hls_high_path
            and track.hls_lossless_path
            and track.hls_hires_path
        ):
            return {
                "status": "skipped",
                "reason": "already has four HLS quality playlists",
                "track_id": track_id,
            }

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

        # Progressive fallbacks (downloads / legacy; not used for primary streaming)
        mp3_path = os.path.join(temp_dir, f"track_{track_id}_320.mp3")
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "libmp3lame", "-b:a", "320k",
            mp3_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        mp3_key = f"transcoded/{track_id}/320k.mp3"
        upload_file_path(mp3_path, mp3_key, content_type="audio/mpeg")
        track.mp3_320_path = mp3_key
        
        aac_256_path = os.path.join(temp_dir, f"track_{track_id}_256.aac")
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "aac", "-b:a", "256k",
            aac_256_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        aac_256_key = f"transcoded/{track_id}/256k.aac"
        upload_file_path(aac_256_path, aac_256_key, content_type="audio/aac")
        track.aac_256_path = aac_256_key
        
        aac_128_path = os.path.join(temp_dir, f"track_{track_id}_128.aac")
        subprocess.run([
            "ffmpeg", "-y", "-i", input_file_path,
            "-codec:a", "aac", "-b:a", "128k",
            aac_128_path
        ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        aac_128_key = f"transcoded/{track_id}/128k.aac"
        upload_file_path(aac_128_path, aac_128_key, content_type="audio/aac")
        track.aac_128_path = aac_128_key

        # Encode all four HLS tiers locally first — never wipe S3 until encodes succeed.
        normal_dir = os.path.join(temp_dir, "hls_normal")
        _ffmpeg_hls(
            input_file_path,
            normal_dir,
            ["-codec:a", "aac", "-b:a", "128k"],
            segment_type="mpegts",
        )

        high_dir = os.path.join(temp_dir, "hls_high")
        _ffmpeg_hls(
            input_file_path,
            high_dir,
            ["-codec:a", "aac", "-b:a", "256k"],
            segment_type="mpegts",
        )

        lossless_dir = os.path.join(temp_dir, "hls_lossless")
        _ffmpeg_hls(
            input_file_path,
            lossless_dir,
            ["-codec:a", "flac", "-sample_fmt", "s16", "-ar", "44100"],
            segment_type="fmp4",
        )

        hires_dir = os.path.join(temp_dir, "hls_hires")
        _ffmpeg_hls(
            input_file_path,
            hires_dir,
            ["-codec:a", "flac"],
            segment_type="fmp4",
        )

        # Publish under a new generation prefix, then point DB at it, then clean old trees later.
        gen = uuid.uuid4().hex[:12]
        gen_root = f"hls/{track_id}/{gen}"

        hls_normal_key = _upload_hls_directory(normal_dir, f"{gen_root}/normal")
        hls_high_key = _upload_hls_directory(high_dir, f"{gen_root}/high")
        hls_lossless_key = _upload_hls_directory(lossless_dir, f"{gen_root}/lossless")
        hls_hires_key = _upload_hls_directory(hires_dir, f"{gen_root}/hires")

        track.hls_normal_path = hls_normal_key
        track.hls_high_path = hls_high_key
        track.hls_lossless_path = hls_lossless_key
        track.hls_hires_path = hls_hires_key
        # Legacy field points at high-quality HLS for readiness filters
        track.hls_playlist_path = hls_high_key
        db.commit()

        # Defer cleanup so in-flight HLS listeners on the prior generation can finish
        cleanup_old_hls_gens_task.apply_async(
            args=[track_id, f"{gen_root}/"],
            countdown=_hls_cleanup_countdown_sec(track.duration),
        )
        
        return {"status": "success", "track_id": track_id}
        
    except Exception as e:
        db.rollback()
        print(f"Error in transcode_audio_task: {e}")
        return {"status": "error", "error": str(e)}
        
    finally:
        _release_transcode_lock(track_id, pg_lock_conn)
        db.close()
        # Clean up temporary directory & input local file
        shutil.rmtree(temp_dir, ignore_errors=True)
        if local_file_path and os.path.exists(local_file_path):
            os.remove(local_file_path)


@celery_app.task(name="app.tasks.tasks.cleanup_old_hls_gens_task")
def cleanup_old_hls_gens_task(track_id: int, keep_prefix: str):
    """
    Remove prior HLS generations after a grace period for in-flight listeners.
    Always keeps the generation currently referenced in the DB (not a stale
    keep_prefix), so a later re-transcode cannot be deleted by an older cleanup job.
    """
    db = SessionLocal()
    try:
        track = db.query(Track).filter(Track.id == track_id).first()
        if not track:
            return {"status": "skipped", "reason": "track not found"}

        current_key = (
            track.hls_high_path
            or track.hls_normal_path
            or track.hls_lossless_path
            or track.hls_hires_path
            or track.hls_playlist_path
            or ""
        )
        effective_keep = keep_prefix
        # paths look like: hls/{track_id}/{gen}/high/playlist.m3u8
        parts = current_key.split("/")
        if len(parts) >= 3 and parts[0] == "hls" and parts[1] == str(track_id):
            effective_keep = f"hls/{track_id}/{parts[2]}/"

        delete_prefix_except(f"hls/{track_id}/", effective_keep)
        return {
            "status": "success",
            "track_id": track_id,
            "kept": effective_keep,
            "requested_keep": keep_prefix,
        }
    except Exception as e:
        print(f"Error in cleanup_old_hls_gens_task: {e}")
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


@celery_app.task(name="app.tasks.tasks.queue_missing_hls_retranscodes_task")
def queue_missing_hls_retranscodes_task():
    """
    Queue re-transcodes for approved tracks missing any of the four HLS quality paths.
    Safe to run on startup; skips tracks that already have all four playlists.
    Deduplicates concurrent API restarts and in-flight worker jobs via Redis/Postgres locks.
    """
    sweep_token = _acquire_retranscode_sweep_lock()
    if not sweep_token:
        return {"status": "skipped", "reason": "sweep already running"}

    db = SessionLocal()
    try:
        tracks = (
            db.query(Track)
            .filter(
                Track.approved == True,  # noqa: E712
                Track.original_file_path.isnot(None),
                or_(
                    Track.hls_normal_path.is_(None),
                    Track.hls_high_path.is_(None),
                    Track.hls_lossless_path.is_(None),
                    Track.hls_hires_path.is_(None),
                ),
            )
            .all()
        )
        queued = 0
        skipped_locked = 0
        for i, track in enumerate(tracks):
            if _is_transcode_locked(track.id):
                skipped_locked += 1
                continue
            # Stagger to avoid thundering herd on the worker
            transcode_audio_task.apply_async(args=[track.id, None], countdown=i * 2)
            queued += 1
        return {
            "status": "success",
            "queued": queued,
            "skipped_locked": skipped_locked,
        }
    finally:
        db.close()
        _release_retranscode_sweep_lock(sweep_token)

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
