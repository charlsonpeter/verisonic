export type BannerType = 'success' | 'error' | 'info';

export interface BannerPayload {
  id: number;
  type: BannerType;
  title: string;
  text?: string;
}

type BannerListener = (banner: BannerPayload | null) => void;

let listener: BannerListener | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let idCounter = 0;

export function subscribeBanner(fn: BannerListener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

export function dismissBanner() {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  listener?.(null);
}

export function showBanner(
  type: BannerType,
  title: string,
  text?: string,
  duration = 4000,
) {
  const payload: BannerPayload = {
    id: ++idCounter,
    type,
    title,
    text,
  };
  listener?.(payload);

  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    dismissTimer = null;
    listener?.(null);
  }, duration);
}
