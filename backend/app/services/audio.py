import json
import re
import subprocess
import os
import numpy as np
import librosa
import matplotlib
matplotlib.use('Agg') # Headless mode for matplotlib
import matplotlib.pyplot as plt
import librosa.display

from app.services.acoustic_quality import (
    analyze_pcm_features,
    extract_native_format,
    is_fake_lossless_claim,
    load_audio_pcm,
    to_legacy_spectral,
)


def _build_tag_map(*tag_dicts) -> dict:
    merged: dict[str, str] = {}
    for tags in tag_dicts:
        for key, value in (tags or {}).items():
            if value is None:
                continue
            text = str(value).strip()
            if text:
                merged[key.lower()] = text
    return merged


def _read_tag(tag_map: dict, *keys: str) -> str:
    for key in keys:
        value = tag_map.get(key.lower())
        if value:
            return value
    return ""


def parse_track_number(raw: str) -> int | None:
    if not raw:
        return None
    match = re.search(r"\d+", raw.strip())
    if not match:
        return None
    try:
        return int(match.group(0))
    except ValueError:
        return None


def parse_genre_list(raw: str) -> list[str]:
    if not raw or not raw.strip():
        return []
    genres: list[str] = []
    seen: set[str] = set()
    for part in re.split(r"[/;,|]", raw):
        name = part.strip()
        key = name.lower()
        if name and key not in seen:
            seen.add(key)
            genres.append(name)
    return genres


def extract_metadata(file_path: str) -> dict:
    """
    Step 1: Metadata Analysis using FFprobe.
    Extracts Codec, Duration, Bitrate, Sample Rate, Bit Depth, and Channels.
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise ValueError(f"FFprobe failed to analyze file: {result.stderr}")
        
    info = json.loads(result.stdout)
    
    # Locate audio stream
    audio_stream = None
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "audio":
            audio_stream = stream
            break
            
    if not audio_stream:
        raise ValueError("No audio stream found in file")
        
    fmt = info.get("format", {})
    
    codec = audio_stream.get("codec_name", "unknown")
    duration = float(fmt.get("duration", audio_stream.get("duration", 0)))
    bitrate = int(fmt.get("bit_rate", audio_stream.get("bit_rate", 0)))
    sample_rate = int(audio_stream.get("sample_rate", 0))
    channels = int(audio_stream.get("channels", 0))
    
    # Try to determine bit depth
    sample_fmt = audio_stream.get("sample_fmt", "")
    bits_per_sample = audio_stream.get("bits_per_sample")
    bits_per_raw_sample = audio_stream.get("bits_per_raw_sample")
    
    if bits_per_sample:
        bit_depth = int(bits_per_sample)
    elif bits_per_raw_sample:
        bit_depth = int(bits_per_raw_sample)
    elif "32" in sample_fmt:
        bit_depth = 32
    elif "24" in sample_fmt:
        bit_depth = 24
    elif "16" in sample_fmt:
        bit_depth = 16
    elif "s16" in sample_fmt:
        bit_depth = 16
    elif "flt" in sample_fmt:
        bit_depth = 32
    else:
        # For lossy formats like MP3/AAC, bit depth is technically not constant/defined standard, 
        # but 16-bit is the typical PCM output depth.
        bit_depth = 16
        
    # Extract descriptive metadata tags if present
    tag_map = _build_tag_map(fmt.get("tags", {}), audio_stream.get("tags", {}))
    title = _read_tag(tag_map, "title")
    artist = _read_tag(tag_map, "artist")
    album = _read_tag(tag_map, "album")
    composer = _read_tag(tag_map, "composer")
    lyricist = _read_tag(tag_map, "lyricist")
    lyrics = _read_tag(
        tag_map,
        "lyrics",
        "unsynced lyrics",
        "unsyncedlyrics",
        "uslt",
    )
    album_artist = _read_tag(tag_map, "album_artist", "albumartist", "album artist", "band")
    copyright_text = _read_tag(tag_map, "copyright", "©cpy", "cpy")
    comment = _read_tag(tag_map, "comment", "description", "comments")
    genre_raw = _read_tag(tag_map, "genre", "genres")
    track_number_raw = _read_tag(tag_map, "track", "tracknumber", "track_number", "trck")
    year_str = _read_tag(tag_map, "date", "year", "originaldate", "originalyear")

    year = None
    if year_str:
        match = re.search(r"\d{4}", year_str)
        if match:
            try:
                year = int(match.group(0))
            except ValueError:
                pass

    return {
        "codec": codec,
        "duration": duration,
        "bitrate": bitrate,
        "sample_rate": sample_rate,
        "bit_depth": bit_depth,
        "channels": channels,
        "title": title,
        "artist": artist,
        "album": album,
        "composer": composer,
        "lyricist": lyricist,
        "year": year,
        "lyrics": lyrics,
        "album_artist": album_artist,
        "copyright": copyright_text,
        "comment": comment,
        "genre": genre_raw,
        "genres": parse_genre_list(genre_raw),
        "track_number": parse_track_number(track_number_raw),
    }

def analyze_audio_spectral(file_path: str, output_img_path: str) -> dict:
    """
    Step 2 & 3: Spectral analysis and fake-lossless / upscale detection.

    Uses the acoustic_quality engine (dynamic noise floor, multi-rolloff,
    HF entropy) while preserving the legacy return schema consumed by
    scoring, DB reports, and API clients.
    """
    try:
        native = extract_native_format(file_path)
        y, sr = load_audio_pcm(file_path)
        features = analyze_pcm_features(y, sr, native)
        legacy = to_legacy_spectral(features)
        magnitude_db = features.get("_magnitude_db")
        plot_sr = int(features.get("_sr") or sr)
    except Exception as primary_exc:
        # Fall back to prior heuristic path so uploads are not blocked if
        # the enhanced engine cannot run for an unusual decode.
        print(f"[Audio Analysis] Enhanced engine failed ({primary_exc}); using legacy path")
        y, sr = librosa.load(file_path, sr=None, duration=30)
        if len(y) == 0:
            raise ValueError("Audio file contains no audio data") from primary_exc
        if not np.isfinite(y).all():
            y = np.nan_to_num(y, nan=0.0, posinf=0.0, neginf=0.0)

        stft = librosa.stft(y)
        magnitude = np.abs(stft)
        magnitude_db = librosa.amplitude_to_db(magnitude, ref=np.max)
        frequencies = librosa.fft_frequencies(sr=sr)
        plot_sr = sr

        rolloffs = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.99)
        rms = librosa.feature.rms(y=y)[0]
        peak_rms = np.max(rms)
        active_frames = np.where((rms > 0.02 * peak_rms) & (rms > 0.0005))[0]
        if len(active_frames) > 0:
            cutoff_frequency = float(np.percentile(rolloffs[0, active_frames], 90))
        else:
            cutoff_frequency = float(np.percentile(rolloffs, 90))

        max_db_per_freq = np.max(magnitude_db, axis=1)
        active_indices = np.where(max_db_per_freq > -50)[0]
        max_frequency = (
            float(frequencies[active_indices[-1]]) if len(active_indices) > 0 else cutoff_frequency
        )
        power = magnitude ** 2
        total_energy = float(np.sum(power))
        hf_indices = np.where(frequencies >= 16000)[0]
        high_frequency_energy_ratio = (
            float(np.sum(power[hf_indices, :])) / total_energy
            if len(hf_indices) > 0 and total_energy > 0
            else 0.0
        )
        hf_18_indices = np.where(frequencies >= 18000)[0]
        energy_ratio_above_18 = (
            float(np.sum(power[hf_18_indices, :])) / total_energy
            if len(hf_18_indices) > 0 and total_energy > 0
            else 0.0
        )
        is_fake_upscaled = cutoff_frequency < 15500 and max_frequency < 16000
        legacy = {
            "max_frequency": max_frequency,
            "cutoff_frequency": cutoff_frequency,
            "high_frequency_energy": high_frequency_energy_ratio,
            "is_fake_upscaled": is_fake_upscaled,
            "energy_ratio_above_18": energy_ratio_above_18,
        }

    print(
        f"[Audio Analysis] File: {os.path.basename(file_path)} | "
        f"Cutoff: {legacy['cutoff_frequency']:.1f} Hz | "
        f"Max Active Freq: {legacy['max_frequency']:.1f} Hz | "
        f"Fake: {legacy['is_fake_upscaled']} | "
        f"Tier: {legacy.get('true_quality_tier', 'n/a')}"
    )

    # Spectrogram image (unchanged contract for MinIO upload path)
    if magnitude_db is not None:
        plt.figure(figsize=(10, 4))
        librosa.display.specshow(
            magnitude_db, sr=plot_sr, x_axis="time", y_axis="linear", cmap="magma"
        )
        plt.colorbar(format="%+2.0f dB")
        plt.title("Spectral Density Spectrogram")
        plt.tight_layout()
        plt.savefig(output_img_path, dpi=100)
        plt.close()

    return legacy

def build_score_breakdown(metadata: dict, spectral: dict) -> tuple[list[dict], int]:
    """
    Split 100 points across four checks. Each row's score sums to the final total.
    Returns (breakdown_items, final_score).
    """
    cutoff = float(spectral["cutoff_frequency"])
    max_frequency = float(spectral.get("max_frequency") or 0)
    is_fake_upscaled = spectral.get("is_fake_upscaled")
    sample_rate = int(metadata["sample_rate"])
    bit_depth = int(metadata["bit_depth"])
    if is_fake_upscaled is None:
        # Prefer enhanced claim check only when HF entropy was persisted;
        # otherwise keep legacy 16 kHz heuristic so DB re-scores stay stable.
        entropy = spectral.get("spectral_entropy_high_band")
        if entropy is not None:
            is_fake_upscaled = is_fake_lossless_claim(
                sample_rate, bit_depth, cutoff, max_frequency, float(entropy)
            )
        else:
            is_fake_upscaled = cutoff < 15500 and max_frequency < 16000

    sample_rate_pass = sample_rate >= 44100
    sample_rate_deduction = 0 if sample_rate_pass else 40

    bit_depth_pass = bit_depth >= 16
    bit_depth_deduction = 0 if bit_depth_pass else 30

    if cutoff < 15000:
        cutoff_deduction = 40
    elif cutoff < 17000:
        cutoff_deduction = 20
    elif cutoff < 19000:
        cutoff_deduction = 10
    else:
        cutoff_deduction = 0
    cutoff_pass = cutoff >= 17000

    fake_deduction = 50 if is_fake_upscaled else 0

    # Point split out of 100 (must sum to 100)
    checks = [
        ("Sample Rate", sample_rate_pass, f"{sample_rate:,} Hz", "≥ 44,100 Hz", sample_rate_deduction, 40, 25),
        ("Bit Depth", bit_depth_pass, f"{bit_depth}-bit", "≥ 16-bit", bit_depth_deduction, 30, 20),
        (
            "Spectral Cutoff Frequency",
            cutoff_pass,
            f"{cutoff:,.0f} Hz ({cutoff / 1000:.2f} kHz)",
            "35 pts · ≥ 17 kHz pass",
            cutoff_deduction,
            40,
            35,
        ),
        (
            "Upscale / Transcode Detection",
            not is_fake_upscaled,
            "Detected" if is_fake_upscaled else "Not detected",
            "20 pts · must not be upscaled",
            fake_deduction,
            50,
            20,
        ),
    ]

    breakdown = []
    for check, passed, value, threshold, deduction, max_deduction, weight in checks:
        points_lost = round(weight * deduction / max_deduction) if max_deduction and deduction else 0
        achieved = weight - points_lost
        breakdown.append(
            {
                "check": check,
                "description": "",
                "value": value,
                "threshold": threshold,
                "passed": passed,
                "deduction": deduction,
                "max_points": weight,
                "points_achieved": achieved,
                "calculation": f"{weight} − {points_lost} = {achieved}",
            }
        )

    final_score = sum(item["points_achieved"] for item in breakdown)
    return breakdown, final_score


QUALITY_SCORE_TIERS = [
    {"min_score": 86, "label": "Studio Quality", "description": "Lossless or hi-res master with full spectral integrity."},
    {"min_score": 71, "label": "Good", "description": "Minor high-frequency loss; acceptable for most listeners."},
    {"min_score": 51, "label": "Average", "description": "Noticeable compression artifacts or limited bandwidth."},
    {"min_score": 0, "label": "Poor", "description": "Fails platform quality standards."},
]


def calculate_quality_score(metadata: dict, spectral: dict) -> dict:
    """
    Step 4: Quality Scoring.

    When acoustic analysis provides authenticity_score / true_quality_tier,
    those PCM-based results become the published score (not codec tags).
    Legacy checklist scoring remains for older reports without authenticity.
    """
    breakdown, checklist_score = build_score_breakdown(metadata, spectral)

    authenticity = spectral.get("authenticity_score")
    tier = spectral.get("true_quality_tier")
    if authenticity is not None:
        score = max(0, min(100, int(round(float(authenticity)))))
    else:
        score = checklist_score

    if score >= 86:
        level = "Studio Quality"
    elif score >= 71:
        level = "Good"
    elif score >= 51:
        level = "Average"
    else:
        level = "Poor"

    # Acoustic tier softens marketing labels for lossy brickwall material
    if tier == "HIGH_LOSSY" and level == "Studio Quality":
        level = "Good"
    if tier == "NORMAL":
        level = "Average" if score >= 51 else "Poor"
    if tier == "FAKE_LOSSLESS":
        level = "Poor"

    approved = True
    rejection_reasons = []
    cutoff = float(spectral["cutoff_frequency"])

    if cutoff < 17000:
        approved = False
        rejection_reasons.append("Frequency cutoff below 17kHz (limit for CD/Studio quality)")
    if metadata["sample_rate"] < 44100:
        approved = False
        rejection_reasons.append("Sample rate below 44.1 kHz")
    if metadata["bit_depth"] < 16:
        approved = False
        rejection_reasons.append("Bit depth below 16-bit")

    max_frequency = float(spectral.get("max_frequency") or 0)
    entropy = spectral.get("spectral_entropy_high_band")
    explicit_fake = spectral.get("is_fake_upscaled")
    if explicit_fake is not None:
        fake_detected = bool(explicit_fake)
    elif tier == "FAKE_LOSSLESS":
        fake_detected = True
    elif entropy is not None:
        fake_detected = is_fake_lossless_claim(
            int(metadata["sample_rate"]),
            int(metadata["bit_depth"]),
            float(cutoff),
            max_frequency,
            float(entropy),
        )
    else:
        fake_detected = cutoff < 15500 and max_frequency < 16000
    if fake_detected or tier == "FAKE_LOSSLESS" or (authenticity is not None and score < 30):
        approved = False
        rejection_reasons.append("Fake upscale detected (compressed/low-quality upscale)")

    # Prefer acoustic tier over codec/extension when available
    if tier in ("TRUE_LOSSLESS", "HI_RES"):
        is_lossless = True
    elif tier in ("NORMAL", "HIGH_LOSSY", "FAKE_LOSSLESS"):
        is_lossless = False
    else:
        is_lossless = metadata["codec"] in [
            "flac", "wav", "pcm_s16le", "pcm_s24le", "pcm_s32le", "alac", "aiff",
        ]

    return {
        "quality_score": score,
        "quality_level": level,
        "approved": approved,
        "rejection_reasons": rejection_reasons,
        "is_lossless": is_lossless,
        "score_breakdown": breakdown,
        "base_score": 100,
        "true_quality_tier": tier,
        "authenticity_score": float(authenticity) if authenticity is not None else float(score),
    }

def extract_embedded_cover(audio_path: str, output_image_path: str) -> bool:
    """
    Tries to extract an embedded cover art image from the audio track using ffmpeg.
    Returns True if successfully extracted, False otherwise.
    """
    import os
    import subprocess
    cmd = [
        "ffmpeg", "-y",
        "-i", audio_path,
        "-an",
        "-vcodec", "mjpeg",
        output_image_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode == 0 and os.path.exists(output_image_path) and os.path.getsize(output_image_path) > 0:
            return True
        return False
    except Exception:
        return False
