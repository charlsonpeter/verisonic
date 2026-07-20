import type { RadioStation } from '../context/AudioContext';

/** Fields that affect layout/cards — not live "now playing" text. */
export function stationsNeedRerender(prev: RadioStation[], next: RadioStation[]): boolean {
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (!b || a.id !== b.id) return true;
    if (a.is_online !== b.is_online) return true;
    if (a.is_active !== b.is_active) return true;
    if (a.stream_url !== b.stream_url) return true;
    if (a.name !== b.name) return true;
    if (a.description !== b.description) return true;
    if (a.cover_art_url !== b.cover_art_url) return true;
    if (a.broadcast_frequency !== b.broadcast_frequency) return true;
    if (a.city !== b.city) return true;
    if (a.country !== b.country) return true;
  }
  return false;
}

function setTextIfChanged(selector: string, value: string) {
  document.querySelectorAll(selector).forEach((el) => {
    if (el.textContent !== value) {
      el.textContent = value;
    }
  });
}

/** Update live metadata in place — avoids React re-render on poll ticks. */
export function patchRadioNowPlayingDom(stations: RadioStation[]) {
  for (const st of stations) {
    const title = st.current_track_title || 'Live Program';
    const artist = st.current_track_artist
      ? `By ${st.current_track_artist}`
      : 'By Broadcaster';
    const program = st.current_program_title || 'N/A (Default Broadcast)';
    const rj = st.rj_name ? `RJ ${st.rj_name}` : '';

    setTextIfChanged(`[data-radio-now-title="${st.id}"]`, title);
    setTextIfChanged(`[data-radio-now-artist="${st.id}"]`, artist);
    setTextIfChanged(`[data-radio-program-title="${st.id}"]`, program);
    if (rj) {
      setTextIfChanged(`[data-radio-rj-name="${st.id}"]`, rj);
    }
  }
}

export function patchPlayerRadioDom(
  stationId: number,
  info: { title: string; subtitle: string },
) {
  setTextIfChanged(`[data-player-radio-title="${stationId}"]`, info.title);
  setTextIfChanged(`[data-player-radio-subtitle="${stationId}"]`, info.subtitle);
}
