"""Validate radio broadcast frequency against FM/AM/SW/LW band ranges."""

from __future__ import annotations

from typing import Optional, Tuple

from fastapi import HTTPException

FREQUENCY_BANDS = ("FM", "AM", "SW", "LW")

# (min, max, unit) — numeric value the user enters for that band
BAND_RANGES = {
    "FM": (87.5, 108.0, "MHz"),
    "AM": (531.0, 1700.0, "kHz"),
    "SW": (2.3, 26.1, "MHz"),
    "LW": (148.5, 283.5, "kHz"),
}


def normalize_frequency_band(band: Optional[str]) -> Optional[str]:
    value = (band or "").strip().upper()
    if not value:
        return None
    if value not in FREQUENCY_BANDS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid frequency band. Allowed: {', '.join(FREQUENCY_BANDS)}.",
        )
    return value


def normalize_broadcast_frequency(frequency: Optional[str]) -> Optional[str]:
    value = (frequency or "").strip()
    return value or None


def validate_band_and_frequency(
    band: Optional[str],
    frequency: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Validate and normalize band + frequency together.
    Both may be empty (web-only station). If either is set, both must be set
    and the numeric frequency must fall within the band range.
    """
    normalized_band = normalize_frequency_band(band)
    normalized_freq = normalize_broadcast_frequency(frequency)

    if normalized_band is None and normalized_freq is None:
        return None, None

    if normalized_band is None:
        raise HTTPException(
            status_code=400,
            detail="Frequency band is required when a broadcast frequency is set.",
        )
    if normalized_freq is None:
        raise HTTPException(
            status_code=400,
            detail="Broadcast frequency is required when a frequency band is set.",
        )

    try:
        numeric = float(normalized_freq)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Broadcast frequency must be a number (e.g. 98.3).",
        )

    lo, hi, unit = BAND_RANGES[normalized_band]
    if numeric < lo or numeric > hi:
        raise HTTPException(
            status_code=400,
            detail=f"{normalized_band} frequency must be between {lo:g} and {hi:g} {unit}.",
        )

    # Store a clean numeric string (trim trailing zeros where sensible)
    if numeric == int(numeric):
        stored = str(int(numeric))
    else:
        stored = f"{numeric:g}"

    return normalized_band, stored
