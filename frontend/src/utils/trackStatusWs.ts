export type TrackStatusWsUpdate = {
  track_id: number;
  status: string;
  quality_score: number | null;
  quality_level?: string | null;
  approved: boolean;
  has_hls?: boolean;
};

export type TrackStatusFields = {
  quality_score: number | null;
  approved: boolean;
  hls_playlist_path?: string | null;
};

export function getTrackStatusDetails(
  t: TrackStatusFields,
  readyDesc = 'Live on platform',
) {
  if (t.quality_score === null) {
    return {
      label: 'Analyzing',
      style: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
      desc: 'Running spectral checks...',
    };
  }
  if (t.approved && !t.hls_playlist_path) {
    return {
      label: 'Transcoding',
      style: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
      desc: 'Generating adaptive streaming files...',
    };
  }
  if (t.approved && t.hls_playlist_path) {
    return {
      label: 'Ready',
      style: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
      desc: readyDesc,
    };
  }
  return {
    label: 'Rejected',
    style: 'bg-rose-500/10 border-rose-500/20 text-rose-455',
    desc: 'Failed spectral cutoff checks',
  };
}

function qualityScoreButtonClass(score: number): string {
  if (score >= 86) return 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20';
  if (score >= 71) return 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20';
  return 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20';
}

function setTextIfChanged(el: Element, value: string) {
  if (el.textContent !== value) el.textContent = value;
}

/** Patch visible status cells without a React re-render. */
export function patchTrackStatusDom(
  updates: TrackStatusWsUpdate[],
  getHlsPath: (trackId: number) => string | null | undefined,
  readyDesc = 'Live on platform',
) {
  for (const update of updates) {
    const hlsPath =
      update.status === 'completed' || update.has_hls
        ? getHlsPath(update.track_id) || 'ready'
        : getHlsPath(update.track_id) ?? null;

    const details = getTrackStatusDetails(
      {
        quality_score: update.quality_score,
        approved: update.approved,
        hls_playlist_path: hlsPath,
      },
      readyDesc,
    );

    if (update.quality_score !== null) {
      document.querySelectorAll(`[data-track-quality-score="${update.track_id}"]`).forEach((el) => {
        setTextIfChanged(el, `${update.quality_score}%`);
        if (el instanceof HTMLElement) {
          el.className = `px-2 py-0.5 rounded text-[10px] font-extrabold transition hover:underline cursor-pointer ${qualityScoreButtonClass(update.quality_score as number)}`;
        }
      });
    }

    document.querySelectorAll(`[data-track-status-label="${update.track_id}"]`).forEach((el) => {
      setTextIfChanged(el, details.label);
      if (el instanceof HTMLElement) {
        el.className = `px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${details.style}`;
      }
    });

    document.querySelectorAll(`[data-track-status-desc="${update.track_id}"]`).forEach((el) => {
      setTextIfChanged(el, details.desc);
    });
  }
}

export function trackStatusUpdateNeedsRerender(
  update: TrackStatusWsUpdate,
  previous?: TrackStatusFields,
): boolean {
  if (!previous) return true;
  if (update.status === 'completed' || update.status === 'rejected' || update.status === 'failed') {
    return true;
  }
  const prevHls = !!previous.hls_playlist_path;
  const nextHls = update.has_hls || update.status === 'completed' || !!previous.hls_playlist_path;
  if (prevHls !== nextHls) return true;
  return false;
}

export function mergeTrackStatusUpdate<
  T extends TrackStatusFields & { id: number; hls_playlist_path?: string | null },
>(track: T, update: TrackStatusWsUpdate): T {
  const next: T = {
    ...track,
    quality_score: update.quality_score,
    approved: update.approved,
  };
  if (update.status === 'completed' || update.has_hls) {
    next.hls_playlist_path = track.hls_playlist_path || 'ready';
  }
  return next;
}

export function applyTrackStatusWsUpdates<
  T extends TrackStatusFields & { id: number; hls_playlist_path?: string | null },
>(
  prevTracks: T[],
  updates: TrackStatusWsUpdate[],
  options: {
    readyDesc?: string;
    onReload: () => void;
    onNewTracks: () => void;
  },
): { next: T[]; changed: boolean } {
  const hasNewTracks = updates.some(
    (u) => !prevTracks.some((t) => t.id === u.track_id),
  );
  if (hasNewTracks) {
    options.onNewTracks();
  }

  const hasTerminalUpdate = updates.some(
    (u) => u.status === 'completed' || u.status === 'rejected' || u.status === 'failed',
  );
  if (hasTerminalUpdate) {
    options.onReload();
  }

  patchTrackStatusDom(
    updates,
    (trackId) => prevTracks.find((t) => t.id === trackId)?.hls_playlist_path,
    options.readyDesc,
  );

  let changed = false;
  const next = prevTracks.map((track) => {
    const update = updates.find((u) => u.track_id === track.id);
    if (!update) return track;
    const merged = mergeTrackStatusUpdate(track, update);
    if (
      merged.quality_score !== track.quality_score ||
      merged.approved !== track.approved ||
      merged.hls_playlist_path !== track.hls_playlist_path
    ) {
      changed = true;
    }
    return merged;
  });

  const needsRerender = updates.some((update) => {
    const prev = prevTracks.find((t) => t.id === update.track_id);
    return trackStatusUpdateNeedsRerender(update, prev);
  });

  if (!hasNewTracks && !hasTerminalUpdate && !needsRerender) {
    return { next: prevTracks, changed: false };
  }

  return { next, changed: changed || needsRerender };
}
