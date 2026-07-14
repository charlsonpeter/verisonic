"""
AI lyrics extraction: Demucs vocal separation + faster-whisper transcription.

Models are loaded lazily and kept in-process for reuse. Temp stems and CUDA
cache are cleaned after each run to limit RAM/VRAM growth.
"""

from __future__ import annotations

import gc
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

ProgressCallback = Callable[[int, str], None]

_whisper_model = None
_whisper_model_key: Optional[tuple] = None


def _settings():
    from app.core.config import settings

    return settings


def _resolve_device() -> str:
    device = (_settings().LYRICS_DEVICE or "auto").lower()
    if device != "auto":
        return device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _resolve_compute_type(device: str) -> str:
    configured = _settings().LYRICS_WHISPER_COMPUTE_TYPE
    if configured:
        return configured
    return "float16" if device == "cuda" else "int8"


def _get_whisper_model():
    """Load faster-whisper once per (model, device, compute_type) and reuse."""
    global _whisper_model, _whisper_model_key

    model_size = _settings().LYRICS_WHISPER_MODEL
    device = _resolve_device()
    compute_type = _resolve_compute_type(device)
    key = (model_size, device, compute_type)

    if _whisper_model is not None and _whisper_model_key == key:
        return _whisper_model

    from faster_whisper import WhisperModel

    logger.info(
        "Loading faster-whisper model=%s device=%s compute_type=%s",
        model_size,
        device,
        compute_type,
    )
    _whisper_model = WhisperModel(model_size, device=device, compute_type=compute_type)
    _whisper_model_key = key
    return _whisper_model


def unload_models() -> None:
    """Drop cached models and free GPU memory (optional low-RAM mode)."""
    global _whisper_model, _whisper_model_key
    _whisper_model = None
    _whisper_model_key = None
    _cleanup_torch()


def _cleanup_torch() -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def segments_to_lrc(lyrics: list[dict[str, Any]]) -> str:
    """Convert timed line dicts to LRC text for track.lyrics compatibility."""
    lines: list[str] = []
    for item in lyrics:
        start = float(item.get("start") or 0.0)
        text = (item.get("text") or "").strip()
        if not text:
            continue
        mins = int(start // 60)
        secs = int(start % 60)
        centis = int(round((start - int(start)) * 100)) % 100
        lines.append(f"[{mins:02d}:{secs:02d}.{centis:02d}] {text}")
    return "\n".join(lines)


def _failed(error: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error": error,
        "detected_language": None,
        "language_probability": None,
        "lyrics": [],
    }


def _find_vocals_path(out_dir: str, model_name: str, audio_path: str) -> Optional[str]:
    stem = Path(audio_path).stem
    candidate_dirs = [
        Path(out_dir) / model_name / stem,
        Path(out_dir) / stem,
    ]
    for folder in candidate_dirs:
        for name in ("vocals.wav", "vocals.mp3", "vocals.flac"):
            path = folder / name
            if path.is_file():
                return str(path)
        if folder.is_dir():
            matches = list(folder.glob("vocals.*"))
            if matches:
                return str(matches[0])
    # Fallback: search tree
    root = Path(out_dir)
    if root.is_dir():
        matches = list(root.rglob("vocals.*"))
        if matches:
            return str(matches[0])
    return None


def _separate_vocals(audio_path: str, work_dir: str) -> str:
    """
    Separate vocals with Demucs via in-process API (not CLI subprocess).
    Returns path to the vocals stem file.
    """
    from demucs.separate import main as demucs_main

    model_name = _settings().LYRICS_DEMUCS_MODEL
    out_dir = os.path.join(work_dir, "demucs_out")
    os.makedirs(out_dir, exist_ok=True)

    # demucs.separate.main accepts an argv-style list when opts is provided
    demucs_main(
        [
            "--two-stems",
            "vocals",
            "-n",
            model_name,
            "-o",
            out_dir,
            "--shifts",
            "1",
            audio_path,
        ]
    )

    vocals_path = _find_vocals_path(out_dir, model_name, audio_path)
    if not vocals_path:
        raise FileNotFoundError("Demucs completed but vocals stem was not found")
    return vocals_path


def _transcribe_vocals(
    vocals_path: str,
    language: Optional[str] = None,
    on_progress: Optional[ProgressCallback] = None,
) -> tuple[list[dict[str, Any]], str, float]:
    model = _get_whisper_model()
    lang = language.strip().lower() if language else None
    if lang in ("", "auto", "none", "null"):
        lang = None

    if on_progress:
        on_progress(62, "transcribing")

    segments_iter, info = model.transcribe(
        vocals_path,
        language=lang,
        vad_filter=True,
        beam_size=5,
    )

    lyrics: list[dict[str, Any]] = []
    # Whisper streams segments; nudge progress toward 88% as lines arrive
    line_count = 0
    for seg in segments_iter:
        text = (seg.text or "").strip()
        if not text:
            continue
        lyrics.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": text,
            }
        )
        line_count += 1
        if on_progress:
            pct = min(88, 62 + line_count * 2)
            on_progress(pct, "transcribing")

    detected = getattr(info, "language", None) or (lang or "und")
    probability = float(getattr(info, "language_probability", 0.0) or 0.0)
    if on_progress:
        on_progress(90, "transcribing")
    return lyrics, detected, probability


def extract_lyrics(
    audio_path: str,
    language: Optional[str] = None,
    on_progress: Optional[ProgressCallback] = None,
) -> dict[str, Any]:
    """
    Extract multilingual timed lyrics from an audio file.

    Returns a structured dict with status, language metadata, and timed lines.
    Never raises into callers for expected failure modes — returns status=failed.
    """
    def progress(pct: int, stage: str) -> None:
        if on_progress:
            try:
                on_progress(pct, stage)
            except Exception:
                pass

    work_dir: Optional[str] = None
    try:
        if not audio_path or not isinstance(audio_path, str):
            return _failed("Invalid audio file path")
        if not os.path.isfile(audio_path):
            return _failed(f"Audio file not found: {audio_path}")

        work_dir = tempfile.mkdtemp(prefix="lyrics_ai_")

        try:
            progress(15, "separating_vocals")
            vocals_path = _separate_vocals(audio_path, work_dir)
            progress(55, "separating_vocals")
        except FileNotFoundError as exc:
            logger.exception("Demucs vocals stem missing")
            return _failed(str(exc))
        except MemoryError:
            logger.exception("Out of memory during Demucs separation")
            return _failed("Out of memory during vocal separation")
        except RuntimeError as exc:
            msg = str(exc).lower()
            if "out of memory" in msg or ("cuda" in msg and "memory" in msg):
                logger.exception("GPU OOM during Demucs separation")
                return _failed("Out of memory during vocal separation")
            logger.exception("Demucs separation failed")
            return _failed(f"Vocal separation failed: {exc}")
        except Exception as exc:
            # Includes torch.cuda.OutOfMemoryError on some builds
            if type(exc).__name__ == "OutOfMemoryError":
                logger.exception("OOM during Demucs separation")
                return _failed("Out of memory during vocal separation")
            logger.exception("Demucs separation failed")
            return _failed(f"Vocal separation failed: {exc}")

        try:
            lyrics, detected, probability = _transcribe_vocals(
                vocals_path,
                language=language,
                on_progress=on_progress,
            )
        except MemoryError:
            logger.exception("Out of memory during Whisper transcription")
            return _failed("Out of memory during transcription")
        except RuntimeError as exc:
            msg = str(exc).lower()
            if "out of memory" in msg or ("cuda" in msg and "memory" in msg):
                logger.exception("GPU OOM during Whisper transcription")
                return _failed("Out of memory during transcription")
            logger.exception("Whisper transcription failed")
            return _failed(f"Transcription failed: {exc}")
        except Exception as exc:
            if type(exc).__name__ == "OutOfMemoryError":
                logger.exception("OOM during Whisper transcription")
                return _failed("Out of memory during transcription")
            logger.exception("Whisper transcription failed")
            return _failed(f"Audio decoding or transcription failed: {exc}")

        return {
            "status": "success",
            "detected_language": detected,
            "language_probability": probability,
            "lyrics": lyrics,
        }

    except MemoryError:
        logger.exception("Out of memory in lyrics extraction")
        return _failed("Out of memory during lyrics extraction")
    except OSError as exc:
        logger.exception("File/OS error in lyrics extraction")
        return _failed(f"File error: {exc}")
    except Exception as exc:
        logger.exception("Unexpected lyrics extraction failure")
        return _failed(f"Lyrics extraction failed: {exc}")
    finally:
        if work_dir and os.path.isdir(work_dir):
            try:
                shutil.rmtree(work_dir, ignore_errors=True)
            except Exception:
                pass
        if _settings().LYRICS_UNLOAD_MODELS_AFTER_RUN:
            unload_models()
        else:
            _cleanup_torch()
