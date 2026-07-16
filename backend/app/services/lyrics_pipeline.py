"""
Hybrid lyrics extraction pipeline:
1. Online lyrics database lookup (optional)
2. LALAL.AI vocal separation (optional; falls back to full mix)
3. Google Cloud Chirp-2 transcription with word timestamps
4. Google Gemini for native-script or Latin-transliterated lyrics
5. Forced alignment → LRC string + timed JSON segments
"""
from __future__ import annotations

import difflib
import json
import logging
import os
import re
import tempfile
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional

import requests

from app.core.config import Settings, settings

logger = logging.getLogger(__name__)

_LRC_LINE_RE = re.compile(r"^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)$")
_LRC_PREFIX_RE = re.compile(r"^(\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]\s*)(.*)$")
_DEFAULT_LINE_DURATION_SEC = 3.5
_MIN_LINE_GAP_SEC = 0.2
_GEMINI_ALIGN_SNAP_WINDOW_SEC = 1.0
_HIGH_CONFIDENCE_SNAP_WINDOW_SEC = 0.4
_MEDIUM_CONFIDENCE_SNAP_WINDOW_SEC = 0.8
_PHRASE_MATCH_HIGH_THRESHOLD = 0.55
_PHRASE_MATCH_MEDIUM_THRESHOLD = 0.30
_LALAL_POLL_INTERVAL_SEC = 5
_LALAL_POLL_TIMEOUT_SEC = 600
_LRCLIB_USER_AGENT = "VeriSonic/1.0"
_LRCLIB_GET_TIMEOUT_SEC = 30
_LRCLIB_SEARCH_TIMEOUT_SEC = 20
_MAX_GOOGLE_INLINE_BYTES = 9 * 1024 * 1024
_GOOGLE_TRANSCRIBE_SAMPLE_RATE = 16000
_GOOGLE_CHUNK_SECONDS = 55
_GOOGLE_MAX_SYNC_SECONDS = 55
_GOOGLE_SPEECH_LOCATION = "us-central1"
_GOOGLE_SPEECH_MODEL = "chirp_2"
_GOOGLE_SPEECH_LANGUAGE_CODES = ["auto"]


@dataclass
class LyricsPipelineResult:
    lrc_text: str
    timed: list[dict[str, Any]]
    language: Optional[str] = None
    source: str = "ai_pipeline"


@dataclass
class LrclibLyrics:
    text: str
    is_synced: bool


class LyricsPipelineError(Exception):
    pass


ProgressCallback = Callable[[str, int, str], None]


def _report_progress(
    callback: Optional[ProgressCallback],
    stage: str,
    progress: int,
    message: str,
) -> None:
    if callback:
        callback(stage, progress, message)


def validate_pipeline_config(cfg: Settings = settings) -> None:
    if not cfg.LYRICS_EXTRACTION_ENABLED:
        raise LyricsPipelineError("Lyrics extraction is disabled. Set LYRICS_EXTRACTION_ENABLED=true.")


def validate_ai_pipeline_config(
    *,
    google_project_id: str = "",
) -> None:
    if not google_project_id:
        raise LyricsPipelineError(
            "Lyrics not found in LRCLib. GOOGLE_CLOUD_PROJECT_ID is required for AI lyrics extraction."
        )


def _ensure_google_credentials(google_credentials_path: str) -> None:
    if google_credentials_path:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = google_credentials_path


def _gemini_generate_text(
    prompt: str,
    *,
    google_project_id: str,
    google_vertex_location: str,
    google_credentials_path: str = "",
    gemini_model: str = "gemini-2.5-flash",
    json_mode: bool = False,
) -> str:
    _ensure_google_credentials(google_credentials_path)

    import vertexai
    from vertexai.generative_models import GenerationConfig, GenerativeModel

    vertexai.init(project=google_project_id, location=google_vertex_location)
    model = GenerativeModel(gemini_model)
    generation_config = (
        GenerationConfig(response_mime_type="application/json") if json_mode else None
    )
    response = model.generate_content(prompt, generation_config=generation_config)
    content = (response.text or "").strip()
    if not content:
        raise LyricsPipelineError("Gemini returned empty lyrics")
    return content


def validate_sync_pipeline_config(
    *,
    google_project_id: str = "",
) -> None:
    if not google_project_id:
        raise LyricsPipelineError(
            "GOOGLE_CLOUD_PROJECT_ID is required to generate timestamps for pasted lyrics."
        )


def lyrics_have_timestamps(lyrics_text: str) -> bool:
    return any(
        _LRC_LINE_RE.match(line.strip())
        for line in lyrics_text.splitlines()
        if line.strip()
    )


def strip_lrc_to_plain_lines(lyrics_text: str) -> str:
    lines: list[str] = []
    for raw_line in lyrics_text.strip().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _LRC_PREFIX_RE.match(line)
        text = match.group(2) if match else line
        if text.strip():
            lines.append(text.strip())
    return "\n".join(lines)


def _format_lrc_timestamp(seconds: float) -> str:
    clamped = max(0.0, float(seconds))
    minutes = int(clamped // 60)
    total_secs = clamped % 60
    secs = int(total_secs)
    centis = int(round((total_secs - secs) * 100))
    if centis >= 100:
        secs += 1
        centis = 0
    if secs >= 60:
        minutes += secs // 60
        secs = secs % 60
    return f"[{minutes:02d}:{secs:02d}.{centis:02d}]"


def _is_mostly_non_latin(text: str) -> bool:
    letters = [char for char in text if char.isalpha()]
    if not letters:
        return False
    latin_count = sum(1 for char in letters if char.isascii())
    return latin_count / len(letters) < 0.35


def _romanized_lines_for_matching(
    lyric_lines: list[str],
    *,
    google_project_id: str,
    google_vertex_location: str,
    google_credentials_path: str,
    gemini_model: str,
) -> list[str]:
    if not lyric_lines:
        return []
    if not any(_is_mostly_non_latin(line) for line in lyric_lines):
        return list(lyric_lines)

    logger.info("Generating romanized lyric hints for timestamp matching")
    prompt = (
        "Transliterate each lyric line into the Latin alphabet phonetically "
        "(for example, Malayalam becomes Manglish). Do not translate or explain. "
        "Preserve the exact line count and order. Return only JSON: "
        '{"lines":["line 1","line 2"]}\n'
        f"Input: {json.dumps(lyric_lines, ensure_ascii=False)}"
    )
    content = _gemini_generate_text(
        prompt,
        google_project_id=google_project_id,
        google_vertex_location=google_vertex_location,
        google_credentials_path=google_credentials_path,
        gemini_model=gemini_model,
        json_mode=True,
    )
    try:
        converted_lines = json.loads(content).get("lines")
    except (json.JSONDecodeError, AttributeError) as exc:
        raise LyricsPipelineError("Gemini returned invalid romanized lyric hints") from exc

    if (
        not isinstance(converted_lines, list)
        or len(converted_lines) != len(lyric_lines)
        or not all(isinstance(line, str) for line in converted_lines)
    ):
        logger.warning("Romanized lyric hints invalid; falling back to original lines")
        return list(lyric_lines)

    return [line.strip() or lyric_lines[idx] for idx, line in enumerate(converted_lines)]


def _lrc_fraction_to_seconds(fraction: str) -> float:
    if not fraction:
        return 0.0
    if len(fraction) == 3:
        return int(fraction) / 1000.0
    if len(fraction) == 2:
        return int(fraction) / 100.0
    return int(fraction) / 10.0


def _lrc_time_to_seconds(minutes: int, seconds: int, fraction: str = "") -> float:
    return minutes * 60 + seconds + _lrc_fraction_to_seconds(fraction)


def parse_lrc_to_timed(lrc_text: str) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for raw_line in lrc_text.strip().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        match = _LRC_LINE_RE.match(line)
        if not match:
            fallback_start = (
                lines[-1]["start"] + _MIN_LINE_GAP_SEC
                if lines
                else 0.0
            )
            lines.append({"start": fallback_start, "end": None, "text": line})
            continue
        centis = match.group(3) or ""
        start = _lrc_time_to_seconds(int(match.group(1)), int(match.group(2)), centis)
        text = match.group(4).strip()
        if text:
            lines.append({"start": start, "end": None, "text": text})
        else:
            fallback_start = lines[-1]["start"] + _MIN_LINE_GAP_SEC if lines else start
            lines.append({"start": fallback_start, "end": None, "text": line})

    for idx, segment in enumerate(lines):
        if idx + 1 < len(lines):
            segment["end"] = lines[idx + 1]["start"]
        else:
            segment["end"] = segment["start"] + _DEFAULT_LINE_DURATION_SEC
    return lines


def _lrclib_headers() -> dict[str, str]:
    return {"User-Agent": _LRCLIB_USER_AGENT}


def _lrclib_synced_text(data: dict[str, Any]) -> Optional[str]:
    synced = data.get("syncedLyrics")
    if isinstance(synced, str) and synced.strip():
        return synced.strip()
    return None


def _lrclib_plain_text(data: dict[str, Any]) -> Optional[str]:
    plain = data.get("plainLyrics")
    if isinstance(plain, str) and plain.strip():
        return plain.strip()
    return None


def _lrclib_result_from_item(data: dict[str, Any], *, prefer_synced: bool) -> Optional[LrclibLyrics]:
    synced = _lrclib_synced_text(data)
    if synced:
        return LrclibLyrics(text=synced, is_synced=True)
    if prefer_synced:
        return None
    plain = _lrclib_plain_text(data)
    if plain:
        return LrclibLyrics(text=plain, is_synced=False)
    return None


def _pick_lrclib_search_result(
    results: list[dict[str, Any]],
    duration: Optional[float],
    *,
    prefer_synced: bool = True,
) -> Optional[LrclibLyrics]:
    if not results:
        return None

    synced_items = [item for item in results if _lrclib_synced_text(item)]
    plain_items = [item for item in results if not _lrclib_synced_text(item) and _lrclib_plain_text(item)]
    ordered_items = synced_items if prefer_synced else results

    if duration is not None and duration > 0:
        for item in ordered_items:
            item_duration = item.get("duration")
            if item_duration is None:
                continue
            if abs(float(item_duration) - duration) <= 2:
                picked = _lrclib_result_from_item(item, prefer_synced=prefer_synced)
                if picked:
                    return picked

    for item in ordered_items:
        picked = _lrclib_result_from_item(item, prefer_synced=prefer_synced)
        if picked:
            return picked

    if prefer_synced and plain_items:
        for item in plain_items:
            picked = _lrclib_result_from_item(item, prefer_synced=False)
            if picked:
                return picked
    return None


def fetch_from_lrclib(
    track_name: str,
    artist_name: str,
    *,
    api_base_url: str = "https://lrclib.net/api",
    album_name: Optional[str] = None,
    duration: Optional[float] = None,
) -> Optional[LrclibLyrics]:
    if not api_base_url:
        return None

    base = api_base_url.rstrip("/")
    headers = _lrclib_headers()
    logger.info("Looking up LRCLib lyrics for %s — %s", track_name, artist_name)

    try:
        if album_name and duration is not None and duration > 0:
            response = requests.get(
                f"{base}/get",
                params={
                    "track_name": track_name,
                    "artist_name": artist_name,
                    "album_name": album_name,
                    "duration": int(round(duration)),
                },
                headers=headers,
                timeout=_LRCLIB_GET_TIMEOUT_SEC,
            )
            if response.status_code == 200:
                picked = _lrclib_result_from_item(response.json(), prefer_synced=True)
                if picked:
                    logger.info(
                        "Found %s lyrics via LRCLib /get",
                        "synced" if picked.is_synced else "plain",
                    )
                    return picked

        search_params: dict[str, str] = {"track_name": track_name}
        if artist_name:
            search_params["artist_name"] = artist_name
        if album_name:
            search_params["album_name"] = album_name

        response = requests.get(
            f"{base}/search",
            params=search_params,
            headers=headers,
            timeout=_LRCLIB_SEARCH_TIMEOUT_SEC,
        )
        if response.status_code != 200:
            return None

        results = response.json()
        if not isinstance(results, list):
            return None

        match = _pick_lrclib_search_result(results, duration, prefer_synced=True)
        if match:
            logger.info(
                "Found %s lyrics via LRCLib /search",
                "synced" if match.is_synced else "plain",
            )
            return match
    except Exception as exc:
        logger.warning("LRCLib lookup failed: %s", exc)
    return None


def _lalal_request_headers(api_key: str, *, content_disposition: Optional[str] = None) -> dict[str, str]:
    headers = {"X-License-Key": api_key}
    if content_disposition:
        headers["Content-Disposition"] = content_disposition
    return headers


def _lalal_upload_source_id(file_path: str, api_key: str) -> str:
    filename = os.path.basename(file_path) or "audio.mp3"
    if "." not in filename:
        filename = f"{filename}.wav"

    with open(file_path, "rb") as audio_file:
        response = requests.post(
            "https://www.lalal.ai/api/v1/upload/",
            headers=_lalal_request_headers(
                api_key,
                content_disposition=f'attachment; filename="{filename}"',
            ),
            data=audio_file,
            timeout=120,
        )

    if response.status_code != 200:
        raise LyricsPipelineError(f"LALAL.AI upload failed: {response.text}")

    source_id = response.json().get("id")
    if not source_id:
        raise LyricsPipelineError("LALAL.AI upload did not return a source id")
    return source_id


def _lalal_start_vocal_split(source_id: str, api_key: str) -> str:
    response = requests.post(
        "https://www.lalal.ai/api/v1/split/stem_separator/",
        headers={
            "X-License-Key": api_key,
            "Content-Type": "application/json",
        },
        json={
            "source_id": source_id,
            "presets": {
                "stem": "vocals",
                "extraction_level": "deep_extraction",
                "splitter": "auto",
            },
        },
        timeout=60,
    )
    if response.status_code != 200:
        raise LyricsPipelineError(f"LALAL.AI stem separation failed: {response.text}")

    task_id = response.json().get("task_id")
    if not task_id:
        raise LyricsPipelineError("LALAL.AI stem separation did not return a task id")
    return task_id


def _lalal_wait_for_vocal_url(task_id: str, api_key: str) -> str:
    check_url = "https://www.lalal.ai/api/v1/check/"
    headers = {
        "X-License-Key": api_key,
        "Content-Type": "application/json",
    }
    deadline = time.time() + _LALAL_POLL_TIMEOUT_SEC

    while time.time() < deadline:
        response = requests.post(
            check_url,
            headers=headers,
            json={"task_ids": [task_id]},
            timeout=30,
        )
        if response.status_code != 200:
            raise LyricsPipelineError(f"LALAL.AI status check failed: {response.text}")

        task_result = (response.json().get("result") or {}).get(task_id) or {}
        status = task_result.get("status")

        if status == "success":
            tracks = (task_result.get("result") or {}).get("tracks") or []
            for track in tracks:
                if track.get("type") == "stem" and track.get("label") == "vocals":
                    vocal_url = track.get("url")
                    if vocal_url:
                        return vocal_url
            raise LyricsPipelineError("LALAL.AI completed but no vocal stem was returned")

        if status in ("error", "cancelled", "server_error"):
            error_detail = task_result.get("error")
            raise LyricsPipelineError(f"LALAL.AI vocal separation failed: {error_detail}")

        time.sleep(_LALAL_POLL_INTERVAL_SEC)

    raise LyricsPipelineError("LALAL.AI vocal separation timed out")


def separate_vocals_lalalai(file_path: str, api_key: str) -> str:
    logger.info("Separating vocals via LALAL.AI")
    source_id = _lalal_upload_source_id(file_path, api_key)
    task_id = _lalal_start_vocal_split(source_id, api_key)
    vocal_url = _lalal_wait_for_vocal_url(task_id, api_key)

    vocal_download = requests.get(vocal_url, timeout=120)
    if vocal_download.status_code != 200:
        raise LyricsPipelineError("Failed to download separated vocals from LALAL.AI")

    fd, vocal_file_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    with open(vocal_file_path, "wb") as out_file:
        out_file.write(vocal_download.content)

    logger.info("Vocal separation complete")
    return vocal_file_path


def _build_google_recognition_config():
    from google.cloud.speech_v2.types import cloud_speech

    return cloud_speech.RecognitionConfig(
        auto_decoding_config=cloud_speech.AutoDetectDecodingConfig(),
        language_codes=_GOOGLE_SPEECH_LANGUAGE_CODES,
        model=_GOOGLE_SPEECH_MODEL,
        features=cloud_speech.RecognitionFeatures(enable_word_time_offsets=True),
    )


def _recognize_audio_content(content: bytes, project_id: str):
    from google.api_core.client_options import ClientOptions
    from google.cloud import speech_v2
    from google.cloud.speech_v2.types import cloud_speech

    client = speech_v2.SpeechClient(
        client_options=ClientOptions(
            api_endpoint=f"{_GOOGLE_SPEECH_LOCATION}-speech.googleapis.com",
        )
    )
    request = cloud_speech.RecognizeRequest(
        recognizer=(
            f"projects/{project_id}/locations/{_GOOGLE_SPEECH_LOCATION}/recognizers/_"
        ),
        config=_build_google_recognition_config(),
        content=content,
    )
    return client.recognize(request=request)


@dataclass
class TranscriptWord:
    text: str
    start: float
    end: float


@dataclass
class GoogleTranscriptResult:
    response: Any
    word_starts: list[float]
    transcript_words: list[TranscriptWord]


def _google_transcript_words(google_response, offset_seconds: float = 0.0) -> list[TranscriptWord]:
    words: list[TranscriptWord] = []
    for result in google_response.results:
        if not result.alternatives:
            continue
        for word_info in result.alternatives[0].words:
            start = word_info.start_offset.total_seconds() + offset_seconds
            end = (
                word_info.end_offset.total_seconds() + offset_seconds
                if word_info.end_offset
                else start + 0.3
            )
            text = (word_info.word or "").strip()
            words.append(TranscriptWord(text=text, start=start, end=end))
    return words


def _google_word_starts(google_response, offset_seconds: float = 0.0) -> list[float]:
    return [word.start for word in _google_transcript_words(google_response, offset_seconds)]


def _merge_google_responses(responses: list[Any]):
    if not responses:
        raise LyricsPipelineError("Google transcription returned no audio segments")
    if len(responses) == 1:
        return responses[0]

    merged = responses[0]
    for extra in responses[1:]:
        merged.results.extend(extra.results)
    return merged


def _write_mono_flac(audio, sample_rate: int) -> str:
    import soundfile as sf

    fd, out_path = tempfile.mkstemp(suffix=".flac")
    os.close(fd)
    sf.write(out_path, audio, sample_rate, format="FLAC")
    return out_path


def _google_audio_segments(audio_file_path: str) -> list[tuple[str, float]]:
    import librosa

    y, sample_rate = librosa.load(
        audio_file_path,
        mono=True,
        sr=_GOOGLE_TRANSCRIBE_SAMPLE_RATE,
    )
    duration_sec = len(y) / sample_rate if sample_rate else 0.0
    full_path = _write_mono_flac(y, sample_rate)
    fits_sync_limits = (
        duration_sec <= _GOOGLE_MAX_SYNC_SECONDS
        and os.path.getsize(full_path) <= _MAX_GOOGLE_INLINE_BYTES
    )
    if fits_sync_limits:
        logger.info("Prepared compressed mono FLAC for Google transcription")
        return [(full_path, 0.0)]

    os.remove(full_path)
    logger.info(
        "Audio exceeds Google sync limits; transcribing in %ss chunks",
        _GOOGLE_CHUNK_SECONDS,
    )
    chunk_samples = _GOOGLE_CHUNK_SECONDS * sample_rate
    segments: list[tuple[str, float]] = []
    for start in range(0, len(y), chunk_samples):
        chunk_path = _write_mono_flac(y[start : start + chunk_samples], sample_rate)
        segments.append((chunk_path, start / sample_rate))
    return segments


def get_rough_transcript(audio_file_path: str, project_id: str) -> GoogleTranscriptResult:
    logger.info("Transcribing vocals with Google Cloud Chirp-2")
    segments = _google_audio_segments(audio_file_path)
    responses: list[Any] = []
    transcript_words: list[TranscriptWord] = []

    try:
        for segment_path, offset in segments:
            with open(segment_path, "rb") as audio_file:
                content = audio_file.read()
            if len(content) > _MAX_GOOGLE_INLINE_BYTES:
                raise LyricsPipelineError(
                    "Audio segment is still too large for Google Speech-to-Text inline recognition."
                )
            response = _recognize_audio_content(content, project_id)
            responses.append(response)
            transcript_words.extend(_google_transcript_words(response, offset))
        return GoogleTranscriptResult(
            response=_merge_google_responses(responses),
            word_starts=[word.start for word in transcript_words],
            transcript_words=transcript_words,
        )
    finally:
        for segment_path, _ in segments:
            _cleanup_temp_audio(segment_path)


def transliterate_lyrics_to_latin(
    lyrics_text: str,
    *,
    google_project_id: str,
    google_vertex_location: str,
    google_credentials_path: str = "",
    gemini_model: str = "gemini-2.5-flash",
) -> str:
    raw_lines = lyrics_text.splitlines()
    source_lines: list[str] = []
    line_positions: list[tuple[int, str]] = []

    for index, raw_line in enumerate(raw_lines):
        match = _LRC_PREFIX_RE.match(raw_line)
        prefix = match.group(1) if match else ""
        text = match.group(2) if match else raw_line
        if text.strip():
            source_lines.append(text.strip())
            line_positions.append((index, prefix))

    if not source_lines:
        return lyrics_text

    logger.info("Transliterating lyrics into the Latin alphabet via Gemini")
    prompt = (
        "Transliterate each lyric line in the provided JSON array into the Latin alphabet "
        "phonetically (for example, Malayalam becomes Manglish). Do not translate or explain. "
        "Preserve the exact line count and order. Return only a JSON object with a 'lines' array.\n"
        f"Input: {json.dumps(source_lines, ensure_ascii=False)}"
    )
    content = _gemini_generate_text(
        prompt,
        google_project_id=google_project_id,
        google_vertex_location=google_vertex_location,
        google_credentials_path=google_credentials_path,
        gemini_model=gemini_model,
        json_mode=True,
    )
    try:
        converted_lines = json.loads(content).get("lines")
    except (json.JSONDecodeError, AttributeError) as exc:
        raise LyricsPipelineError("Gemini returned invalid transliterated lyrics") from exc

    if (
        not isinstance(converted_lines, list)
        or len(converted_lines) != len(source_lines)
        or not all(isinstance(line, str) and line.strip() for line in converted_lines)
    ):
        raise LyricsPipelineError("Gemini changed the lyric line structure during transliteration")

    result_lines = list(raw_lines)
    for (index, prefix), converted_line in zip(line_positions, converted_lines):
        result_lines[index] = f"{prefix}{converted_line.strip()}"
    return "\n".join(result_lines)


def _normalize_ai_lyrics_text(lyrics_text: str) -> str:
    lines: list[str] = []
    for raw_line in lyrics_text.strip().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        line = re.sub(r"^\d+\.\s*", "", line)
        line = re.sub(r"^[-*•]\s*", "", line)
        if line:
            lines.append(line)
    return "\n".join(lines)


def get_original_lyrics_from_ai(
    rough_text: str,
    output_script: Literal["native", "latin"] = "native",
    *,
    google_project_id: str,
    google_vertex_location: str,
    google_credentials_path: str = "",
    gemini_model: str = "gemini-2.5-flash",
) -> str:
    logger.info("Fetching %s-script lyrics via Gemini", output_script)
    script_instruction = (
        "Write every line phonetically using only the Latin alphabet (for example, use Manglish "
        "for Malayalam). Do not translate the lyrics."
        if output_script == "latin"
        else (
            "Write every line in the song's original native script. If it is Malayalam, use "
            "Malayalam script; if it is Tamil, use Tamil script."
        )
    )
    prompt = (
        f"Identify the song from this rough text: '{rough_text}'. "
        "Provide the exact correct lyrics of the song, line by line. "
        "Include every sung line in full, including repeated choruses, bridges, and refrains. "
        "Do not skip, merge, or summarize duplicate sections. "
        f"{script_instruction} "
        "Do not include any English translations, explanations, or introductory text. Just the pure lyrics."
    )
    lyrics_text = _gemini_generate_text(
        prompt,
        google_project_id=google_project_id,
        google_vertex_location=google_vertex_location,
        google_credentials_path=google_credentials_path,
        gemini_model=gemini_model,
    )
    return _normalize_ai_lyrics_text(lyrics_text)


def _line_alignment_weight(line: str) -> float:
    text = line.strip()
    if not text:
        return 1.0
    parts = text.split()
    if len(parts) > 1:
        return float(len(parts))
    return float(max(len(text), 1))


def _extract_transcript_words(
    google_response: Any,
    *,
    word_starts: Optional[list[float]] = None,
) -> list[TranscriptWord]:
    if isinstance(google_response, GoogleTranscriptResult):
        if google_response.transcript_words:
            return google_response.transcript_words
        if google_response.word_starts:
            return [
                TranscriptWord(text="", start=start, end=start + 0.3)
                for start in google_response.word_starts
            ]

    words: list[TranscriptWord] = []
    response = (
        google_response.response
        if isinstance(google_response, GoogleTranscriptResult)
        else google_response
    )
    for result in response.results:
        if not result.alternatives:
            continue
        for word_info in result.alternatives[0].words:
            start = word_info.start_offset.total_seconds()
            end = (
                word_info.end_offset.total_seconds()
                if word_info.end_offset
                else start + 0.3
            )
            words.append(TranscriptWord(text=(word_info.word or "").strip(), start=start, end=end))

    if not words and word_starts:
        return [
            TranscriptWord(text="", start=start, end=start + 0.3)
            for start in word_starts
        ]
    return words


def _interpolate_word_time(word_starts: list[float], fraction: float) -> float:
    if not word_starts:
        return 0.0
    if len(word_starts) == 1:
        return word_starts[0]

    fraction = max(0.0, min(1.0, fraction))
    pos = fraction * (len(word_starts) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(word_starts) - 1)
    if lo == hi:
        return word_starts[lo]
    frac = pos - lo
    return word_starts[lo] + frac * (word_starts[hi] - word_starts[lo])


def _speech_span_from_words(
    word_starts: list[float],
    *,
    audio_duration: Optional[float] = None,
) -> tuple[float, float]:
    if not word_starts:
        if audio_duration and audio_duration > 0:
            return 0.0, audio_duration
        return 0.0, 0.0

    start = word_starts[0]
    detected_end = word_starts[-1]
    avg_word_span = max((detected_end - start) / max(len(word_starts), 1), 0.25)
    end = detected_end + avg_word_span * 2

    if audio_duration and audio_duration > end:
        detected_span = detected_end - start
        if detected_span < audio_duration * 0.55:
            end = max(end, audio_duration - 0.5)
        else:
            end = min(end, audio_duration)

    return start, max(end, start + _MIN_LINE_GAP_SEC)


def _compute_group_targets(num_words: int, weights: list[float]) -> list[int]:
    line_count = len(weights)
    total_weight = sum(weights) or float(line_count)
    targets = [max(1, round(weight / total_weight * num_words)) for weight in weights]

    diff = num_words - sum(targets)
    idx = 0
    while diff > 0:
        targets[idx % line_count] += 1
        diff -= 1
        idx += 1
    while diff < 0:
        if targets[idx % line_count] > 1:
            targets[idx % line_count] -= 1
            diff += 1
        idx += 1
    return targets


def _optimal_word_partition(num_words: int, targets: list[int]) -> list[int]:
    line_count = len(targets)
    if num_words <= 0:
        return [0] * line_count

    inf = 10**9
    dp = [[inf] * (num_words + 1) for _ in range(line_count + 1)]
    choice = [[0] * (num_words + 1) for _ in range(line_count + 1)]
    dp[0][0] = 0

    for line_idx in range(1, line_count + 1):
        target = targets[line_idx - 1]
        for used_words in range(line_idx, num_words + 1):
            for prev_words in range(line_idx - 1, used_words):
                group_size = used_words - prev_words
                cost = dp[line_idx - 1][prev_words] + (group_size - target) ** 2
                if cost < dp[line_idx][used_words]:
                    dp[line_idx][used_words] = cost
                    choice[line_idx][used_words] = prev_words

    start_indices: list[int] = []
    used_words = num_words
    for line_idx in range(line_count, 0, -1):
        prev_words = choice[line_idx][used_words]
        start_indices.append(prev_words)
        used_words = prev_words
    start_indices.reverse()
    return start_indices


def _snap_to_nearest_word_start(
    timestamp: float,
    word_starts: list[float],
    *,
    window: float = _GEMINI_ALIGN_SNAP_WINDOW_SEC,
) -> float:
    best = timestamp
    best_distance = window + 1.0
    for word_start in word_starts:
        distance = abs(word_start - timestamp)
        if distance <= window and distance < best_distance:
            best_distance = distance
            best = word_start
    return best


def _normalize_for_match(text: str) -> str:
    lowered = text.casefold()
    cleaned = re.sub(r"[^\w\s]", " ", lowered, flags=re.UNICODE)
    return " ".join(cleaned.split())


def _text_similarity(left: str, right: str) -> float:
    normalized_left = _normalize_for_match(left)
    normalized_right = _normalize_for_match(right)
    if not normalized_left or not normalized_right:
        return 0.0
    return difflib.SequenceMatcher(None, normalized_left, normalized_right).ratio()


def _phrase_confidence_from_score(score: float) -> str:
    if score >= _PHRASE_MATCH_HIGH_THRESHOLD:
        return "high"
    if score >= _PHRASE_MATCH_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


def _normalize_gemini_confidence(raw_value: Any) -> str:
    if not isinstance(raw_value, str):
        return "medium"
    normalized = raw_value.strip().lower()
    if normalized in {"high", "strong", "sure", "confident"}:
        return "high"
    if normalized in {"medium", "med", "moderate", "partial"}:
        return "medium"
    return "low"


def _weighted_span_times(
    start_time: float,
    end_time: float,
    weights: list[float],
) -> list[float]:
    if not weights:
        return []
    if len(weights) == 1:
        return [start_time]

    total_weight = sum(weights) or float(len(weights))
    span = max(end_time - start_time, len(weights) * _MIN_LINE_GAP_SEC)
    times: list[float] = []
    cumulative = 0.0
    for weight in weights:
        cumulative += weight
        fraction = cumulative / total_weight
        times.append(start_time + fraction * span)
    return times


def _interpolate_line_starts_from_anchors(
    by_line: dict[int, float],
    line_count: int,
    *,
    lyric_weights: Optional[list[float]] = None,
    audio_duration: Optional[float] = None,
) -> list[float]:
    if line_count <= 0:
        return []

    weights = lyric_weights or [1.0] * line_count

    if not by_line:
        return _weighted_span_times(0.0, line_count * _DEFAULT_LINE_DURATION_SEC, weights)

    starts = [0.0] * line_count
    known = sorted((line_no, timestamp) for line_no, timestamp in by_line.items() if line_no > 0)
    if not known:
        return _weighted_span_times(0.0, line_count * _DEFAULT_LINE_DURATION_SEC, weights)

    for line_no, timestamp in known:
        if 1 <= line_no <= line_count:
            starts[line_no - 1] = timestamp

    first_line, first_time = known[0]
    first_idx = first_line - 1
    if first_idx > 0:
        leading_weights = weights[:first_idx]
        leading_times = _weighted_span_times(0.0, first_time, leading_weights)
        for idx, timestamp in enumerate(leading_times):
            starts[idx] = timestamp

    for (line_a, time_a), (line_b, time_b) in zip(known, known[1:]):
        idx_a = line_a - 1
        idx_b = line_b - 1
        gap = idx_b - idx_a
        if gap <= 1:
            continue
        interior_weights = weights[idx_a + 1:idx_b]
        total_weight = sum(interior_weights) or float(len(interior_weights))
        span = time_b - time_a
        cumulative = 0.0
        for offset, weight in enumerate(interior_weights, start=1):
            start_frac = cumulative / total_weight
            cumulative += weight
            end_frac = cumulative / total_weight
            midpoint = (start_frac + end_frac) / 2.0
            starts[idx_a + offset] = time_a + midpoint * span

    last_line, last_time = known[-1]
    last_idx = last_line - 1
    trailing = line_count - last_idx - 1
    if trailing > 0:
        tail_end = audio_duration if audio_duration and audio_duration > last_time else (
            last_time + (trailing + 1) * _DEFAULT_LINE_DURATION_SEC
        )
        trailing_weights = weights[last_idx + 1:]
        trailing_times = _weighted_span_times(last_time, tail_end, trailing_weights)
        for offset, timestamp in enumerate(trailing_times, start=1):
            starts[last_idx + offset] = timestamp

    return starts


def _ensure_line_start_count(line_starts: list[float], line_count: int) -> list[float]:
    if line_count <= 0:
        return []
    if not line_starts:
        return [idx * _DEFAULT_LINE_DURATION_SEC for idx in range(line_count)]
    if len(line_starts) >= line_count:
        return list(line_starts[:line_count])

    padded = list(line_starts)
    last = padded[-1]
    while len(padded) < line_count:
        last += _MIN_LINE_GAP_SEC
        padded.append(last)
    return padded


def _spread_duplicate_line_starts(
    line_starts: list[float],
    lyric_lines: list[str],
    *,
    audio_duration: Optional[float] = None,
) -> list[float]:
    if not line_starts:
        return line_starts

    line_count = len(line_starts)
    max_time = audio_duration if audio_duration and audio_duration > 0 else (
        line_starts[-1] + line_count * _DEFAULT_LINE_DURATION_SEC
    )
    weights = [_line_alignment_weight(line) for line in lyric_lines[:line_count]]
    if len(weights) < line_count:
        weights.extend([1.0] * (line_count - len(weights)))

    spread = list(line_starts)
    idx = 0
    while idx < line_count:
        run_start = idx
        while idx + 1 < line_count and spread[idx + 1] <= spread[run_start] + 1e-6:
            idx += 1
        run_end = idx
        run_len = run_end - run_start + 1
        if run_len > 1:
            next_time = spread[run_end + 1] if run_end + 1 < line_count else max_time
            span = max(next_time - spread[run_start], run_len * _MIN_LINE_GAP_SEC)
            run_weights = weights[run_start:run_end + 1]
            total_weight = sum(run_weights) or float(run_len)
            cumulative = 0.0
            for offset, weight in enumerate(run_weights):
                if offset == 0:
                    spread[run_start] = spread[run_start]
                    cumulative += weight
                    continue
                cumulative += weight
                frac = cumulative / total_weight
                spread[run_start + offset] = spread[run_start] + frac * span
        idx += 1

    return spread


def _finalize_line_starts(
    line_starts: list[float],
    lyric_lines: list[str],
    *,
    audio_duration: Optional[float] = None,
) -> list[float]:
    line_count = len(lyric_lines)
    finalized = _ensure_line_start_count(line_starts, line_count)
    finalized = _spread_duplicate_line_starts(
        finalized,
        lyric_lines,
        audio_duration=audio_duration,
    )

    max_time = audio_duration if audio_duration and audio_duration > 0 else (
        finalized[-1] + line_count * _DEFAULT_LINE_DURATION_SEC
    )
    last_start = -1.0
    for idx in range(line_count):
        start_time = max(0.0, min(float(finalized[idx]), max_time))
        if last_start >= 0 and start_time <= last_start + 1e-6:
            start_time = last_start + _MIN_LINE_GAP_SEC
        if last_start >= 0 and start_time < last_start + _MIN_LINE_GAP_SEC:
            start_time = last_start + _MIN_LINE_GAP_SEC
        if start_time > max_time:
            start_time = max_time
        finalized[idx] = start_time
        last_start = start_time

    if line_count > 1 and finalized[-1] <= finalized[-2]:
        finalized[-1] = min(max_time, finalized[-2] + _MIN_LINE_GAP_SEC)

    return finalized


def _sanitize_line_starts(
    starts: list[float],
    transcript_words: list[TranscriptWord],
    *,
    confidences: Optional[list[str]] = None,
    audio_duration: Optional[float] = None,
) -> list[float]:
    if not starts:
        return starts

    word_starts = [word.start for word in transcript_words]
    min_time = word_starts[0] if word_starts else 0.0
    max_time = audio_duration if audio_duration and audio_duration > 0 else (
        transcript_words[-1].end if transcript_words else starts[-1] + 10.0
    )

    sanitized: list[float] = []
    last_start = -1.0
    for idx, raw_start in enumerate(starts):
        start_time = max(min_time, min(float(raw_start), max_time))
        confidence = confidences[idx] if confidences and idx < len(confidences) else "low"

        if word_starts and confidence != "high":
            snap_window = (
                _MEDIUM_CONFIDENCE_SNAP_WINDOW_SEC
                if confidence == "medium"
                else _GEMINI_ALIGN_SNAP_WINDOW_SEC
            )
            snapped = _snap_to_nearest_word_start(start_time, word_starts, window=snap_window)
            if last_start < 0 or snapped >= last_start + _MIN_LINE_GAP_SEC:
                start_time = snapped
            elif snapped > start_time:
                start_time = snapped
        elif word_starts and confidence == "high":
            snapped = _snap_to_nearest_word_start(
                start_time,
                word_starts,
                window=_HIGH_CONFIDENCE_SNAP_WINDOW_SEC,
            )
            if abs(snapped - start_time) <= _HIGH_CONFIDENCE_SNAP_WINDOW_SEC:
                if last_start < 0 or snapped >= last_start + _MIN_LINE_GAP_SEC:
                    start_time = snapped

        if last_start >= 0 and start_time < last_start + _MIN_LINE_GAP_SEC:
            start_time = last_start + _MIN_LINE_GAP_SEC
        if start_time > max_time:
            start_time = max_time
        sanitized.append(start_time)
        last_start = start_time
    return sanitized


def _parse_gemini_alignment_payload(
    raw_payload: Any,
    line_count: int,
    *,
    lyric_weights: Optional[list[float]] = None,
    audio_duration: Optional[float] = None,
) -> tuple[list[float], list[str]]:
    if isinstance(raw_payload, dict):
        entries = raw_payload.get("starts") or raw_payload.get("lines") or raw_payload.get("alignments") or []
    elif isinstance(raw_payload, list):
        entries = raw_payload
    else:
        raise LyricsPipelineError("Gemini alignment response has unexpected shape")

    by_line: dict[int, float] = {}
    confidences = ["low"] * line_count
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        line_no = int(entry.get("line") or entry.get("line_number") or entry.get("index") or 0)
        if line_no <= 0 or line_no > line_count:
            continue
        start_value = entry.get("start")
        if start_value is None:
            start_value = entry.get("start_seconds") or entry.get("time")
        if start_value is None:
            continue
        by_line[line_no] = float(start_value)
        confidences[line_no - 1] = _normalize_gemini_confidence(entry.get("confidence"))

    if len(by_line) < max(1, line_count // 2):
        raise LyricsPipelineError("Gemini alignment returned too few line timestamps")

    starts = _interpolate_line_starts_from_anchors(
        by_line,
        line_count,
        lyric_weights=lyric_weights,
        audio_duration=audio_duration,
    )
    for line_no, timestamp in by_line.items():
        starts[line_no - 1] = timestamp
    return starts, confidences


def _build_transcript_segments(
    phrases: list[dict[str, Any]],
    transcript_words: list[TranscriptWord],
) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = [dict(phrase) for phrase in phrases]
    window_size = 8
    stride = 4
    for start_idx in range(0, len(transcript_words), stride):
        chunk = transcript_words[start_idx:start_idx + window_size]
        if not chunk:
            continue
        text = " ".join(word.text for word in chunk if word.text).strip()
        if not text:
            continue
        segments.append(
            {
                "text": text,
                "start": round(chunk[0].start, 2),
                "end": round(chunk[-1].end, 2),
            }
        )
    segments.sort(key=lambda item: float(item["start"]))
    return segments


def _detect_vocal_regions(
    transcript_words: list[TranscriptWord],
    *,
    gap_threshold: float = 1.8,
    audio_duration: Optional[float] = None,
) -> list[tuple[float, float]]:
    if not transcript_words:
        if audio_duration and audio_duration > 0:
            return [(0.0, audio_duration)]
        return []

    regions: list[tuple[float, float]] = []
    region_start = transcript_words[0].start
    region_end = transcript_words[0].end

    for word in transcript_words[1:]:
        if word.start - region_end >= gap_threshold:
            regions.append((region_start, region_end))
            region_start = word.start
        region_end = max(region_end, word.end)
    regions.append((region_start, region_end))

    if audio_duration and audio_duration > regions[-1][1]:
        regions[-1] = (regions[-1][0], min(audio_duration, regions[-1][1] + 1.5))

    return regions


def _vocal_fraction_to_time(fraction: float, regions: list[tuple[float, float]]) -> float:
    if not regions:
        return 0.0
    fraction = max(0.0, min(1.0, fraction))
    total_span = sum(end - start for start, end in regions)
    if total_span <= 0:
        return regions[0][0]

    target = fraction * total_span
    accumulated = 0.0
    for start, end in regions:
        span = end - start
        if accumulated + span >= target:
            return start + (target - accumulated)
        accumulated += span
    return regions[-1][0]


def _refine_low_confidence_starts(
    starts: list[float],
    confidences: list[str],
    lyric_lines: list[str],
    vocal_regions: list[tuple[float, float]],
) -> list[float]:
    if not vocal_regions:
        return starts

    weights = [_line_alignment_weight(line) for line in lyric_lines]
    total_weight = sum(weights) or float(len(weights))
    refined = list(starts)
    cumulative = 0.0

    for idx, (weight, confidence) in enumerate(zip(weights, confidences)):
        if confidence != "low":
            cumulative += weight
            continue
        start_fraction = cumulative / total_weight
        cumulative += weight
        refined[idx] = _vocal_fraction_to_time(start_fraction, vocal_regions)

    last_start = -1.0
    for idx, start_time in enumerate(refined):
        if last_start >= 0 and start_time < last_start + _MIN_LINE_GAP_SEC:
            refined[idx] = last_start + _MIN_LINE_GAP_SEC
        last_start = refined[idx]
    return refined


def _sequence_align_lines_to_segments(
    match_lines: list[str],
    segments: list[dict[str, Any]],
) -> tuple[list[float], list[str]]:
    line_count = len(match_lines)
    segment_count = len(segments)
    if line_count == 0 or segment_count == 0:
        return [0.0] * line_count, ["low"] * line_count

    negative_inf = -10**9
    dp = [[negative_inf] * (segment_count + 1) for _ in range(line_count + 1)]
    parent = [[(-1, -1)] * (segment_count + 1) for _ in range(line_count + 1)]
    dp[0][0] = 0.0

    for line_idx in range(1, line_count + 1):
        for seg_used in range(1, segment_count + 1):
            for prev_seg in range(line_idx - 1, seg_used):
                group_text = " ".join(
                    segments[seg_idx]["text"] for seg_idx in range(prev_seg, seg_used)
                )
                score = _text_similarity(match_lines[line_idx - 1], group_text)
                total_score = dp[line_idx - 1][prev_seg] + score
                if total_score > dp[line_idx][seg_used]:
                    dp[line_idx][seg_used] = total_score
                    parent[line_idx][seg_used] = (line_idx - 1, prev_seg)

    best_seg_used = segment_count
    if line_count <= segment_count:
        best_seg_used = max(
            range(line_count, segment_count + 1),
            key=lambda seg_used: dp[line_count][seg_used],
        )

    assignments: list[tuple[int, int]] = []
    line_idx = line_count
    seg_used = best_seg_used
    while line_idx > 0 and seg_used > 0:
        prev_line, prev_seg = parent[line_idx][seg_used]
        if prev_line < 0:
            break
        assignments.append((line_idx - 1, prev_seg))
        line_idx, seg_used = prev_line, prev_seg
    assignments.reverse()

    starts = [float(segments[0]["start"])] * line_count
    confidences = ["low"] * line_count
    if not assignments:
        for line_index in range(line_count):
            seg_index = min(
                int(round(line_index * (segment_count - 1) / max(line_count - 1, 1))),
                segment_count - 1,
            )
            starts[line_index] = float(segments[seg_index]["start"])
            confidences[line_index] = "low"
        return starts, confidences

    assignment_map = {line_index: seg_index for line_index, seg_index in assignments}

    for line_index in range(line_count):
        seg_index = assignment_map.get(line_index, min(line_index, segment_count - 1))
        starts[line_index] = float(segments[seg_index]["start"])
        group_end = min(segment_count, seg_index + max(1, segment_count // max(line_count, 1)))
        group_text = " ".join(
            segments[group_idx]["text"] for group_idx in range(seg_index, group_end)
        )
        confidences[line_index] = _phrase_confidence_from_score(
            _text_similarity(match_lines[line_index], group_text)
        )

    return starts, confidences


def _align_line_starts_with_phrases(
    lyric_lines: list[str],
    phrases: list[dict[str, Any]],
    *,
    transcript_words: Optional[list[TranscriptWord]] = None,
    match_lines: Optional[list[str]] = None,
) -> tuple[list[float], list[str]]:
    line_count = len(lyric_lines)
    starts = [0.0] * line_count
    confidences = ["low"] * line_count
    segments = _build_transcript_segments(phrases, transcript_words or [])
    if not segments:
        return starts, confidences

    comparison_lines = match_lines or lyric_lines
    return _sequence_align_lines_to_segments(comparison_lines, segments)


def _confidence_rank(confidence: str) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get(confidence, 0)


def _merge_alignment_sources(
    lyric_lines: list[str],
    phrase_starts: list[float],
    phrase_confidences: list[str],
    gemini_starts: Optional[list[float]],
    gemini_confidences: Optional[list[str]],
    *,
    audio_duration: Optional[float] = None,
) -> tuple[list[float], list[str]]:
    line_count = len(lyric_lines)
    weights = [_line_alignment_weight(line) for line in lyric_lines]
    merged_starts = [0.0] * line_count
    merged_confidences = ["low"] * line_count

    for idx in range(line_count):
        phrase_conf = phrase_confidences[idx] if idx < len(phrase_confidences) else "low"
        phrase_start = phrase_starts[idx] if idx < len(phrase_starts) else 0.0
        gemini_conf = (
            gemini_confidences[idx]
            if gemini_starts and gemini_confidences and idx < len(gemini_confidences)
            else "low"
        )
        gemini_start = gemini_starts[idx] if gemini_starts and idx < len(gemini_starts) else phrase_start

        if _confidence_rank(gemini_conf) > _confidence_rank(phrase_conf):
            merged_starts[idx] = gemini_start
            merged_confidences[idx] = gemini_conf
        elif _confidence_rank(phrase_conf) > _confidence_rank(gemini_conf):
            merged_starts[idx] = phrase_start
            merged_confidences[idx] = phrase_conf
        elif gemini_starts:
            merged_starts[idx] = gemini_start
            merged_confidences[idx] = gemini_conf
        else:
            merged_starts[idx] = phrase_start
            merged_confidences[idx] = phrase_conf

    anchor_lines = {
        idx + 1: merged_starts[idx]
        for idx in range(line_count)
        if merged_confidences[idx] in {"high", "medium"}
    }
    if len(anchor_lines) < max(2, line_count // 4):
        anchor_lines = {idx + 1: merged_starts[idx] for idx in range(line_count)}

    interpolated = _interpolate_line_starts_from_anchors(
        anchor_lines,
        line_count,
        lyric_weights=weights,
        audio_duration=audio_duration,
    )

    for idx in range(line_count):
        if merged_confidences[idx] == "high":
            interpolated[idx] = merged_starts[idx]
        elif merged_confidences[idx] == "medium":
            if abs(interpolated[idx] - merged_starts[idx]) > 2.5:
                interpolated[idx] = merged_starts[idx]
            else:
                interpolated[idx] = (interpolated[idx] + merged_starts[idx]) / 2.0

    return interpolated, merged_confidences


def _extract_transcript_phrases(google_response: Any) -> list[dict[str, Any]]:
    response = (
        google_response.response
        if isinstance(google_response, GoogleTranscriptResult)
        else google_response
    )
    phrases: list[dict[str, Any]] = []
    for result in response.results:
        if not result.alternatives:
            continue
        alternative = result.alternatives[0]
        words = alternative.words
        if not words:
            continue
        start = words[0].start_offset.total_seconds()
        end = (
            words[-1].end_offset.total_seconds()
            if words[-1].end_offset
            else start + 0.5
        )
        phrases.append(
            {
                "text": (alternative.transcript or "").strip(),
                "start": round(start, 2),
                "end": round(end, 2),
            }
        )
    return phrases


def _align_line_starts_with_gemini(
    lyric_lines: list[str],
    transcript_words: list[TranscriptWord],
    *,
    audio_duration: Optional[float],
    google_project_id: str,
    google_vertex_location: str,
    google_credentials_path: str,
    gemini_model: str,
    google_response: Any = None,
    match_lines: Optional[list[str]] = None,
) -> Optional[tuple[list[float], list[str]]]:
    if not google_project_id or not lyric_lines or not transcript_words:
        return None

    lyric_weights = [_line_alignment_weight(line) for line in lyric_lines]
    comparison_lines = match_lines or lyric_lines
    words_payload = [
        {"w": word.text, "s": round(word.start, 2), "e": round(word.end, 2)}
        for word in transcript_words
    ]
    lines_payload = [{"line": idx + 1, "text": line} for idx, line in enumerate(lyric_lines)]
    romanized_payload = [
        {"line": idx + 1, "romanized": line}
        for idx, line in enumerate(comparison_lines)
    ]
    rough_text = " ".join(word.text for word in transcript_words if word.text).strip()
    phrase_payload = _extract_transcript_phrases(google_response) if google_response else []

    prompt = (
        "You are aligning exact song lyrics to speech-recognition word timings.\n\n"
        f"LYRIC_LINES ({len(lyric_lines)} lines, authoritative display text):\n"
        f"{json.dumps(lines_payload, ensure_ascii=False)}\n\n"
        f"ROMANIZED_MATCH_HINTS (use these to match ASR sound, not the native script lines):\n"
        f"{json.dumps(romanized_payload, ensure_ascii=False)}\n\n"
        f"TRANSCRIPT_WORDS (approximate ASR output, may be romanized or misspelled):\n"
        f"{json.dumps(words_payload, ensure_ascii=False)}\n\n"
        f"TRANSCRIPT_PHRASES:\n{json.dumps(phrase_payload, ensure_ascii=False)}\n\n"
        f"ROUGH_TRANSCRIPT: {rough_text}\n"
        f"FIRST_VOCAL_WORD_AT_SECONDS: {transcript_words[0].start:.2f}\n"
        f"TRACK_DURATION_SECONDS: {audio_duration or 'unknown'}\n\n"
        "Return JSON only with this exact shape:\n"
        '{"starts":[{"line":1,"start":12.34,"confidence":"high"},'
        '{"line":2,"start":15.80,"confidence":"medium"}]}\n\n'
        "Rules:\n"
        f"- Return exactly {len(lyric_lines)} entries with line numbers 1..{len(lyric_lines)}\n"
        "- start is seconds when that lyric line begins being sung\n"
        '- confidence is "high", "medium", or "low" based on match certainty\n'
        "- Use high only when the transcript clearly supports that exact line timing\n"
        "- Match using ROMANIZED_MATCH_HINTS against the transcript, not literal native script\n"
        "- Timestamps must be monotonically non-decreasing\n"
        "- Anchor each start to the nearest transcript word timing\n"
        "- Skip instrumental gaps; do not place lines during long silent gaps\n"
        "- Account for instrumental intro before the first vocal line\n"
        "- Do not invent lyrics; only assign timestamps to the provided lines"
    )

    try:
        raw = _gemini_generate_text(
            prompt,
            google_project_id=google_project_id,
            google_vertex_location=google_vertex_location,
            google_credentials_path=google_credentials_path,
            gemini_model=gemini_model,
            json_mode=True,
        )
        payload = json.loads(raw)
        return _parse_gemini_alignment_payload(
            payload,
            len(lyric_lines),
            lyric_weights=lyric_weights,
            audio_duration=audio_duration,
        )
    except Exception as exc:
        logger.warning("Gemini lyric alignment failed: %s", exc)
        return None


def _align_line_starts_combined(
    lyric_lines: list[str],
    transcript_words: list[TranscriptWord],
    *,
    audio_duration: Optional[float],
    google_project_id: str,
    google_vertex_location: str,
    google_credentials_path: str,
    gemini_model: str,
    google_response: Any = None,
) -> tuple[list[float], list[str], str]:
    match_lines = lyric_lines
    if google_project_id and any(_is_mostly_non_latin(line) for line in lyric_lines):
        try:
            match_lines = _romanized_lines_for_matching(
                lyric_lines,
                google_project_id=google_project_id,
                google_vertex_location=google_vertex_location,
                google_credentials_path=google_credentials_path,
                gemini_model=gemini_model,
            )
        except LyricsPipelineError as exc:
            logger.warning("Romanized lyric hints unavailable: %s", exc)

    phrases = _extract_transcript_phrases(google_response) if google_response else []
    phrase_starts, phrase_confidences = _align_line_starts_with_phrases(
        lyric_lines,
        phrases,
        transcript_words=transcript_words,
        match_lines=match_lines,
    )

    gemini_result = _align_line_starts_with_gemini(
        lyric_lines,
        transcript_words,
        audio_duration=audio_duration,
        google_project_id=google_project_id,
        google_vertex_location=google_vertex_location,
        google_credentials_path=google_credentials_path,
        gemini_model=gemini_model,
        google_response=google_response,
        match_lines=match_lines,
    )

    gemini_starts: Optional[list[float]] = None
    gemini_confidences: Optional[list[str]] = None
    alignment_method = "sequence"
    if gemini_result:
        gemini_starts, gemini_confidences = gemini_result
        alignment_method = "sequence+gemini"

    merged_starts, merged_confidences = _merge_alignment_sources(
        lyric_lines,
        phrase_starts,
        phrase_confidences,
        gemini_starts,
        gemini_confidences,
        audio_duration=audio_duration,
    )
    vocal_regions = _detect_vocal_regions(
        transcript_words,
        audio_duration=audio_duration,
    )
    merged_starts = _refine_low_confidence_starts(
        merged_starts,
        merged_confidences,
        lyric_lines,
        vocal_regions,
    )
    merged_starts = _sanitize_line_starts(
        merged_starts,
        transcript_words,
        confidences=merged_confidences,
        audio_duration=audio_duration,
    )
    merged_starts = _finalize_line_starts(
        merged_starts,
        lyric_lines,
        audio_duration=audio_duration,
    )
    return merged_starts, merged_confidences, alignment_method


def _align_line_starts_by_word_partition(
    lyric_lines: list[str],
    transcript_words: list[TranscriptWord],
    *,
    audio_duration: Optional[float] = None,
) -> list[float]:
    if not transcript_words:
        return _align_line_starts_proportional(
            lyric_lines,
            transcript_words,
            audio_duration=audio_duration,
        )

    weights = [_line_alignment_weight(line) for line in lyric_lines]
    num_words = len(transcript_words)
    line_count = len(lyric_lines)

    if num_words < line_count:
        start_indices = []
        for line_idx in range(line_count):
            fraction = line_idx / max(line_count - 1, 1)
            start_indices.append(
                min(int(round(fraction * (num_words - 1))), num_words - 1)
            )
    else:
        targets = _compute_group_targets(num_words, weights)
        start_indices = _optimal_word_partition(num_words, targets)

    starts = [transcript_words[idx].start for idx in start_indices]
    return _finalize_line_starts(
        starts,
        lyric_lines,
        audio_duration=audio_duration,
    )


def _align_line_starts_proportional(
    lyric_lines: list[str],
    transcript_words: list[TranscriptWord],
    *,
    audio_duration: Optional[float] = None,
) -> list[float]:
    word_starts = [word.start for word in transcript_words]
    weights = [_line_alignment_weight(line) for line in lyric_lines]
    total_weight = sum(weights) or float(len(lyric_lines))
    speech_start, speech_end = _speech_span_from_words(
        word_starts,
        audio_duration=audio_duration,
    )
    speech_span = max(speech_end - speech_start, len(lyric_lines) * _MIN_LINE_GAP_SEC)

    starts: list[float] = []
    cumulative_weight = 0.0
    last_start = -1.0
    for line, weight in zip(lyric_lines, weights):
        start_fraction = cumulative_weight / total_weight
        cumulative_weight += weight

        if word_starts:
            start_time = _interpolate_word_time(word_starts, start_fraction)
        else:
            start_time = speech_start + start_fraction * speech_span

        if last_start >= 0 and start_time < last_start + _MIN_LINE_GAP_SEC:
            start_time = last_start + _MIN_LINE_GAP_SEC

        last_start = start_time
        starts.append(start_time)
    return _finalize_line_starts(
        starts,
        lyric_lines,
        audio_duration=audio_duration,
    )


def _build_timed_lrc(
    lyric_lines: list[str],
    line_starts: list[float],
    *,
    audio_duration: Optional[float] = None,
) -> tuple[str, list[dict[str, Any]]]:
    line_starts = _finalize_line_starts(
        line_starts,
        lyric_lines,
        audio_duration=audio_duration,
    )

    if len(line_starts) != len(lyric_lines):
        logger.warning(
            "Line start count mismatch after alignment (%s starts for %s lines)",
            len(line_starts),
            len(lyric_lines),
        )

    timed: list[dict[str, Any]] = []
    lrc_lines: list[str] = []

    for line, start_time in zip(lyric_lines, line_starts):
        timestamp = _format_lrc_timestamp(start_time)
        lrc_lines.append(f"{timestamp}{line}")
        timed.append({"start": start_time, "end": None, "text": line})

    for idx, segment in enumerate(timed):
        if idx + 1 < len(timed):
            segment["end"] = timed[idx + 1]["start"]
        else:
            segment["end"] = segment["start"] + _DEFAULT_LINE_DURATION_SEC

    return "\n".join(lrc_lines), timed


def _merge_transliterated_timed(
    timed: list[dict[str, Any]],
    transliterated_lrc: str,
) -> tuple[str, list[dict[str, Any]]]:
    parsed = parse_lrc_to_timed(transliterated_lrc)
    merged: list[dict[str, Any]] = []

    for idx, segment in enumerate(timed):
        text = parsed[idx]["text"] if idx < len(parsed) else segment["text"]
        merged.append({**segment, "text": text})

    if len(parsed) > len(timed):
        logger.warning(
            "Transliteration added %s extra lyric lines; preserving timestamps for original lines",
            len(parsed) - len(timed),
        )
        for extra in parsed[len(timed):]:
            merged.append(extra)

    lrc_lines = [f"{_format_lrc_timestamp(segment['start'])}{segment['text']}" for segment in merged]
    for idx, segment in enumerate(merged):
        if idx + 1 < len(merged):
            segment["end"] = merged[idx + 1]["start"]
        else:
            segment["end"] = segment["start"] + _DEFAULT_LINE_DURATION_SEC
    return "\n".join(lrc_lines), merged


def _timed_from_alignment(
    google_response: Any,
    original_lyrics_text: str,
    *,
    word_starts: Optional[list[float]] = None,
    audio_duration: Optional[float] = None,
    google_project_id: str = "",
    google_vertex_location: str = "us-central1",
    google_credentials_path: str = "",
    gemini_model: str = "gemini-2.5-flash",
) -> tuple[str, list[dict[str, Any]]]:
    lyric_lines = [
        line.strip()
        for line in original_lyrics_text.strip().splitlines()
        if line.strip()
    ]
    if not lyric_lines:
        raise LyricsPipelineError("No lyric lines to align")

    transcript_words = _extract_transcript_words(
        google_response,
        word_starts=word_starts,
    )

    line_starts, _, alignment_method = _align_line_starts_combined(
        lyric_lines,
        transcript_words,
        audio_duration=audio_duration,
        google_project_id=google_project_id,
        google_vertex_location=google_vertex_location,
        google_credentials_path=google_credentials_path,
        gemini_model=gemini_model,
        google_response=google_response,
    )

    if not line_starts:
        if transcript_words:
            line_starts = _align_line_starts_by_word_partition(
                lyric_lines,
                transcript_words,
                audio_duration=audio_duration,
            )
            alignment_method = "word_partition"
        else:
            line_starts = _align_line_starts_proportional(
                lyric_lines,
                transcript_words,
                audio_duration=audio_duration,
            )
            alignment_method = "proportional"

    logger.info(
        "Aligned %s lyric lines using %s (%s transcript words, %s phrases)",
        len(lyric_lines),
        alignment_method,
        len(transcript_words),
        len(_extract_transcript_phrases(google_response) if google_response else []),
    )
    return _build_timed_lrc(
        lyric_lines,
        line_starts,
        audio_duration=audio_duration,
    )


def _detect_language_from_transcript(google_response: Any) -> Optional[str]:
    response = (
        google_response.response
        if isinstance(google_response, GoogleTranscriptResult)
        else google_response
    )
    for result in response.results:
        if result.language_code:
            return result.language_code
    return None


def _prepare_transcription_audio(audio_file_path: str, lalal_api_key: str) -> tuple[str, Optional[str]]:
    """Try LALAL vocal isolation; fall back to the original mix on failure."""
    if not lalal_api_key:
        logger.info("LALAL_API_KEY not set; using original audio for transcription")
        return audio_file_path, None

    try:
        vocal_path = separate_vocals_lalalai(audio_file_path, lalal_api_key)
        return vocal_path, vocal_path
    except LyricsPipelineError as exc:
        logger.warning("LALAL.AI unavailable, falling back to original audio: %s", exc)
        return audio_file_path, None


def _transcribe_audio(audio_path: str, google_project_id: str) -> GoogleTranscriptResult:
    transcript = get_rough_transcript(audio_path, google_project_id)
    rough_parts = [
        result.alternatives[0].transcript
        for result in transcript.response.results
        if result.alternatives
    ]
    if not " ".join(rough_parts).strip():
        raise LyricsPipelineError("Could not capture any speech from the audio")
    return transcript


def _cleanup_temp_audio(path: Optional[str]) -> None:
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


def run_hybrid_lyrics_pipeline(
    audio_file_path: str,
    track_name: str,
    artist_name: str,
    *,
    output_script: Literal["native", "latin"] = "native",
    lyrics_api_url: str = "",
    album_name: Optional[str] = None,
    duration: Optional[float] = None,
    existing_lyrics: Optional[str] = None,
    lalal_api_key: str = "",
    google_project_id: str = "",
    google_vertex_location: str = "us-central1",
    google_credentials_path: str = "",
    gemini_model: str = "gemini-2.5-flash",
    progress_callback: Optional[ProgressCallback] = None,
) -> LyricsPipelineResult:
    if output_script not in ("native", "latin"):
        raise LyricsPipelineError("Lyrics output script must be 'native' or 'latin'")

    if existing_lyrics and existing_lyrics.strip():
        plain_lyrics = strip_lrc_to_plain_lines(existing_lyrics)
        if not plain_lyrics.strip():
            raise LyricsPipelineError("No lyric lines to sync.")

        validate_sync_pipeline_config(google_project_id=google_project_id)

        _ensure_google_credentials(google_credentials_path)

        _report_progress(
            progress_callback,
            "prepare_audio",
            30,
            "Preparing audio for transcription...",
        )
        transcription_path, vocal_temp = _prepare_transcription_audio(audio_file_path, lalal_api_key)
        try:
            _report_progress(
                progress_callback,
                "transcribe",
                45,
                "Transcribing vocals with Google Speech-to-Text...",
            )
            google_response = _transcribe_audio(transcription_path, google_project_id)
            _report_progress(
                progress_callback,
                "align",
                65,
                "Aligning lyric timestamps...",
            )
            lrc_text, timed = _timed_from_alignment(
                google_response,
                plain_lyrics,
                audio_duration=duration,
                google_project_id=google_project_id,
                google_vertex_location=google_vertex_location,
                google_credentials_path=google_credentials_path,
                gemini_model=gemini_model,
            )
            if output_script == "latin":
                _report_progress(
                    progress_callback,
                    "transliterate",
                    80,
                    "Transliterating lyrics to romanized script...",
                )
                lrc_text = transliterate_lyrics_to_latin(
                    lrc_text,
                    google_project_id=google_project_id,
                    google_vertex_location=google_vertex_location,
                    google_credentials_path=google_credentials_path,
                    gemini_model=gemini_model,
                )
                lrc_text, timed = _merge_transliterated_timed(timed, lrc_text)

            language = _detect_language_from_transcript(google_response)
            return LyricsPipelineResult(
                lrc_text=lrc_text,
                timed=timed,
                language=language,
                source="sync",
            )
        finally:
            _cleanup_temp_audio(vocal_temp)

    _report_progress(
        progress_callback,
        "lrclib",
        25,
        "Searching online lyrics database...",
    )
    lrclib_lyrics = fetch_from_lrclib(
        track_name,
        artist_name,
        api_base_url=lyrics_api_url,
        album_name=album_name,
        duration=duration,
    )
    if lrclib_lyrics:
        lyrics_text = lrclib_lyrics.text
        if output_script == "latin":
            _report_progress(
                progress_callback,
                "transliterate",
                85,
                "Transliterating lyrics to romanized script...",
            )
            lyrics_text = transliterate_lyrics_to_latin(
                lyrics_text,
                google_project_id=google_project_id,
                google_vertex_location=google_vertex_location,
                google_credentials_path=google_credentials_path,
                gemini_model=gemini_model,
            )
        timed = parse_lrc_to_timed(lyrics_text) if lrclib_lyrics.is_synced else []
        return LyricsPipelineResult(
            lrc_text=lyrics_text,
            timed=timed,
            source="database",
        )

    validate_ai_pipeline_config(google_project_id=google_project_id)

    _ensure_google_credentials(google_credentials_path)

    _report_progress(
        progress_callback,
        "prepare_audio",
        35,
        "Preparing audio for transcription...",
    )
    transcription_path, vocal_temp = _prepare_transcription_audio(audio_file_path, lalal_api_key)
    try:
        _report_progress(
            progress_callback,
            "transcribe",
            50,
            "Transcribing vocals with Google Speech-to-Text...",
        )
        transcript = _transcribe_audio(transcription_path, google_project_id)
        rough_parts = [
            result.alternatives[0].transcript
            for result in transcript.response.results
            if result.alternatives
        ]
        full_rough_text = " ".join(rough_parts).strip()

        _report_progress(
            progress_callback,
            "gemini_lyrics",
            65,
            "Generating lyrics with Gemini...",
        )
        original_lyrics = get_original_lyrics_from_ai(
            full_rough_text,
            output_script,
            google_project_id=google_project_id,
            google_vertex_location=google_vertex_location,
            google_credentials_path=google_credentials_path,
            gemini_model=gemini_model,
        )
        _report_progress(
            progress_callback,
            "align",
            80,
            "Aligning lyric timestamps...",
        )
        lrc_text, timed = _timed_from_alignment(
            transcript,
            original_lyrics,
            audio_duration=duration,
            google_project_id=google_project_id,
            google_vertex_location=google_vertex_location,
            google_credentials_path=google_credentials_path,
            gemini_model=gemini_model,
        )
        language = _detect_language_from_transcript(transcript)
        return LyricsPipelineResult(
            lrc_text=lrc_text,
            timed=timed,
            language=language,
            source="ai_pipeline",
        )
    finally:
        _cleanup_temp_audio(vocal_temp)
