import React from 'react';
import { Disc, MessageSquare, X } from 'lucide-react';
import { Track } from '../../context/AudioContext';
import { AppModal } from '../shared/AppModal';
import { CommentThread } from '../shared/CommentThread';

interface TrackInfoPanelProps {
  track: Track;
  open: boolean;
  onClose: () => void;
  /** `overlay` = mobile player sheet; `modal` = desktop dialog */
  presentation?: 'overlay' | 'modal';
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function buildTrackMetadata(track: Track): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];

  const add = (label: string, value?: string | number | null) => {
    if (value === null || value === undefined) return;
    const text = typeof value === 'string' ? value.trim() : String(value);
    if (!text) return;
    rows.push({ label, value: text });
  };

  add('Album', track.album_title);
  add('Album Artist', track.album_artist);
  add('Track #', track.track_number);
  add('Year', track.year);
  add('Composer', track.composer);
  add('Lyricist', track.lyricist);
  add('Language', track.language);
  add('Copyright', track.copyright);
  add('Comment', track.comment);

  if (track.duration && track.duration > 0) {
    rows.push({ label: 'Duration', value: formatDuration(track.duration) });
  }

  return rows;
}

function normalizeGenreTags(genres?: Array<string | { name?: string }> | null): string[] {
  if (!genres?.length) return [];
  return genres
    .map((g) => (typeof g === 'string' ? g : g?.name || ''))
    .map((g) => g.trim())
    .filter(Boolean);
}

export const TrackInfoPanel: React.FC<TrackInfoPanelProps> = ({
  track,
  open,
  onClose,
  presentation = 'overlay',
}) => {
  const metadataRows = buildTrackMetadata(track);
  const genreTags = normalizeGenreTags(track.genres);
  const isOverlay = presentation === 'overlay';

  if (!open) return null;

  const body = (
    <div className={`space-y-4 ${isOverlay ? 'pb-2' : 'p-6 max-h-[70vh] overflow-y-auto'}`}>
      <div className="space-y-2">
        <h4 className={`font-black text-white leading-tight ${isOverlay ? 'text-lg' : 'text-base truncate'}`}>
          {track.title}
        </h4>
        <p className={`text-slate-400 font-semibold ${isOverlay ? 'text-sm' : 'text-xs truncate'}`}>
          {track.artist_name}
        </p>
        {genreTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {genreTags.map((tag) => (
              <span
                key={tag}
                className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-3.5 sm:p-4 space-y-3">
        <h5 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
          <Disc className="w-3.5 h-3.5" /> Details
        </h5>
        {metadataRows.length > 0 ? (
          <dl className={`grid gap-x-4 gap-y-3 text-xs ${isOverlay ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {metadataRows.map(({ label, value }) => (
              <div key={label} className="space-y-0.5 min-w-0">
                <dt className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">{label}</dt>
                <dd className={`font-semibold text-slate-200 ${isOverlay ? 'text-sm break-words' : 'truncate'}`} title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-slate-500 italic">No additional track information available.</p>
        )}
      </section>

      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-3.5 sm:p-4 space-y-3">
        <h5 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" /> Comments
        </h5>
        <CommentThread trackId={track.id} compact />
      </section>
    </div>
  );

  if (presentation === 'modal') {
    return (
      <AppModal
        open={open}
        onClose={onClose}
        maxWidth="lg"
        header={<span className="text-sm font-extrabold text-white">Track Info</span>}
        bodyClassName="p-0 font-sans"
        panelClassName="max-h-[85vh] overflow-hidden"
      >
        {body}
      </AppModal>
    );
  }

  return (
    <div className="fixed inset-0 z-[1001] flex flex-col bg-slate-950 animate-slide-up md:hidden">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/10 flex-shrink-0">
        <h3 className="text-base font-extrabold text-white">Track Info</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 active:scale-95 transition outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40"
          aria-label="Close track info"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {body}
      </div>
    </div>
  );
};
