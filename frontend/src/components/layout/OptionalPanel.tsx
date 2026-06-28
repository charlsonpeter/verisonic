import React, { useState } from 'react';
import { ListMusic, X, Trash2, Play, Music, GripVertical } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';

interface OptionalPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OptionalPanel: React.FC<OptionalPanelProps> = ({ isOpen, onClose }) => {
  const { 
    playQueue, 
    currentQueueIndex, 
    playTrack, 
    removeFromQueue, 
    clearQueue, 
    currentTrack,
    reorderQueue,
    isPlaying
  } = useAudio();
  
  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  if (!isOpen) return null;

  // Helper to compile playing and upcoming items into a single list
  const getQueueItems = () => {
    const items = playQueue.map((track, idx) => ({
      ...track,
      isCurrent: idx === currentQueueIndex,
      queueIndex: idx
    }));
    
    if (currentTrack && currentQueueIndex === -1) {
      return [{ ...currentTrack, isCurrent: true, queueIndex: -1 }, ...items];
    }
    
    return items;
  };

  const itemsToShow = getQueueItems();

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, queueIndex: number) => {
    setDraggedIndex(queueIndex);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent, index: number) => {
    if (draggedIndex !== null && itemsToShow[index].queueIndex !== draggedIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetQueueIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (draggedIndex === null || targetQueueIndex === -1 || draggedIndex === targetQueueIndex) return;
    
    reorderQueue(draggedIndex, targetQueueIndex);
    setDraggedIndex(null);
  };

  return (
    <aside className="w-full sm:w-80 glass-card border-l border-white/5 flex flex-col z-20 h-[calc(100vh-73px)] fixed right-0 top-[73px] pt-4 pb-28 shadow-2xl">
      {/* Header */}
      <div className="px-4 flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-rose-500" />
          <span className="text-xs font-bold text-white uppercase tracking-wider">Play Queue</span>
        </div>
        <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content Container */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Tracks: {itemsToShow.length}
            </span>
            {playQueue.length > 0 && (
              <button
                onClick={clearQueue}
                className="flex items-center gap-1 text-[10px] text-rose-400 font-semibold hover:text-rose-300 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Queue
              </button>
            )}
          </div>

          {itemsToShow.length === 0 ? (
            <div className="text-center py-12 text-slate-550 text-xs">
              <Music className="w-8 h-8 mx-auto mb-2 text-slate-600 animate-pulse" />
              No tracks loaded
            </div>
          ) : (
            <div className="space-y-2">
              {itemsToShow.map((track, idx) => {
                const isCurrent = track.isCurrent;
                const isDraggable = track.queueIndex !== -1;
                const isOver = idx === dragOverIndex;

                return (
                  <div
                    key={track.queueIndex === -1 ? `current-${track.id}` : `${track.id}-${track.queueIndex}`}
                    draggable={isDraggable}
                    onDragStart={(e) => handleDragStart(e, track.queueIndex)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnter={(e) => handleDragEnter(e, idx)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, track.queueIndex)}
                    className={`flex items-center justify-between p-2 rounded-xl border transition-all duration-200 ${
                      isCurrent 
                        ? 'bg-rose-600/10 border-rose-500/30' 
                        : 'bg-slate-900/30 border-white/3 hover:border-slate-800'
                    } ${isOver ? 'border-t-2 border-rose-500 bg-rose-950/10' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Cover Icon Box */}
                      <div className="relative w-10 h-10 bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center text-slate-400 flex-shrink-0 shadow border border-white/5">
                        {track.cover_art_url ? (
                          <img src={track.cover_art_url} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                          <Music className="w-4 h-4" />
                        )}

                        {/* Playing Visualizer Animation Overlay */}
                        {isCurrent && (
                          <div className="absolute inset-0 bg-slate-950/70 flex items-end justify-center gap-0.5 pb-2">
                            {isPlaying ? (
                              <>
                                <span className="w-0.5 bg-rose-500 rounded-full mini-wave-bar" />
                                <span className="w-0.5 bg-rose-400 rounded-full mini-wave-bar" />
                                <span className="w-0.5 bg-rose-500 rounded-full mini-wave-bar" />
                              </>
                            ) : (
                              <Play className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Track details */}
                      <div className="min-w-0 flex-1">
                        <h4 className={`text-xs font-bold truncate ${isCurrent ? 'text-rose-400' : 'text-slate-200'}`}>
                          {track.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 truncate">{track.artist_name}</p>
                      </div>
                    </div>

                    {/* Actions on the right side */}
                    {isDraggable && (
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => removeFromQueue(track.id)}
                          className="text-slate-500 hover:text-rose-400 p-1.5 transition flex-shrink-0"
                          title="Remove from Queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div 
                          className="text-slate-500 hover:text-slate-300 cursor-grab active:cursor-grabbing p-1.5 transition flex-shrink-0"
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
