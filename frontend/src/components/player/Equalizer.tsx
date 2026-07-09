import React, { useRef, useEffect } from 'react';
import { useAudio } from '../../context/AudioContext';
import { SpectrumAnalyzer } from './visualizer/SpectrumAnalyzer';

export const Equalizer: React.FC = () => {
  const { analyser } = useAudio();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyzerInstanceRef = useRef<SpectrumAnalyzer | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Clean up previous instance
    if (analyzerInstanceRef.current) {
      analyzerInstanceRef.current.destroy();
      analyzerInstanceRef.current = null;
    }

    // Instantiate new spectrum analyzer
    analyzerInstanceRef.current = new SpectrumAnalyzer(canvas, analyser);

    return () => {
      if (analyzerInstanceRef.current) {
        analyzerInstanceRef.current.destroy();
        analyzerInstanceRef.current = null;
      }
    };
  }, [analyser]);

  return (
    <div 
      className="h-10 w-28 md:w-36 overflow-hidden"
      title="Live Audio Spectrum Analyzer"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
