"""
Production acoustic quality tier engine.

Classifies true acoustic quality from decoded PCM (not file extensions),
detects fake-lossless / upsampled containers, and returns an authenticity score.

Dependencies: librosa, numpy, soundfile.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Optional

import librosa
import numpy as np
import soundfile as sf

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

N_FFT = 4096
HOP_LENGTH = 512
ANALYSIS_DURATION_SEC = 45.0
# RMS thresholds for discarding digital silence / padding
SILENCE_ABS_RMS = 1e-4
SILENCE_REL_PEAK = 0.015
# Frequency band edges (Hz)
BAND_NOISE_FLOOR_LO = 1000.0
BAND_NOISE_FLOOR_HI = 5000.0
BAND_HF_FLOOR = 16000.0
NYQUIST_CD = 22050.0
BRICKWALL_LOSSY_LO = 19000.0
BRICKWALL_LOSSY_HI = 20500.0
NORMAL_CEILING = 16000.0
TRUE_LOSSLESS_FLOOR = 21500.0
HI_RES_PAST_NYQUIST = 22050.0

QualityTier = str  # NORMAL | HIGH_LOSSY | TRUE_LOSSLESS | HI_RES | FAKE_LOSSLESS


@dataclass(frozen=True)
class NativeFormat:
    sample_rate: int
    bit_depth: int
    subtype: str
    channels: int


# ---------------------------------------------------------------------------
# Native format (soundfile PCM truth)
# ---------------------------------------------------------------------------

def _subtype_to_bit_depth(subtype: str) -> int:
    """Map soundfile subtype strings to nominal bit depth."""
    s = (subtype or "").upper()
    if "FLOAT" in s or s in {"FLOAT", "DOUBLE"}:
        return 32
    if "PCM_32" in s or s.endswith("32"):
        return 32
    if "PCM_24" in s or "24" in s:
        return 24
    if "PCM_16" in s or "16" in s:
        return 16
    if "PCM_S8" in s or "PCM_U8" in s or s.endswith("8"):
        return 8
    # Lossy-decoded through librosa often reports as FLOAT
    return 16


def extract_native_format(file_path: str) -> NativeFormat:
    """
    Read true container sample rate / subtype via soundfile (ignores extension).
    Falls back to librosa header probe if soundfile cannot open the path.
    """
    try:
        info = sf.info(file_path)
        bit_depth = _subtype_to_bit_depth(info.subtype)
        return NativeFormat(
            sample_rate=int(info.samplerate),
            bit_depth=bit_depth,
            subtype=str(info.subtype or "UNKNOWN"),
            channels=int(info.channels),
        )
    except Exception:
        # librosa can decode many formats soundfile cannot (e.g. some MP3/AAC)
        try:
            sr = int(librosa.get_samplerate(file_path))
        except Exception as exc:
            raise ValueError(f"Unable to read native audio format: {exc}") from exc
        return NativeFormat(
            sample_rate=sr,
            bit_depth=16,
            subtype="DECODED_PCM",
            channels=0,
        )


# ---------------------------------------------------------------------------
# Load / silence gating
# ---------------------------------------------------------------------------

def load_audio_pcm(file_path: str, duration: float = ANALYSIS_DURATION_SEC) -> tuple[np.ndarray, int]:
    """Decode to mono float PCM at native sample rate."""
    try:
        y, sr = librosa.load(file_path, sr=None, mono=True, duration=duration)
    except Exception as exc:
        raise ValueError(f"Failed to decode audio PCM: {exc}") from exc
    if y is None or len(y) == 0:
        raise ValueError("Audio file contains no decodable samples")
    # Guard against non-finite frames from corrupt packets
    if not np.isfinite(y).all():
        y = np.nan_to_num(y, nan=0.0, posinf=0.0, neginf=0.0)
    return y.astype(np.float32, copy=False), int(sr)


def _active_frame_mask(y: np.ndarray, hop_length: int = HOP_LENGTH) -> np.ndarray:
    """Boolean mask of non-silent frames (filters intro/outro digital silence)."""
    rms = librosa.feature.rms(y=y, frame_length=N_FFT, hop_length=hop_length)[0]
    if rms.size == 0:
        return np.zeros(0, dtype=bool)
    peak = float(np.max(rms))
    if peak <= 0:
        return np.zeros_like(rms, dtype=bool)
    return (rms > SILENCE_ABS_RMS) & (rms > SILENCE_REL_PEAK * peak)


# ---------------------------------------------------------------------------
# STFT / spectral features
# ---------------------------------------------------------------------------

def _safe_stft(y: np.ndarray) -> np.ndarray:
    try:
        return librosa.stft(y, n_fft=N_FFT, hop_length=HOP_LENGTH, window="hann")
    except Exception as exc:
        raise ValueError(f"STFT failed on decoded frames: {exc}") from exc


def _dynamic_noise_floor_db(
    magnitude_db: np.ndarray,
    frequencies: np.ndarray,
    active_frames: np.ndarray,
) -> float:
    """
    Dynamic noise floor from median energy in 1–5 kHz on active frames.
    Avoids fixed thresholds that fail on quiet acoustic material.
    """
    band = (frequencies >= BAND_NOISE_FLOOR_LO) & (frequencies <= BAND_NOISE_FLOOR_HI)
    if not np.any(band) or magnitude_db.size == 0:
        return -60.0

    if active_frames.size > 0 and np.any(active_frames):
        band_db = magnitude_db[band][:, active_frames]
    else:
        band_db = magnitude_db[band]

    if band_db.size == 0:
        return -60.0
    return float(np.median(band_db))


def _spectral_rolloffs_hz(
    y: np.ndarray,
    sr: int,
    active_frames: np.ndarray,
) -> dict[str, float]:
    """Energy roll-off at 85%, 95%, and 99% (active frames only)."""
    out: dict[str, float] = {}
    for pct, key in ((0.85, "rolloff_85_hz"), (0.95, "rolloff_95_hz"), (0.99, "rolloff_99_hz")):
        rolloffs = librosa.feature.spectral_rolloff(
            y=y, sr=sr, n_fft=N_FFT, hop_length=HOP_LENGTH, roll_percent=pct
        )[0]
        if active_frames.size > 0 and np.any(active_frames) and rolloffs.size == active_frames.size:
            vals = rolloffs[active_frames]
        else:
            vals = rolloffs
        out[key] = float(np.percentile(vals, 90)) if vals.size else 0.0
    return out


def _high_band_stats(
    power: np.ndarray,
    magnitude_db: np.ndarray,
    frequencies: np.ndarray,
    active_frames: np.ndarray,
    noise_floor_db: float,
) -> dict[str, float]:
    """
    Variance + entropy above 16 kHz.
    Genuine lossless/hi-res: continuous noisy/chaotic HF energy.
    Fake lossless: near-zero energy or periodic blocky grids → low entropy.
    """
    hf = frequencies >= BAND_HF_FLOOR
    if not np.any(hf):
        return {
            "spectral_entropy_high_band": 0.0,
            "spectral_variance_high_band": 0.0,
            "hf_energy_ratio": 0.0,
            "calculated_cutoff_hz": float(frequencies[-1]) if frequencies.size else 0.0,
            "max_active_frequency_hz": 0.0,
        }

    if active_frames.size > 0 and np.any(active_frames):
        hf_power = power[hf][:, active_frames]
        hf_db = magnitude_db[hf][:, active_frames]
    else:
        hf_power = power[hf]
        hf_db = magnitude_db[hf]

    total_power = float(np.sum(power[:, active_frames] if active_frames.size and np.any(active_frames) else power))
    hf_energy = float(np.sum(hf_power))
    hf_energy_ratio = (hf_energy / total_power) if total_power > 0 else 0.0

    # Flatten HF magnitudes for distribution stats
    flat = hf_power.ravel()
    flat = flat[np.isfinite(flat)]
    variance = float(np.var(flat)) if flat.size else 0.0

    # Shannon entropy of normalized HF energy distribution (bits, normalized 0–1)
    if flat.size and float(np.sum(flat)) > 0:
        p = flat / np.sum(flat)
        p = p[p > 0]
        entropy = float(-np.sum(p * np.log2(p)))
        max_entropy = math.log2(p.size) if p.size > 1 else 1.0
        entropy_norm = float(entropy / max_entropy) if max_entropy > 0 else 0.0
    else:
        entropy_norm = 0.0

    # Dynamic cutoff: highest bin whose peak (active) exceeds floor + margin
    margin_db = 8.0
    threshold = noise_floor_db - margin_db
    # Peak per frequency across active frames
    if active_frames.size > 0 and np.any(active_frames):
        peak_db = np.max(magnitude_db[:, active_frames], axis=1)
    else:
        peak_db = np.max(magnitude_db, axis=1)

    above = np.where(peak_db > threshold)[0]
    if above.size:
        max_active_hz = float(frequencies[above[-1]])
    else:
        max_active_hz = 0.0

    return {
        "spectral_entropy_high_band": round(entropy_norm, 6),
        "spectral_variance_high_band": float(variance),
        "hf_energy_ratio": float(hf_energy_ratio),
        "max_active_frequency_hz": max_active_hz,
        "noise_floor_db": noise_floor_db,
        "presence_threshold_db": threshold,
    }


# ---------------------------------------------------------------------------
# Classification / authenticity
# ---------------------------------------------------------------------------

def _is_lossy_brickwall(
    rolloff_85: float,
    rolloff_95: float,
    rolloff_99: float,
) -> bool:
    """
    Detect a hard lossy LPF / codec brickwall (~19.5–20.5 kHz).

    Relies on roll-off clustering, not max-bin spikes (MP3/AAC decoders often
    leave sparse junk near Nyquist that is not musical energy).
    """
    if not (BRICKWALL_LOSSY_LO - 400 <= rolloff_99 <= BRICKWALL_LOSSY_HI + 300):
        return False
    # Sharp wall: 95% and 99% land close together in the brickwall band
    spread = abs(rolloff_99 - rolloff_95)
    tight_wall = spread <= 1800 and rolloff_95 >= (BRICKWALL_LOSSY_LO - 800)
    # Strong mid/high content before the wall (not a soft fade from bass-only)
    strong_pre_wall = rolloff_85 >= 16000
    return tight_wall and strong_pre_wall


def _claims_hi_container(sample_rate: int, bit_depth: int) -> bool:
    return sample_rate >= 48000 or bit_depth >= 24


def classify_quality(
    *,
    sample_rate: int,
    bit_depth: int,
    rolloff_85: float,
    rolloff_95: float,
    rolloff_99: float,
    max_active_hz: float,
    spectral_entropy_high_band: float,
    hf_energy_ratio: float,
) -> tuple[QualityTier, float]:
    """
    Return (true_quality_tier, authenticity_score 0–100).

    Score is an absolute acoustic quality rating from PCM analysis (not
    within-tier confidence, not file-extension / codec tags).
    """
    brickwall = _is_lossy_brickwall(rolloff_85, rolloff_95, rolloff_99)
    # Ignore sparse spikes far above roll-off (STFT sidelobes / ultra-low
    # dynamic floors on tonal material can push max_active toward Nyquist).
    # Match _stable_cutoff_hz: only trust max_active within ~1.5 kHz of rolloff_99.
    sparse_above_rolloff = max_active_hz > rolloff_99 + 1500.0
    if brickwall or sparse_above_rolloff:
        effective_max = min(max_active_hz, rolloff_99 + 400.0) if max_active_hz > 0 else 0.0
        ceiling = float(rolloff_99)
    else:
        effective_max = max_active_hz
        ceiling = float(max(rolloff_99, effective_max))
    claims_hi = _claims_hi_container(sample_rate, bit_depth)
    low_hf_entropy = spectral_entropy_high_band < 0.35
    negligible_hf = hf_energy_ratio < 1e-5 or spectral_entropy_high_band < 0.15

    # --- Fake / upsampled: high container claims vs lossy-like ceiling ---
    cutoff_at_16k = ceiling < NORMAL_CEILING and effective_max < NORMAL_CEILING + 500
    cutoff_at_20k = brickwall or (
        BRICKWALL_LOSSY_LO <= ceiling <= BRICKWALL_LOSSY_HI and low_hf_entropy
    )

    if claims_hi and (cutoff_at_16k or (cutoff_at_20k and (low_hf_entropy or negligible_hf or brickwall))):
        if cutoff_at_16k:
            score = 12.0 + 8.0 * spectral_entropy_high_band
        else:
            score = 18.0 + 10.0 * spectral_entropy_high_band
        return "FAKE_LOSSLESS", round(min(score, 29.0), 1)

    if bit_depth >= 24 and sample_rate >= 44100 and cutoff_at_16k and negligible_hf:
        return "FAKE_LOSSLESS", round(10.0 + 15.0 * spectral_entropy_high_band, 1)

    # --- NORMAL: hard cap under 16 kHz (typical low/mid lossy) ---
    if ceiling < NORMAL_CEILING and effective_max < NORMAL_CEILING:
        # Absolute platform score (not 90–100 within-tier)
        score = 55.0 + 20.0 * min(1.0, ceiling / NORMAL_CEILING)
        return "NORMAL", round(min(score, 75.0), 1)

    # --- HIGH_LOSSY: classic ~19.5–20 kHz brickwall (e.g. 320 kbps MP3 / 256 AAC) ---
    if brickwall or (
        BRICKWALL_LOSSY_LO <= rolloff_99 <= BRICKWALL_LOSSY_HI
        and sample_rate <= 48000
        and bit_depth <= 16
        and not (rolloff_95 >= TRUE_LOSSLESS_FLOOR - 500)
    ):
        # Excellent lossy lands ~88–93 — never a perfect 100
        score = 86.0 + 7.0 * min(1.0, spectral_entropy_high_band)
        return "HIGH_LOSSY", round(min(score, 93.0), 1)

    # --- HI_RES Studio Master ---
    past_cd = effective_max > HI_RES_PAST_NYQUIST or rolloff_99 > HI_RES_PAST_NYQUIST
    organic_hf = spectral_entropy_high_band >= 0.40 and hf_energy_ratio > 1e-6
    organic_extension = (
        rolloff_95 >= 20000
        and rolloff_99 >= TRUE_LOSSLESS_FLOOR
        and (rolloff_99 - rolloff_95) >= 400  # gradual tail, not a hard wall
    )
    if sample_rate >= 48000 and bit_depth >= 24 and past_cd and organic_hf:
        score = 94.0 + 6.0 * min(1.0, spectral_entropy_high_band)
        return "HI_RES", round(min(score, 100.0), 1)

    # Hi-res container with full CD-band energy but no ultrasonics
    if claims_hi and not brickwall and organic_extension and organic_hf:
        score = 90.0 + 8.0 * spectral_entropy_high_band
        return "TRUE_LOSSLESS", round(min(score, 98.0), 1)

    # --- TRUE_LOSSLESS: organic energy into ~21.5–22.05 kHz (no brickwall) ---
    near_nyquist = (
        rolloff_99 >= TRUE_LOSSLESS_FLOOR
        and effective_max >= TRUE_LOSSLESS_FLOOR - 800
        and organic_extension
    )
    if (
        abs(sample_rate - 44100) <= 200
        and bit_depth >= 16
        and near_nyquist
        and spectral_entropy_high_band >= 0.30
        and not brickwall
    ):
        score = 92.0 + 8.0 * min(1.0, spectral_entropy_high_band)
        return "TRUE_LOSSLESS", round(min(score, 100.0), 1)

    if (
        sample_rate >= 44100
        and bit_depth >= 16
        and near_nyquist
        and organic_hf
        and not brickwall
    ):
        score = 91.0 + 8.0 * spectral_entropy_high_band
        return "TRUE_LOSSLESS", round(min(score, 100.0), 1)

    # Soft mid-band material without a clear brickwall signature
    if ceiling >= 17000:
        score = 72.0 + 18.0 * min(1.0, (ceiling - 17000) / 4000.0)
        return "HIGH_LOSSY", round(min(score, 90.0), 1)

    score = 55.0 + 20.0 * (ceiling / NORMAL_CEILING)
    return "NORMAL", round(min(score, 75.0), 1)


def _stable_cutoff_hz(rolloff_99: float, max_active_hz: float, brickwall: bool) -> float:
    """
    Acoustic frequency ceiling for scoring.

    Do not raise the cutoff toward Nyquist when only sparse decoder noise exists
    above a brickwall / roll-off.
    """
    if brickwall or max_active_hz <= 0:
        return float(rolloff_99)
    if max_active_hz <= rolloff_99 + 1500:
        return float(0.75 * rolloff_99 + 0.25 * max_active_hz)
    # Sparse energy far above roll-off — ignore it for cutoff
    return float(rolloff_99)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def analyze_pcm_features(
    y: np.ndarray,
    sr: int,
    native: NativeFormat,
) -> dict[str, Any]:
    """Run full feature extraction + classification on an in-memory PCM buffer."""
    if sr <= 0:
        raise ValueError("Invalid sample rate from decoder")

    active = _active_frame_mask(y)
    stft = _safe_stft(y)
    magnitude = np.abs(stft)
    power = magnitude ** 2
    magnitude_db = librosa.amplitude_to_db(magnitude, ref=np.max)
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)

    # Align active mask length to STFT frames
    n_frames = magnitude.shape[1]
    if active.size != n_frames:
        if active.size > n_frames:
            active = active[:n_frames]
        else:
            padded = np.zeros(n_frames, dtype=bool)
            padded[: active.size] = active
            active = padded

    noise_floor_db = _dynamic_noise_floor_db(magnitude_db, frequencies, active)
    rolloffs = _spectral_rolloffs_hz(y, sr, active)
    hf = _high_band_stats(power, magnitude_db, frequencies, active, noise_floor_db)

    brickwall = _is_lossy_brickwall(
        rolloffs["rolloff_85_hz"],
        rolloffs["rolloff_95_hz"],
        rolloffs["rolloff_99_hz"],
    )
    calculated_cutoff = _stable_cutoff_hz(
        rolloffs["rolloff_99_hz"],
        hf["max_active_frequency_hz"],
        brickwall,
    )

    tier, authenticity = classify_quality(
        sample_rate=native.sample_rate if native.sample_rate > 0 else sr,
        bit_depth=native.bit_depth,
        rolloff_85=rolloffs["rolloff_85_hz"],
        rolloff_95=rolloffs["rolloff_95_hz"],
        rolloff_99=rolloffs["rolloff_99_hz"],
        max_active_hz=hf["max_active_frequency_hz"],
        spectral_entropy_high_band=hf["spectral_entropy_high_band"],
        hf_energy_ratio=hf["hf_energy_ratio"],
    )

    # For scoring/reporting, clamp reported max to acoustic ceiling when brickwalled
    report_max = hf["max_active_frequency_hz"]
    if brickwall:
        report_max = min(report_max, calculated_cutoff + 500.0)

    return {
        "true_quality_tier": tier,
        "authenticity_score": float(authenticity),
        "native_sample_rate_khz": round((native.sample_rate or sr) / 1000.0, 3),
        "native_bit_depth": native.bit_depth,
        "native_subtype": native.subtype,
        "calculated_cutoff_hz": round(calculated_cutoff, 2),
        "spectral_entropy_high_band": hf["spectral_entropy_high_band"],
        "spectral_variance_high_band": hf["spectral_variance_high_band"],
        "rolloff_85_hz": round(rolloffs["rolloff_85_hz"], 2),
        "rolloff_95_hz": round(rolloffs["rolloff_95_hz"], 2),
        "rolloff_99_hz": round(rolloffs["rolloff_99_hz"], 2),
        "max_active_frequency_hz": round(report_max, 2),
        "hf_energy_ratio": hf["hf_energy_ratio"],
        "noise_floor_db": round(noise_floor_db, 2),
        "sample_rate_hz": native.sample_rate or sr,
        "lossy_brickwall_detected": brickwall,
        # Internals reused by legacy spectrogram path
        "_magnitude_db": magnitude_db,
        "_sr": sr,
    }


def analyze_file(file_path: str) -> dict[str, Any]:
    """
    Analyze an audio file and return a structured quality report.

    Ignores extensions; classification is based on decoded PCM + native format.
    """
    try:
        native = extract_native_format(file_path)
        y, sr = load_audio_pcm(file_path)
        # Prefer soundfile's reported rate; trust decoder if they diverge slightly
        if abs(sr - native.sample_rate) > 1 and native.sample_rate > 0:
            # Keep decoded rate for spectral math; report native from soundfile
            pass
        elif native.sample_rate <= 0:
            native = NativeFormat(sr, native.bit_depth, native.subtype, native.channels)

        features = analyze_pcm_features(y, sr, native)
        # Strip internal arrays from public payload
        public = {k: v for k, v in features.items() if not k.startswith("_")}
        return public
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Acoustic quality analysis failed: {exc}") from exc


def to_legacy_spectral(report: dict[str, Any]) -> dict[str, Any]:
    """
    Map acoustic-quality report → legacy analyze_audio_spectral keys so
    existing upload scoring / DB fields keep working unchanged.
    """
    cutoff = float(report.get("calculated_cutoff_hz") or report.get("rolloff_99_hz") or 0.0)
    max_freq = float(report.get("max_active_frequency_hz") or cutoff)
    is_fake = report.get("true_quality_tier") == "FAKE_LOSSLESS"

    # Preserve legacy heuristic as an additional OR so old behaviour is a subset
    if cutoff < 15500 and max_freq < 16000:
        is_fake = True

    return {
        "max_frequency": max_freq,
        "cutoff_frequency": cutoff,
        "high_frequency_energy": float(report.get("hf_energy_ratio") or 0.0),
        "is_fake_upscaled": bool(is_fake),
        "energy_ratio_above_18": float(report.get("hf_energy_ratio") or 0.0),
        # Acoustic results drive the published score (not codec tags)
        "true_quality_tier": report.get("true_quality_tier"),
        "authenticity_score": report.get("authenticity_score"),
        "spectral_entropy_high_band": report.get("spectral_entropy_high_band"),
        "rolloff_85_hz": report.get("rolloff_85_hz"),
        "rolloff_95_hz": report.get("rolloff_95_hz"),
        "rolloff_99_hz": report.get("rolloff_99_hz"),
        "lossy_brickwall_detected": report.get("lossy_brickwall_detected"),
    }


def is_fake_lossless_claim(
    sample_rate: int,
    bit_depth: int,
    cutoff_hz: float,
    max_frequency_hz: float,
    spectral_entropy_high_band: Optional[float] = None,
) -> bool:
    """
    Lightweight fake-claim check usable when only legacy spectral fields exist
    (e.g. API re-score from DB). Does not replace full analyze_file().
    """
    if cutoff_hz < 15500 and max_frequency_hz < 16000:
        return True

    claims_hi = sample_rate >= 48000 or bit_depth >= 24
    if not claims_hi:
        return False

    # Empty / low band under 16 kHz while claiming hi-res
    if cutoff_hz < NORMAL_CEILING and max_frequency_hz < NORMAL_CEILING + 500:
        return True

    # ~20 kHz brickwall in a hi-res container
    if BRICKWALL_LOSSY_LO <= cutoff_hz <= BRICKWALL_LOSSY_HI:
        if spectral_entropy_high_band is None or spectral_entropy_high_band < 0.40:
            return True

    return False
