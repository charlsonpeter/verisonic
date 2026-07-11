import json
import subprocess
import os
import numpy as np
import librosa
import matplotlib
matplotlib.use('Agg') # Headless mode for matplotlib
import matplotlib.pyplot as plt
import librosa.display

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
        
    # Extract metadata tags if present
    tags = fmt.get("tags", {}) or {}
    stream_tags = audio_stream.get("tags", {}) or {}
    title = (
        tags.get("title") or tags.get("TITLE") or tags.get("Title") or
        stream_tags.get("title") or stream_tags.get("TITLE") or stream_tags.get("Title") or ""
    )
    artist = (
        tags.get("artist") or tags.get("ARTIST") or tags.get("Artist") or
        stream_tags.get("artist") or stream_tags.get("ARTIST") or stream_tags.get("Artist") or ""
    )
    album = (
        tags.get("album") or tags.get("ALBUM") or tags.get("Album") or
        stream_tags.get("album") or stream_tags.get("ALBUM") or stream_tags.get("Album") or ""
    )
    composer = (
        tags.get("composer") or tags.get("COMPOSER") or tags.get("Composer") or
        stream_tags.get("composer") or stream_tags.get("COMPOSER") or stream_tags.get("Composer") or ""
    )
    lyricist = (
        tags.get("lyricist") or tags.get("LYRICIST") or tags.get("Lyricist") or
        stream_tags.get("lyricist") or stream_tags.get("LYRICIST") or stream_tags.get("Lyricist") or ""
    )
    lyrics = (
        tags.get("lyrics") or tags.get("LYRICS") or tags.get("Lyrics") or
        tags.get("unsynced lyrics") or tags.get("UNSYNCED LYRICS") or tags.get("Unsynced Lyrics") or
        tags.get("unsyncedlyrics") or tags.get("UNSYNCEDLYRICS") or tags.get("Unsyncedlyrics") or
        tags.get("USLT") or tags.get("uslt") or
        stream_tags.get("lyrics") or stream_tags.get("LYRICS") or stream_tags.get("Lyrics") or
        stream_tags.get("unsynced lyrics") or stream_tags.get("UNSYNCED LYRICS") or stream_tags.get("unsyncedlyrics") or ""
    )
    year_str = (
        tags.get("date") or tags.get("DATE") or tags.get("year") or tags.get("YEAR") or
        stream_tags.get("date") or stream_tags.get("DATE") or stream_tags.get("year") or stream_tags.get("YEAR") or ""
    )
    
    # Parse 4 digit year from date/year tag
    year = None
    if year_str:
        import re
        match = re.search(r"\d{4}", year_str)
        if match:
            try:
                year = int(match.group(0))
            except:
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
        "lyrics": lyrics
    }

def analyze_audio_spectral(file_path: str, output_img_path: str) -> dict:
    """
    Step 2 & 3: Spectral Analysis and Fake 320kbps Detection.
    """
    # Load first 30 seconds of audio with original sample rate to prevent OOM memory issues
    y, sr = librosa.load(file_path, sr=None, duration=30)
    
    # Handle empty or corrupted audio
    if len(y) == 0:
        raise ValueError("Audio file contains no audio data")
        
    # Calculate Short-Time Fourier Transform
    stft = librosa.stft(y)
    magnitude = np.abs(stft)
    
    # Convert magnitude to DB
    magnitude_db = librosa.amplitude_to_db(magnitude, ref=np.max)
    
    # Get frequency bins
    frequencies = librosa.fft_frequencies(sr=sr)
    
    # Step 2: Compute Maximum Frequency & Cutoff
    # We define cutoff_frequency as the frequency bin where 99% of spectral roll-off occurs.
    # To prevent silent sections/fade-ins/fade-outs from dragging down the average,
    # we filter using Root-Mean-Square (RMS) energy to only analyze active frames.
    rolloffs = librosa.feature.spectral_rolloff(y=y, sr=sr, roll_percent=0.99)
    
    rms = librosa.feature.rms(y=y)[0]
    peak_rms = np.max(rms)
    # Filter for active frames with at least 2% of peak RMS energy, and min absolute threshold of 0.0005
    active_frames = np.where((rms > 0.02 * peak_rms) & (rms > 0.0005))[0]
    
    if len(active_frames) > 0:
        active_rolloffs = rolloffs[0, active_frames]
        # Use 90th percentile of active frames to find the true frequency ceiling during active parts
        cutoff_frequency = float(np.percentile(active_rolloffs, 90))
    else:
        # Fallback if no active frames detected
        cutoff_frequency = float(np.percentile(rolloffs, 90))
    
    # Maximum active frequency where magnitude is above -50dB (more sensitive to quiet high-frequency content)
    max_db_per_freq = np.max(magnitude_db, axis=1)
    active_indices = np.where(max_db_per_freq > -50)[0]
    
    if len(active_indices) > 0:
        max_frequency = float(frequencies[active_indices[-1]])
    else:
        max_frequency = cutoff_frequency
        
    # Energy metrics
    power = magnitude ** 2
    total_energy = float(np.sum(power))
    
    # High-frequency energy (above 16kHz)
    hf_indices = np.where(frequencies >= 16000)[0]
    if len(hf_indices) > 0 and total_energy > 0:
        hf_energy = float(np.sum(power[hf_indices, :]))
        high_frequency_energy_ratio = hf_energy / total_energy
    else:
        high_frequency_energy_ratio = 0.0
        
    # Energy above 18kHz
    hf_18_indices = np.where(frequencies >= 18000)[0]
    if len(hf_18_indices) > 0 and total_energy > 0:
        hf_18_energy = float(np.sum(power[hf_18_indices, :]))
        energy_ratio_above_18 = hf_18_energy / total_energy
    else:
        energy_ratio_above_18 = 0.0
        
    # Step 3: Detect Fake 320kbps (Upscaled from 128kbps or other low-quality sources)
    # Signs of a fake upscaled:
    # A track that claims to be high-quality WAV/FLAC or 320kbps MP3,
    # but has a physical cutoff below 16kHz during its active sections (indicating 128kbps upscale).
    is_fake_upscaled = False
    
    if cutoff_frequency < 15500 and max_frequency < 16000:
        is_fake_upscaled = True
        
    print(f"[Audio Analysis] File: {os.path.basename(file_path)} | Cutoff: {cutoff_frequency:.1f} Hz | Max Active Freq: {max_frequency:.1f} Hz | Fake: {is_fake_upscaled}")
        
    # Step 4: Generate Spectrogram Image
    plt.figure(figsize=(10, 4))
    librosa.display.specshow(magnitude_db, sr=sr, x_axis='time', y_axis='linear', cmap='magma')
    plt.colorbar(format='%+2.0f dB')
    plt.title('Spectral Density Spectrogram')
    plt.tight_layout()
    plt.savefig(output_img_path, dpi=100)
    plt.close()
    
    return {
        "max_frequency": max_frequency,
        "cutoff_frequency": cutoff_frequency,
        "high_frequency_energy": high_frequency_energy_ratio,
        "is_fake_upscaled": is_fake_upscaled,
        "energy_ratio_above_18": energy_ratio_above_18
    }

def build_score_breakdown(metadata: dict, spectral: dict) -> tuple[list[dict], int]:
    """
    Build per-check score breakdown. Score starts at 100; each failed check deducts points.
    Returns (breakdown_items, final_score).
    """
    cutoff = float(spectral["cutoff_frequency"])
    max_frequency = float(spectral.get("max_frequency") or 0)
    is_fake_upscaled = spectral.get("is_fake_upscaled")
    if is_fake_upscaled is None:
        is_fake_upscaled = cutoff < 15500 and max_frequency < 16000

    sample_rate = int(metadata["sample_rate"])
    bit_depth = int(metadata["bit_depth"])

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

    checks = [
        ("Sample Rate", sample_rate_pass, f"{sample_rate:,} Hz", "≥ 44,100 Hz", sample_rate_deduction, 40),
        ("Bit Depth", bit_depth_pass, f"{bit_depth}-bit", "≥ 16-bit", bit_depth_deduction, 30),
        (
            "Spectral Cutoff Frequency",
            cutoff_pass,
            f"{cutoff:,.0f} Hz ({cutoff / 1000:.2f} kHz)",
            "≥ 19 kHz: 40 · ≥ 17 kHz: 30 · ≥ 15 kHz: 20 · below 15 kHz: 0",
            cutoff_deduction,
            40,
        ),
        (
            "Upscale / Transcode Detection",
            not is_fake_upscaled,
            "Detected" if is_fake_upscaled else "Not detected",
            "Must not be upscaled",
            fake_deduction,
            50,
        ),
    ]

    breakdown = []
    for check, passed, value, threshold, deduction, max_points in checks:
        achieved = max_points - deduction
        breakdown.append(
            {
                "check": check,
                "description": "",
                "value": value,
                "threshold": threshold,
                "passed": passed,
                "deduction": deduction,
                "max_points": max_points,
                "points_achieved": achieved,
                "calculation": f"{max_points} − {deduction} = {achieved}",
            }
        )

    total_deduction = sum(item["deduction"] for item in breakdown)
    final_score = max(0, min(100, 100 - total_deduction))
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
    Generates score:
    {
      "quality_score": 94,
      "quality_level": "Studio Quality",
      "approved": true
    }
    """
    breakdown, score = build_score_breakdown(metadata, spectral)
    
    # Determine level
    if score >= 86:
        level = "Studio Quality"
    elif score >= 71:
        level = "Good"
    elif score >= 51:
        level = "Average"
    else:
        level = "Poor"
        
    # Upload Approval Rules:
    # Automatically reject:
    # - Frequency cutoff < 17kHz
    # - Sample rate < 44100Hz
    # - Bit depth < 16-bit
    # - Obvious transcoded/fake files
    approved = True
    rejection_reasons = []
    cutoff = spectral["cutoff_frequency"]
    
    if cutoff < 17000:
        approved = False
        rejection_reasons.append("Frequency cutoff below 17kHz (limit for CD/Studio quality)")
    if metadata["sample_rate"] < 44100:
        approved = False
        rejection_reasons.append("Sample rate below 44.1 kHz")
    if metadata["bit_depth"] < 16:
        approved = False
        rejection_reasons.append("Bit depth below 16-bit")
    if spectral.get("is_fake_upscaled") or (
        cutoff < 15500 and float(spectral.get("max_frequency") or 0) < 16000
    ):
        approved = False
        rejection_reasons.append("Fake upscale detected (compressed/low-quality upscale)")
        
    # Automatically approve FLAC, WAV, AIFF, ALAC if score > 85
    # MP3 uploads can be accepted for analysis but not public
    is_lossless = metadata["codec"] in ["flac", "wav", "pcm_s16le", "pcm_s24le", "pcm_s32le", "alac", "aiff"]
    
    return {
        "quality_score": score,
        "quality_level": level,
        "approved": approved,
        "rejection_reasons": rejection_reasons,
        "is_lossless": is_lossless,
        "score_breakdown": breakdown,
        "base_score": 100,
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
