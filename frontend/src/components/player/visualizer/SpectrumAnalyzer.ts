import { FrequencyBandCalculator } from './FrequencyBandCalculator';
import { AnimationController } from './AnimationController';
import { Renderer } from './Renderer';

export class SpectrumAnalyzer {
  private canvas: HTMLCanvasElement;
  private analyser: AnalyserNode | null;
  private calculator!: FrequencyBandCalculator;
  private animator!: AnimationController;
  private renderer: Renderer;
  
  private barCount: number = 80;
  private floatDataArray: Float32Array;
  private rawBandsArray: number[];
  
  private animationFrameId: number | null = null;
  private isDestroyed: boolean = false;
  private sampleRate: number = 44100;

  constructor(canvas: HTMLCanvasElement, analyser: AnalyserNode | null) {
    this.canvas = canvas;
    this.analyser = analyser;
    
    // Determine sample rate
    if (analyser && analyser.context) {
      this.sampleRate = analyser.context.sampleRate;
    }
    
    // Determine initial bar count and set up components
    const rect = canvas.getBoundingClientRect();
    this.barCount = this.getBarCountForWidth(rect.width);
    
    this.renderer = new Renderer(canvas);
    this.renderer.resize();
    
    this.initProcessor();
    
    // Set up buffers
    const bufferLength = analyser ? analyser.frequencyBinCount : 1024;
    this.floatDataArray = new Float32Array(bufferLength);
    this.rawBandsArray = new Array(this.barCount).fill(0);
    
    // Listen for resize events
    window.addEventListener('resize', this.handleResize);
    
    // Start animation frame loop
    this.tick(0);
  }

  private initProcessor() {
    this.calculator = new FrequencyBandCalculator(
      this.analyser ? this.analyser.fftSize : 4096,
      this.sampleRate,
      this.analyser ? this.analyser.minDecibels : -95,
      this.analyser ? this.analyser.maxDecibels : -15,
      this.barCount
    );
    this.animator = new AnimationController(this.barCount);
  }

  private getBarCountForWidth(width: number): number {
    if (width >= 1024) return 80;
    if (width >= 768) return 64;
    return 40;
  }

  private handleResize = () => {
    if (this.isDestroyed) return;
    
    const rect = this.canvas.getBoundingClientRect();
    const newBarCount = this.getBarCountForWidth(rect.width);
    
    this.renderer.resize();
    
    if (newBarCount !== this.barCount) {
      this.barCount = newBarCount;
      this.rawBandsArray = new Array(this.barCount).fill(0);
      this.initProcessor();
    }
  };

  private tick = (timestamp: number) => {
    if (this.isDestroyed) return;

    if (this.analyser) {
      try {
        // Fetch float frequency data directly in decibels
        this.analyser.getFloatFrequencyData(this.floatDataArray);
        this.calculator.calculateBands(this.floatDataArray, this.rawBandsArray);
      } catch (e) {
        // Fallback to mock data if Analyser throws due to connection issues or CORS
        this.generateMockBands(timestamp);
      }
    } else {
      // Bypasses visualizer to draw silence or mock standby movements
      this.generateMockBands(timestamp);
    }

    this.animator.update(this.rawBandsArray);
    this.renderer.render(this.animator.getCurrentLevels(), this.animator.getPeaks());

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private generateMockBands(timestamp: number) {
    // If playing, generate smooth wave movements, else drop to zero
    const hasAudio = this.analyser && this.analyser.context && this.analyser.context.state === 'running';
    
    for (let i = 0; i < this.barCount; i++) {
      if (hasAudio) {
        // Generates beautiful smooth sine-wave-like mock movements
        const slowSin = Math.sin(timestamp * 0.002 + i * 0.15);
        const fastSin = Math.sin(timestamp * 0.008 + i * 0.4);
        const noise = Math.random() * 0.15;
        const value = Math.max(0.05, 0.4 * slowSin + 0.2 * fastSin + 0.3 + noise);
        
        this.rawBandsArray[i] = Math.min(1.0, value);
      } else {
        this.rawBandsArray[i] = 0; // Return to zero silently
      }
    }
  }

  public destroy() {
    this.isDestroyed = true;
    window.removeEventListener('resize', this.handleResize);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.renderer.clear();
  }
}
