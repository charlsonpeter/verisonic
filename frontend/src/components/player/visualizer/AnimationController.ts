export class AnimationController {
  private barCount: number;
  private currentLevels: number[];
  private peaks: number[];
  private peakHoldTimers: number[];
  private readonly peakHoldDurationFrames = 18; // ~300ms at 60fps

  constructor(barCount: number) {
    this.barCount = barCount;
    this.currentLevels = new Array(barCount).fill(0);
    this.peaks = new Array(barCount).fill(0);
    this.peakHoldTimers = new Array(barCount).fill(0);
  }

  public update(targetLevels: number[]) {
    // Check if barCount changed and resize arrays if necessary
    if (targetLevels.length !== this.barCount) {
      this.resize(targetLevels.length);
    }

    for (let i = 0; i < this.barCount; i++) {
      const target = targetLevels[i] ?? 0;
      let current = this.currentLevels[i] ?? 0;

      // Asymmetric smoothing: Fast Attack, Slow Release
      if (target > current) {
        current += (target - current) * 0.45;
      } else {
        current += (target - current) * 0.08;
      }
      this.currentLevels[i] = current;

      // Peak Hold and Slow Decay logic
      let peak = this.peaks[i] ?? 0;
      if (current > peak) {
        this.peaks[i] = current;
        this.peakHoldTimers[i] = this.peakHoldDurationFrames;
      } else {
        if (this.peakHoldTimers[i] > 0) {
          this.peakHoldTimers[i]--;
        } else {
          // Slow release peak decay
          this.peaks[i] = Math.max(0, peak - 0.012); // Replicates smooth floating drops
        }
      }
    }
  }

  public reset() {
    this.currentLevels.fill(0);
    this.peaks.fill(0);
    this.peakHoldTimers.fill(0);
  }

  public resize(newBarCount: number) {
    this.barCount = newBarCount;
    this.currentLevels = new Array(newBarCount).fill(0);
    this.peaks = new Array(newBarCount).fill(0);
    this.peakHoldTimers = new Array(newBarCount).fill(0);
  }

  public getCurrentLevels(): number[] {
    return this.currentLevels;
  }

  public getPeaks(): number[] {
    return this.peaks;
  }
}
