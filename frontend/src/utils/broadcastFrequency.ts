/** Frequency band options and validation for radio station profiles. */

export const FREQUENCY_BANDS = ['FM', 'AM', 'SW', 'LW'] as const;
export type FrequencyBand = (typeof FREQUENCY_BANDS)[number];

export const BAND_RANGES: Record<
  FrequencyBand,
  { min: number; max: number; unit: 'MHz' | 'kHz' }
> = {
  FM: { min: 87.5, max: 108.0, unit: 'MHz' },
  AM: { min: 531, max: 1700, unit: 'kHz' },
  SW: { min: 2.3, max: 26.1, unit: 'MHz' },
  LW: { min: 148.5, max: 283.5, unit: 'kHz' },
};

export function isFrequencyBand(value: string): value is FrequencyBand {
  return (FREQUENCY_BANDS as readonly string[]).includes(value);
}

/** Validate band + frequency. Empty pair is allowed (web-only). Returns error message or null. */
export function validateBroadcastFrequency(
  band: string,
  frequency: string,
): string | null {
  const normalizedBand = (band || '').trim().toUpperCase();
  const normalizedFreq = (frequency || '').trim();

  if (!normalizedBand && !normalizedFreq) return null;

  if (!normalizedBand) {
    return 'Select a frequency band (FM/AM/SW/LW) when entering a frequency.';
  }
  if (!isFrequencyBand(normalizedBand)) {
    return 'Invalid frequency band. Choose FM, AM, SW, or LW.';
  }
  if (!normalizedFreq) {
    return 'Enter a broadcast frequency for the selected band.';
  }

  const numeric = Number(normalizedFreq);
  if (!Number.isFinite(numeric)) {
    return 'Broadcast frequency must be a number (e.g. 98.3).';
  }

  const { min, max, unit } = BAND_RANGES[normalizedBand];
  if (numeric < min || numeric > max) {
    return `${normalizedBand} frequency must be between ${min} and ${max} ${unit}.`;
  }

  return null;
}

/** Display label: "FM 98.3 MHz", bare frequency for legacy rows, or fallback. */
export function formatBroadcastFrequency(
  band?: string | null,
  frequency?: string | null,
  fallback = 'Web Station',
): string {
  const normalizedBand = (band || '').trim().toUpperCase();
  const normalizedFreq = (frequency || '').trim();

  if (normalizedBand && isFrequencyBand(normalizedBand) && normalizedFreq) {
    const { unit } = BAND_RANGES[normalizedBand];
    return `${normalizedBand} ${normalizedFreq} ${unit}`;
  }
  if (normalizedFreq) return normalizedFreq;
  return fallback;
}

export function frequencyPlaceholder(band: string): string {
  const normalized = (band || '').trim().toUpperCase();
  if (isFrequencyBand(normalized)) {
    const { min, max, unit } = BAND_RANGES[normalized];
    return `${min}–${max} ${unit}`;
  }
  return 'Select band first';
}
