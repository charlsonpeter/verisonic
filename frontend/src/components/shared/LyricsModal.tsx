import React, { useRef, useEffect, useLayoutEffect, useMemo, useState, useCallback } from 'react';
import { X, Music, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { useAudio } from '../../context/AudioContext';
import { AppModal } from './AppModal';
import {
  isSynchronizedLyrics,
  lineIndexForTime,
  parseTrackLyrics,
} from '../../utils/lrc';

interface LyricsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatTime(time: number) {
  if (isNaN(time) || time === Infinity) return '0:00';
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

const LyricsPlayerWidget: React.FC = () => {
  const {
    isPlaying,
    duration,
    getCurrentTime,
    subscribeTime,
    togglePlay,
    seek,
    playNext,
    playPrevious,
    isRadioSync,
    activeRadioStation,
  } = useAudio();

  const isOffline = !!(
    activeRadioStation &&
    (activeRadioStation.is_online === false || activeRadioStation.is_active === false)
  );
  const seekMax = duration || 100;
  const seekMaxRef = useRef(seekMax);
  seekMaxRef.current = seekMax;

  const sliderRef = useRef<HTMLInputElement | null>(null);
  const elapsedRef = useRef<HTMLSpanElement | null>(null);
  const isSeekingRef = useRef(false);
  const seekDraftRef = useRef(0);
  const [isSeeking, setIsSeeking] = useState(false);

  const paintSeekUi = useCallback((time: number, opts?: { forceSlider?: boolean }) => {
    if (elapsedRef.current) elapsedRef.current.textContent = formatTime(time);
    if ((opts?.forceSlider || !isSeekingRef.current) && sliderRef.current) {
      sliderRef.current.max = String(seekMaxRef.current);
      sliderRef.current.value = String(time);
    }
  }, []);

  const finishSeek = useCallback(() => {
    if (!isSeekingRef.current || isRadioSync) return;
    isSeekingRef.current = false;
    setIsSeeking(false);
    seek(seekDraftRef.current);
  }, [isRadioSync, seek]);

  useEffect(() => {
    if (isRadioSync) return undefined;
    return subscribeTime((t) => {
      if (isSeekingRef.current) return;
      paintSeekUi(t);
    });
  }, [isRadioSync, subscribeTime, paintSeekUi]);

  useEffect(() => {
    if (!isSeeking) return;
    const onPointerUp = () => { finishSeek(); };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  }, [isSeeking, finishSeek]);

  useLayoutEffect(() => {
    paintSeekUi(getCurrentTime(), { forceSlider: true });
  }, [getCurrentTime, paintSeekUi, duration]);

  return (
    <div className="w-full max-w-sm md:mt-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md px-4 py-3.5">
      <div className="flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={playPrevious}
          disabled={isRadioSync}
          className="text-slate-400 hover:text-white transition disabled:opacity-30"
          title="Previous"
        >
          <SkipBack className="w-5 h-5 fill-current" />
        </button>

        <button
          type="button"
          onClick={togglePlay}
          disabled={isOffline}
          className="w-11 h-11 bg-white hover:bg-rose-50 disabled:opacity-30 disabled:pointer-events-none active:scale-95 rounded-full flex items-center justify-center text-slate-950 font-bold shadow-md hover:shadow-rose-500/10 transition-all duration-300"
          title={isOffline ? 'Station Offline' : isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current text-slate-950" />
          ) : (
            <Play className="w-5 h-5 fill-current text-slate-950 ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={playNext}
          disabled={isRadioSync}
          className="text-slate-400 hover:text-white transition disabled:opacity-30"
          title="Next"
        >
          <SkipForward className="w-5 h-5 fill-current" />
        </button>
      </div>

      <div className="flex items-center gap-1.5 text-slate-500 font-bold font-sans w-full min-w-0 mt-3">
        <span
          ref={elapsedRef}
          className="shrink-0 w-9 text-right tabular-nums text-[10px]"
        >
          0:00
        </span>
        <input
          ref={sliderRef}
          type="range"
          min="0"
          max={seekMax}
          defaultValue={0}
          disabled={isRadioSync}
          onPointerDown={() => {
            if (isRadioSync) return;
            isSeekingRef.current = true;
            setIsSeeking(true);
          }}
          onChange={(e) => {
            const value = parseFloat(e.target.value);
            seekDraftRef.current = value;
            paintSeekUi(value, { forceSlider: true });
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
              isSeekingRef.current = true;
              setIsSeeking(true);
            }
          }}
          onKeyUp={finishSeek}
          className="flex-1 min-w-0 accent-rose-500 h-1 bg-slate-800 rounded-lg outline-none cursor-pointer audio-knob disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <span className="shrink-0 w-9 text-left tabular-nums text-[10px]">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
};

export const LyricsModal: React.FC<LyricsModalProps> = ({ isOpen, onClose }) => {
  const { currentTrack, subscribeTime, activeRadioStation, isPlaying } = useAudio();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);

  const parsedLines = useMemo(() => {
    if (!currentTrack?.lyrics && !currentTrack?.lyrics_timed?.length) return [];
    return parseTrackLyrics(currentTrack);
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

      <div className="max-w-6xl w-full mx-auto my-auto flex flex-col md:grid md:grid-cols-12 gap-6 md:gap-16 items-center md:items-stretch z-10 h-full max-h-[85vh] overflow-hidden md:overflow-visible">
        <div className="w-full md:col-span-5 flex flex-col items-center md:items-start text-center md:text-left gap-4 md:gap-6 md:h-full">
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

          <LyricsPlayerWidget />
        </div>

        <div className="flex-1 w-full md:col-span-7 flex flex-col h-full overflow-hidden relative min-h-[45vh] md:min-h-0">
          <div className="absolute top-0 left-0 right-0 h-20 md:h-28 bg-gradient-to-b from-slate-950/95 via-slate-950/50 to-transparent pointer-events-none z-20" />
          <div className="absolute bottom-0 left-0 right-0 h-20 md:h-28 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-transparent pointer-events-none z-20" />

          <div
            ref={containerRef}
            className={`flex-1 overflow-y-auto px-4 flex flex-col gap-2 md:gap-2.5 scrollbar-hide scroll-smooth relative z-10 ${
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
                if (line.stanzaBreak) {
                  return (
                    <div key={`stanza-${idx}`} className="text-left" aria-hidden>
                      <p className="text-base md:text-xl leading-relaxed max-w-xl font-bold">&nbsp;</p>
                    </div>
                  );
                }
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
