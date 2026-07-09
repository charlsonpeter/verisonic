export class FrequencyBandCalculator {
  private fftSize: number;
  private sampleRate: number;
  private minDecibels: number;
  private maxDecibels: number;
  private barCount: number;
  private binRanges: Array<{ startBin: number; endBin: number; weighting: number }> = [];

  constructor(fftSize: number, sampleRate: number, minDecibels: number, maxDecibels: number, barCount: number) {
    this.fftSize = fftSize;
    this.sampleRate = sampleRate;
    this.minDecibels = minDecibels;
    this.maxDecibels = maxDecibels;
    this.barCount = barCount;
    this.precomputeBinRanges();
  }

  private precomputeBinRanges() {
    const binSize = this.sampleRate / this.fftSize;
    this.binRanges = [];

    // Frequency ranges from 20 Hz to 20,000 Hz logarithmically
    const fMin = 20;
    const fMax = 20000;
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);
    const logRange = logMax - logMin;

    for (let i = 0; i < this.barCount; i++) {
      const fStart = Math.pow(10, logMin + (i / this.barCount) * logRange);
      const fEnd = Math.pow(10, logMin + ((i + 1) / this.barCount) * logRange);

      const startBin = fStart / binSize;
      const endBin = fEnd / binSize;

      // Center frequency for psychoacoustic weighting
      const centerFreq = Math.sqrt(fStart * fEnd);
      let weighting = 1.0;
      if (centerFreq >= 20 && centerFreq < 80) {
        weighting = 1.15; // +15%
      } else if (centerFreq >= 80 && centerFreq < 250) {
        weighting = 1.10; // +10%
      } else if (centerFreq >= 250 && centerFreq < 2000) {
        weighting = 1.00; // Normal
      } else if (centerFreq >= 2000 && centerFreq < 8000) {
        weighting = 0.95; // -5%
      } else if (centerFreq >= 8000 && centerFreq <= 20000) {
        weighting = 0.85; // -15%
      }

      this.binRanges.push({ startBin, endBin, weighting });
    }
  }

  public calculateBands(floatData: Float32Array, outputArray: number[]) {
    const numBins = floatData.length;

    for (let i = 0; i < this.barCount; i++) {
      const range = this.binRanges[i];
      if (!range) continue;

      let { startBin, endBin, weighting } = range;

      // Limit to actual available bins
      startBin = Math.min(numBins - 1, startBin);
      endBin = Math.min(numBins, endBin);

      let totalPower = 0;
      let totalWeight = 0;

      const idxStart = Math.floor(startBin);
      const idxEnd = Math.ceil(endBin);

      for (let binIdx = idxStart; binIdx < idxEnd; binIdx++) {
        // Calculate weight of this bin in the range
        const overlapStart = Math.max(binIdx, startBin);
        const overlapEnd = Math.min(binIdx + 1, endBin);
        const weight = Math.max(0, overlapEnd - overlapStart);

        if (weight <= 0) continue;

        const db = floatData[binIdx];
        const clampedDb = isNaN(db) || db === -Infinity ? this.minDecibels : db;
        
        // Convert db to linear amplitude (power representation)
        const amp = Math.pow(10, Math.max(this.minDecibels, clampedDb) / 20);

        totalPower += (amp * amp) * weight;
        totalWeight += weight;
      }

      const rmsAmp = totalWeight > 0 ? Math.sqrt(totalPower / totalWeight) : 0;
      const bandDb = rmsAmp > 0 ? 20 * Math.log10(rmsAmp) : this.minDecibels;

      // Normalize using decibel values
      let normalized = (bandDb - this.minDecibels) / (this.maxDecibels - this.minDecibels);
      normalized = Math.max(0, Math.min(1, normalized)) * weighting;

      outputArray[i] = Math.max(0, Math.min(1, normalized));
    }
  }
}
