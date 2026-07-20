import React, { useRef, useEffect, useMemo, useState } from 'react';
import { X, Music } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { AppModal } from './AppModal';
import {
  isSynchronizedLyrics,
  lineIndexForTime,
  parseLyricsFromText,
} from '../../utils/lrc';

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, onClose }) => {
  const { currentTrack, subscribeTime, activeRadioStation, isPlaying } = useAudio();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  const parsedLines = useMemo(() => {
    if (!currentTrack?.lyrics || currentTrack.lyrics.trim() === '') return [];
    return parseLyricsFromText(currentTrack.lyrics);
  }, [currentTrack]);

  const isSynchronized = useMemo(() => isSynchronizedLyrics(parsedLines), [parsedLines]);

  useEffect(() => {
    if (!isOpen || !isSynchronized) {
      setActiveLineIndex(-1);
      return;
    }

    return subscribeTime((time) => {
      const next = lineIndexForTime(parsedLines, time);
      setActiveLineIndex((prev) => (prev === next ? prev : next));
    });
  }, [isOpen, isSynchronized, parsedLines, subscribeTime]);

  useEffect(() => {
    if (isSynchronized && activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLineIndex, isSynchronized]);

  if (activeRadioStation) {
    return (
      <AppModal
        open={isOpen}
        onClose={onClose}
        variant="fullscreen"
        overlayClassName="items-center justify-center p-4"
        hideHeaderSection
      >
        <div className="absolute top-1/4 left-1/4 w-[35rem] h-[35rem] bg-rose-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[35rem] h-[35rem] bg-pink-600/10 rounded-full blur-[130px] pointer-events-none animate-pulse" />

        <div className="relative max-w-xl w-full mx-auto bg-slate-900/60 border border-white/5 backdrop-blur-xl rounded-[2.5rem] p-8 md:p-12 shadow-2xl flex flex-col items-center justify-center text-center h-[50vh] z-10">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-6 right-6 p-2.5 text-slate-400 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition duration-305"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="relative mb-6">
            <div className="absolute inset-0 bg-rose-500/20 rounded-full blur-xl scale-125 animate-pulse" />
            <div className="relative bg-gradient-to-tr from-rose-600 to-pink-600 p-5 rounded-full shadow-lg flex items-center justify-center border border-white/10">
              <Music className="w-8 h-8 text-white animate-pulse" />
            </div>
          </div>

          <h3 className="text-2xl font-black text-white tracking-tight mb-3">Live Stream Mode</h3>
          <p className="text-slate-400 text-xs md:text-sm max-w-sm leading-relaxed">
            Real-time audio telemetry validation is active. Lyrics synchronization is unavailable for continuous live broadcast feeds.
          </p>
        </div>
      </AppModal>
    );
  }

  return (
    <AppModal
      open={isOpen}
      onClose={onClose}
      variant="fullscreen"
      overlayClassName="items-center justify-center p-6 md:p-12"
      hideHeaderSection
    >
      <div className="absolute top-1/4 left-1/4 w-[35rem] h-[35rem] bg-rose-600/10 rounded-full blur-[150px] pointer-events-none animate-blob-1" />
      <div className="absolute bottom-1/4 right-1/4 w-[35rem] h-[35rem] bg-pink-600/10 rounded-full blur-[150px] pointer-events-none animate-blob-2" />

      {currentTrack?.cover_art_url && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.08] scale-125 filter blur-[100px] pointer-events-none mix-blend-screen transition-all duration-1000"
          style={{ backgroundImage: `url(${currentTrack.cover_art_url})` }}
        />
      )}

      <button
        type="button"
        onClick={onClose}
        className="absolute top-8 right-8 p-3 text-slate-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 hover:scale-105 border border-white/5 transition-all duration-300 z-50 shadow-lg"
        title="Close Lyrics"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="max-w-6xl w-full mx-auto my-auto flex flex-col md:grid md:grid-cols-12 gap-6 md:gap-16 items-center z-10 h-full max-h-[85vh] overflow-hidden md:overflow-visible">
        <div className="w-full md:col-span-5 flex flex-col items-center md:items-start text-center md:text-left space-y-4 md:space-y-6">
          {currentTrack?.cover_art_url ? (
            <div className="relative group hidden md:block">
              <div className="absolute -inset-1 bg-gradient-to-r from-rose-500 to-pink-500 rounded-[2rem] blur-xl opacity-30 group-hover:opacity-45 transition duration-500" />
              <img
                src={currentTrack.cover_art_url}
                alt={currentTrack.title}
                className="relative w-60 h-60 md:w-80 md:h-80 rounded-[2rem] object-cover shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-white/10 transition duration-500 scale-100 group-hover:scale-[1.02]"
              />
            </div>
          ) : (
            <div className="w-60 h-60 md:w-80 md:h-80 rounded-[2rem] bg-slate-900 border border-white/5 items-center justify-center text-slate-500 shadow-2xl hidden md:flex">
              <Music className="w-16 h-16" />
            </div>
          )}

          <div className="space-y-1.5 md:space-y-2 max-w-sm">
            <h2 className="text-xl md:text-4xl font-black text-white tracking-tight leading-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-300">
              {currentTrack?.title}
            </h2>
            <p className="text-sm md:text-lg text-rose-400 font-bold uppercase tracking-wider">
              {currentTrack?.artist_name}
            </p>
          </div>

          {isPlaying && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-full text-[10px] text-rose-400 font-extrabold uppercase tracking-widest shadow-inner">
              <span className="w-1 h-3.5 bg-rose-500 rounded-full animate-bounce duration-[600ms]" style={{ animationDelay: '0.1s' }} />
              <span className="w-1 h-2 bg-rose-400 rounded-full animate-bounce duration-[600ms]" style={{ animationDelay: '0.3s' }} />
              <span className="w-1 h-4 bg-rose-500 rounded-full animate-bounce duration-[600ms]" style={{ animationDelay: '0.5s' }} />
              <span className="ml-1">Studio Synced</span>
            </div>
          )}
        </div>

        <div className="flex-1 w-full md:col-span-7 flex flex-col h-full overflow-hidden relative min-h-[45vh] md:min-h-0">
          <div className="absolute top-0 left-0 right-0 h-20 md:h-28 bg-gradient-to-b from-slate-950/95 via-slate-950/50 to-transparent pointer-events-none z-20" />
          <div className="absolute bottom-0 left-0 right-0 h-20 md:h-28 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-transparent pointer-events-none z-20" />

          <div
            ref={containerRef}
            className={`flex-1 overflow-y-auto px-4 space-y-12 scrollbar-hide scroll-smooth relative z-10 ${
              isSynchronized ? 'py-[35vh]' : 'py-6'
            }`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {parsedLines.length === 0 ? (
              <div className="text-center py-24 text-slate-500 text-sm font-semibold">
                No lyrics transcript found for this track.
              </div>
            ) : (
              parsedLines.map((line, idx) => {
                const isActive = isSynchronized && idx === activeLineIndex;

                return (
                  <div
                    key={idx}
                    ref={isActive ? activeLineRef : null}
                    className={`text-left transition-all duration-500 cursor-pointer ${
                      isActive
                        ? 'opacity-100 filter blur-0'
                        : isSynchronized
                          ? 'opacity-30 filter blur-[0.5px] hover:opacity-100 hover:blur-0'
                          : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    <p className={`text-base md:text-xl leading-relaxed max-w-xl transition-all duration-300 ${
                      isActive
                        ? 'text-rose-400 font-extrabold'
                        : isSynchronized
                          ? 'text-slate-400 font-bold'
                          : 'text-slate-200 font-bold'
                    }`}>
                      {line.text}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppModal>
  );
};
