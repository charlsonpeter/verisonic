export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get Canvas 2D context');
    }
    this.ctx = context;
  }

  public resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    
    // Set buffer sizes based on physical pixels
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    
    // Scale context back to match virtual layout size
    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  }

  public clear() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
  }

  public render(levels: number[], peaks: number[]) {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    this.clear();

    if (width === 0 || height === 0) return;

    const barCount = levels.length;
    const gap = 3; // Gap between bars
    
    // Calculate precise bar widths based on container width
    const totalGapWidth = gap * (barCount - 1);
    const barWidth = Math.max(1.5, (width - totalGapWidth) / barCount);
    
    // Center the visualizer on canvas
    const actualVisualizerWidth = barCount * barWidth + (barCount - 1) * gap;
    const startX = (width - actualVisualizerWidth) / 2;

    // Create vertical gradient
    const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
    gradient.addColorStop(0.0, '#3B82F6'); // Blue (bottom)
    gradient.addColorStop(0.5, '#8B5CF6'); // Purple (middle)
    gradient.addColorStop(1.0, '#EC4899'); // Pink (top)

    const minBarHeight = 3; // Keep a small dot when silent
    const maxBarHeight = height - 6; // Leave room for peak caps

    for (let i = 0; i < barCount; i++) {
      const lvl = levels[i] ?? 0;
      const peak = peaks[i] ?? 0;

      const barHeight = Math.max(minBarHeight, lvl * maxBarHeight);
      const x = startX + i * (barWidth + gap);
      const y = height - barHeight;

      // Draw Main Visualizer Bar
      this.ctx.beginPath();
      
      // Use roundRect (supported natively by ES2022 Canvas2D)
      // Radius matches the rounded pill design (fully rounded top caps)
      const radius = Math.min(barWidth / 2, 4);
      this.ctx.roundRect(x, y, barWidth, barHeight, [radius, radius, 0, 0]);
      
      this.ctx.fillStyle = gradient;
      
      // Add optional glow
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = 'rgba(139, 92, 246, 0.15)'; // Soft purple glow
      
      this.ctx.fill();
      
      // Draw Peak Hold Cap
      if (peak > 0) {
        const peakY = Math.max(0, height - (peak * maxBarHeight) - 3);
        
        this.ctx.beginPath();
        // Peak cap is a small horizontal segment
        this.ctx.roundRect(x, peakY, barWidth, 2, 1);
        
        // Color peak cap using the top pink gradient shade
        this.ctx.fillStyle = '#F472B6';
        
        // High fidelity peak glows
        this.ctx.shadowBlur = 6;
        this.ctx.shadowColor = 'rgba(236, 72, 153, 0.4)';
        
        this.ctx.fill();
      }
    }
    
    // Reset shadow parameters to avoid leaking to other draws
    this.ctx.shadowBlur = 0;
  }
}
