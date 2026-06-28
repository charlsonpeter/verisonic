import React from 'react';
import { useAudio } from '../../context/AudioContext';

export const Equalizer: React.FC = () => {
  const { isPlaying, equalizerBars } = useAudio();

  return (
    <div className="flex items-end gap-0.5 h-6 w-12 justify-center px-2">
      {equalizerBars.map((val, idx) => (
        <span 
          key={idx} 
          className={`w-1 rounded-full bg-gradient-to-t from-rose-600 via-rose-400 to-pink-400 transition-all duration-100 ${
            isPlaying ? '' : 'h-1'
          }`}
          style={{ 
            height: isPlaying ? `${val}px` : '3px',
          }}
        />
      ))}
    </div>
  );
};
