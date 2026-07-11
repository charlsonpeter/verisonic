"""Tests for the audio quality scoring pipeline (pure logic, no I/O)."""

from app.services.audio import calculate_quality_score


def _studio_metadata(**overrides):
    base = {
        "codec": "flac",
        "sample_rate": 48000,
        "bit_depth": 24,
        "bitrate": 1411200,
        "duration": 180.0,
        "channels": 2,
    }
    base.update(overrides)
    return base


def _studio_spectral(**overrides):
    base = {
        "max_frequency": 22000.0,
        "cutoff_frequency": 21000.0,
        "high_frequency_energy": 0.08,
        "is_fake_upscaled": False,
        "energy_ratio_above_18": 0.02,
    }
    base.update(overrides)
    return base


class TestCalculateQualityScore:
    def test_studio_quality_lossless_approved(self):
        result = calculate_quality_score(_studio_metadata(), _studio_spectral())

        assert result["quality_score"] >= 86
        assert result["quality_level"] == "Studio Quality"
        assert result["approved"] is True
        assert result["is_lossless"] is True
        assert result["rejection_reasons"] == []
        assert len(result["score_breakdown"]) == 4
        assert result["base_score"] == 100
        assert sum(item["points_achieved"] for item in result["score_breakdown"]) == result["quality_score"]
        assert result["quality_score"] == 100

    def test_low_sample_rate_rejected(self):
        result = calculate_quality_score(
            _studio_metadata(sample_rate=22050),
            _studio_spectral(),
        )

        assert result["approved"] is False
        assert any("Sample rate" in r for r in result["rejection_reasons"])
        assert result["quality_score"] < 86

    def test_low_cutoff_rejected(self):
        result = calculate_quality_score(
            _studio_metadata(),
            _studio_spectral(cutoff_frequency=15500.0, max_frequency=16000.0),
        )

        assert result["approved"] is False
        assert any("cutoff" in r.lower() for r in result["rejection_reasons"])

    def test_fake_upscale_rejected(self):
        result = calculate_quality_score(
            _studio_metadata(codec="mp3"),
            _studio_spectral(
                cutoff_frequency=15000.0,
                max_frequency=15500.0,
                is_fake_upscaled=True,
            ),
        )

        assert result["approved"] is False
        assert result["is_lossless"] is False
        assert any("Fake upscale" in r for r in result["rejection_reasons"])
        assert result["quality_score"] <= 50

    def test_score_bounded_0_to_100(self):
        result = calculate_quality_score(
            _studio_metadata(sample_rate=8000, bit_depth=8),
            _studio_spectral(
                cutoff_frequency=12000.0,
                is_fake_upscaled=True,
            ),
        )

        assert 0 <= result["quality_score"] <= 100
        assert result["quality_level"] == "Poor"

    def test_quality_level_tiers(self):
        good = calculate_quality_score(
            _studio_metadata(),
            _studio_spectral(cutoff_frequency=18000.0),
        )
        assert good["quality_level"] in ("Studio Quality", "Good")

        average_meta = _studio_metadata(sample_rate=44100, bit_depth=16)
        average = calculate_quality_score(
            average_meta,
            _studio_spectral(cutoff_frequency=16000.0, is_fake_upscaled=False),
        )
        assert average["quality_level"] in ("Average", "Good", "Poor")
