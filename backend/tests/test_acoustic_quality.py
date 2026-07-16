"""Tests for acoustic quality tier classification (pure logic + synthetic PCM)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from app.services.acoustic_quality import (
    NativeFormat,
    analyze_file,
    analyze_pcm_features,
    classify_quality,
    is_fake_lossless_claim,
    to_legacy_spectral,
)
from app.services.audio import calculate_quality_score, build_score_breakdown


def test_classify_normal_under_16k():
    tier, score = classify_quality(
        sample_rate=44100,
        bit_depth=16,
        rolloff_85=12000,
        rolloff_95=14000,
        rolloff_99=15000,
        max_active_hz=15200,
        spectral_entropy_high_band=0.1,
        hf_energy_ratio=1e-8,
    )
    assert tier == "NORMAL"
    assert 55 <= score <= 75


def test_classify_high_lossy_brickwall():
    tier, score = classify_quality(
        sample_rate=44100,
        bit_depth=16,
        rolloff_85=18500,
        rolloff_95=19500,
        rolloff_99=20000,
        max_active_hz=20050,
        spectral_entropy_high_band=0.2,
        hf_energy_ratio=1e-6,
    )
    assert tier == "HIGH_LOSSY"
    assert 86 <= score <= 93


def test_classify_high_lossy_ignores_nyquist_decoder_junk():
    """MP3-like brickwall must not become TRUE_LOSSLESS via sparse 22.05 kHz spikes."""
    tier, score = classify_quality(
        sample_rate=44100,
        bit_depth=16,
        rolloff_85=18500,
        rolloff_95=19500,
        rolloff_99=19950,
        max_active_hz=22050,
        spectral_entropy_high_band=0.55,
        hf_energy_ratio=0.002,
    )
    assert tier == "HIGH_LOSSY"
    assert score <= 93
    assert score < 100


def test_authenticity_drives_published_score():
    result = calculate_quality_score(
        {
            "codec": "mp3",
            "sample_rate": 44100,
            "bit_depth": 16,
            "bitrate": 320000,
            "duration": 180.0,
            "channels": 2,
        },
        {
            "max_frequency": 20450.0,
            "cutoff_frequency": 19950.0,
            "high_frequency_energy": 0.01,
            "is_fake_upscaled": False,
            "energy_ratio_above_18": 0.005,
            "true_quality_tier": "HIGH_LOSSY",
            "authenticity_score": 91.0,
            "spectral_entropy_high_band": 0.4,
        },
    )
    assert result["quality_score"] == 91
    assert result["quality_level"] == "Good"
    assert result["is_lossless"] is False
    assert result["approved"] is True


def test_classify_true_lossless():
    tier, score = classify_quality(
        sample_rate=44100,
        bit_depth=16,
        rolloff_85=18000,
        rolloff_95=21000,
        rolloff_99=21800,
        max_active_hz=22000,
        spectral_entropy_high_band=0.55,
        hf_energy_ratio=0.002,
    )
    assert tier == "TRUE_LOSSLESS"
    assert score >= 90


def test_classify_hi_res():
    tier, score = classify_quality(
        sample_rate=96000,
        bit_depth=24,
        rolloff_85=20000,
        rolloff_95=24000,
        rolloff_99=28000,
        max_active_hz=30000,
        spectral_entropy_high_band=0.6,
        hf_energy_ratio=0.01,
    )
    assert tier == "HI_RES"
    assert score >= 92


def test_classify_fake_lossless_16k_in_hires_container():
    tier, score = classify_quality(
        sample_rate=96000,
        bit_depth=24,
        rolloff_85=12000,
        rolloff_95=14500,
        rolloff_99=15000,
        max_active_hz=15200,
        spectral_entropy_high_band=0.05,
        hf_energy_ratio=1e-9,
    )
    assert tier == "FAKE_LOSSLESS"
    assert score < 30


def test_classify_fake_lossless_20k_brickwall_in_hires():
    tier, score = classify_quality(
        sample_rate=96000,
        bit_depth=24,
        rolloff_85=18500,
        rolloff_95=19500,
        rolloff_99=20000,
        max_active_hz=20100,
        spectral_entropy_high_band=0.12,
        hf_energy_ratio=1e-7,
    )
    assert tier == "FAKE_LOSSLESS"
    assert score < 30


def test_legacy_spectral_mapping_preserves_keys():
    report = {
        "true_quality_tier": "FAKE_LOSSLESS",
        "authenticity_score": 18.0,
        "calculated_cutoff_hz": 15000.0,
        "max_active_frequency_hz": 15100.0,
        "hf_energy_ratio": 0.0,
        "spectral_entropy_high_band": 0.1,
        "rolloff_85_hz": 12000.0,
        "rolloff_95_hz": 14000.0,
        "rolloff_99_hz": 15000.0,
    }
    legacy = to_legacy_spectral(report)
    assert set(legacy.keys()) >= {
        "max_frequency",
        "cutoff_frequency",
        "high_frequency_energy",
        "is_fake_upscaled",
        "energy_ratio_above_18",
    }
    assert legacy["is_fake_upscaled"] is True
    assert legacy["cutoff_frequency"] == 15000.0


def test_db_rescore_without_entropy_keeps_legacy_fake_rule():
    """Stored reports lack entropy — must not suddenly flag 20 kHz / 24-bit as fake."""
    result = calculate_quality_score(
        {
            "codec": "flac",
            "sample_rate": 96000,
            "bit_depth": 24,
            "bitrate": 2000000,
            "duration": 120.0,
            "channels": 2,
        },
        {
            "max_frequency": 20100.0,
            "cutoff_frequency": 20000.0,
            "high_frequency_energy": 0.01,
            "is_fake_upscaled": None,
            "energy_ratio_above_18": 0.005,
        },
    )
    assert result["approved"] is True
    assert "Fake upscale" not in " ".join(result["rejection_reasons"])


def test_is_fake_lossless_claim_with_entropy():
    assert is_fake_lossless_claim(96000, 24, 20000.0, 20100.0, 0.2) is True
    assert is_fake_lossless_claim(44100, 16, 20000.0, 20100.0, 0.2) is False
    assert is_fake_lossless_claim(96000, 24, 21000.0, 22000.0, 0.55) is False


def test_existing_studio_score_still_100():
    breakdown, score = build_score_breakdown(
        {"sample_rate": 48000, "bit_depth": 24},
        {
            "cutoff_frequency": 21000.0,
            "max_frequency": 22000.0,
            "is_fake_upscaled": False,
        },
    )
    assert score == 100
    assert len(breakdown) == 4


def test_analyze_file_synthetic_noise_wav():
    """Full-band noise at 44.1/16 should not be FAKE_LOSSLESS."""
    sr = 44100
    rng = np.random.default_rng(42)
    y = (0.1 * rng.standard_normal(sr * 2)).astype(np.float32)
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "noise_44100.wav")
        sf.write(path, y, sr, subtype="PCM_16")
        report = analyze_file(path)

    assert "true_quality_tier" in report
    assert "authenticity_score" in report
    assert 0 <= report["authenticity_score"] <= 100
    assert report["native_sample_rate_khz"] == 44.1
    assert report["native_bit_depth"] == 16
    assert report["true_quality_tier"] != "FAKE_LOSSLESS"
    assert report["calculated_cutoff_hz"] > 16000


def test_analyze_file_detects_bandlimited_in_hires_container():
    """Band-limited content stored as 96 kHz / 24-bit should score FAKE_LOSSLESS."""
    sr = 96000
    duration = 2.0
    t = np.arange(int(sr * duration)) / sr
    # Content with no energy above ~15 kHz (sum of low tones)
    y = (
        0.2 * np.sin(2 * np.pi * 440 * t)
        + 0.15 * np.sin(2 * np.pi * 2000 * t)
        + 0.1 * np.sin(2 * np.pi * 8000 * t)
        + 0.05 * np.sin(2 * np.pi * 12000 * t)
    ).astype(np.float32)
    with tempfile.TemporaryDirectory() as tmp:
        path = str(Path(tmp) / "fake_hires.wav")
        sf.write(path, y, sr, subtype="PCM_24")
        report = analyze_file(path)

    assert report["native_sample_rate_khz"] == 96.0
    assert report["native_bit_depth"] == 24
    assert report["true_quality_tier"] == "FAKE_LOSSLESS"
    assert report["authenticity_score"] < 30


def test_analyze_pcm_features_returns_internals_for_spectrogram():
    sr = 44100
    y = (0.05 * np.random.default_rng(0).standard_normal(sr)).astype(np.float32)
    native = NativeFormat(sample_rate=sr, bit_depth=16, subtype="PCM_16", channels=1)
    features = analyze_pcm_features(y, sr, native)
    assert features["_magnitude_db"].ndim == 2
    assert features["_sr"] == sr
