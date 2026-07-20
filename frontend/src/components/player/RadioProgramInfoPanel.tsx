import React from 'react';
import { MessageSquare, Radio, X } from 'lucide-react';
import { AppModal } from '../shared/AppModal';
import { CommentThread } from '../shared/CommentThread';
import { ParsedRadioProgram, formatProgramSchedule } from '../../utils/radioPrograms';

interface RadioProgramInfoPanelProps {
  stationName: string;
  program: ParsedRadioProgram;
  stationId: number;
  open: boolean;
  onClose: () => void;
  presentation?: 'overlay' | 'modal';
}

export const RadioProgramInfoPanel: React.FC<RadioProgramInfoPanelProps> = ({
  stationName,
  program,
  stationId,
  open,
  onClose,
  presentation = 'overlay',
}) => {
  const isOverlay = presentation === 'overlay';
  if (!open) return null;

  const body = (
    <div className={`space-y-4 ${isOverlay ? 'pb-2' : 'p-6 max-h-[70vh] overflow-y-auto'}`}>
      <div className="space-y-2">
        <h4 className={`font-black text-white leading-tight ${isOverlay ? 'text-lg' : 'text-base truncate'}`}>
          {program.title}
        </h4>
        <p className={`text-slate-400 font-semibold ${isOverlay ? 'text-sm' : 'text-xs truncate'}`}>
          {stationName}
        </p>
        {program.rj && (
          <p className="text-[10px] text-slate-500 font-semibold">Host: {program.rj}</p>
        )}
        <p className="text-[10px] text-slate-500">{formatProgramSchedule(program)}</p>
      </div>

      <section className="bg-white/[0.04] border border-white/10 rounded-2xl p-3.5 sm:p-4 space-y-3">
        <h5 className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1.5">
          <MessageSquare className="w-3.5 h-3.5" /> Comments
        </h5>
        <CommentThread
          radioProgram={{ stationId, programKey: program.id }}
          compact={isOverlay}
        />
      </section>
    </div>
  );

  if (isOverlay) {
    return (
      <div className="fixed inset-0 z-[1200] bg-slate-950 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
          <div className="flex items-center gap-2 min-w-0">
            <Radio className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span className="text-sm font-bold text-white truncate">Program Info</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white transition"
            aria-label="Close program info"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          {body}
        </div>
      </div>
    );
  }

  return (
    <AppModal
      open={open}
      onClose={onClose}
      maxWidth="2xl"
      header={<span className="text-sm font-extrabold text-white">Program Info</span>}
      bodyClassName="p-0 font-sans"
      panelClassName="max-h-[85vh] overflow-hidden"
    >
      {body}
    </AppModal>
  );
};
