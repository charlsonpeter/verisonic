import React from 'react';
import { useAudio } from '../../context/AudioContext';

export const Equalizer: React.FC = () => {
  const { isPlaying, equalizerBars } = useAudio();

  return (
    <div 
      className="flex items-end gap-[3px] h-8 justify-center px-1"
      title="Live Audio Spectrum Analyzer (VU Meter)"
    >
      {equalizerBars.map((val, idx) => (
        <span 
          key={idx} 
          className={`w-[3px] rounded-full bg-gradient-to-t from-emerald-500 via-amber-400 to-rose-500 transition-all duration-75 ${
            isPlaying ? '' : 'h-[3px]'
          }`}
          style={{ 
            height: isPlaying ? `${Math.max(3, (val / 100) * 32)}px` : '3px',
          }}
        />
      ))}
    </div>
  );
};
