/** Format radio station frequency for display. */
export function formatBroadcastFrequency(
  band?: string | null,
  frequency?: string | null,
): string {
  const normalizedBand = (band || '').trim().toUpperCase();
  const normalizedFreq = (frequency || '').trim();
  if (normalizedBand && normalizedFreq) {
    const unit =
      normalizedBand === 'FM' || normalizedBand === 'SW' ? 'MHz' : 'kHz';
    return `${normalizedBand} ${normalizedFreq} ${unit}`;
  }
  return normalizedFreq;
}
