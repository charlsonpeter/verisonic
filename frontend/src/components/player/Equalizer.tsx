import React, { useRef, useEffect, useState } from 'react';
import { useAudio } from '../../context/AudioContext';

export const Equalizer: React.FC = () => {
  const { isPlaying, equalizerBars } = useAudio();
  const numBands = equalizerBars.length;
  const numSegments = 12;

  // Refs for tracking peak levels and decay timers (similar to JetAudio/PyQt style)
  const peaksRef = useRef<number[]>(new Array(numBands).fill(0));
  const decayTimersRef = useRef<number[]>(new Array(numBands).fill(0));
  const [renderedPeaks, setRenderedPeaks] = useState<number[]>(new Array(numBands).fill(0));

  useEffect(() => {
    if (!isPlaying) {
      peaksRef.current = new Array(numBands).fill(0);
      decayTimersRef.current = new Array(numBands).fill(0);
      setRenderedPeaks(new Array(numBands).fill(0));
      return;
    }

    const peaks = [...peaksRef.current];
    const decayTimers = [...decayTimersRef.current];

    for (let i = 0; i < numBands; i++) {
      const lvl = equalizerBars[i] ?? 0;
      if (lvl > peaks[i]) {
        peaks[i] = lvl;
        decayTimers[i] = 15; // Peak hold frames (approx 250ms at 60fps)
      } else {
        if (decayTimers[i] > 0) {
          decayTimers[i]--;
        } else {
          peaks[i] = Math.max(0, peaks[i] - 2.0); // Slow decay
        }
      }
    }

    peaksRef.current = peaks;
    decayTimersRef.current = decayTimers;
    setRenderedPeaks(peaks);
  }, [equalizerBars, isPlaying, numBands]);

  return (
    <div 
      className="flex items-end justify-between gap-[2px] h-10 w-44 bg-slate-950/90 border border-white/5 rounded-xl p-1.5 shadow-inner"
      title="Live Audio Spectrum Analyzer (VU Meter)"
    >
      {equalizerBars.map((lvl, colIdx) => {
        const peak = renderedPeaks[colIdx] ?? 0;
        return (
          <div key={colIdx} className="flex flex-col-reverse justify-between h-full flex-1 gap-[1px]">
            {Array.from({ length: numSegments }).map((_, segIdx) => {
              const segThreshold = (segIdx / numSegments) * 100;
              const isActive = lvl >= segThreshold;
              const isPeak = (peak >= segThreshold) && (peak < segThreshold + (100 / numSegments));

              // Colors matching the PyQt Broadcaster app: Bottom 8 green, next 2 yellow, top 2 red
              let colorClass = "bg-emerald-500";
              let shadowClass = "shadow-[0_0_4px_rgba(16,185,129,0.35)]";
              
              if (segIdx >= 10) {
                colorClass = "bg-rose-500";
                shadowClass = "shadow-[0_0_4px_rgba(239,68,68,0.35)]";
              } else if (segIdx >= 8) {
                colorClass = "bg-amber-500";
                shadowClass = "shadow-[0_0_4px_rgba(245,158,11,0.35)]";
              }

              let opacityClass = "opacity-10"; // Dim background segment (matches alpha 25 out of 255)
              
              if (isActive) {
                opacityClass = `opacity-100 ${shadowClass}`;
              } else if (isPeak) {
                opacityClass = "opacity-80"; // Peak block (matches alpha 200 out of 255)
              }

              return (
                <div 
                  key={segIdx} 
                  className={`w-full flex-1 rounded-[1px] transition-all duration-75 ${colorClass} ${opacityClass}`}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
};
