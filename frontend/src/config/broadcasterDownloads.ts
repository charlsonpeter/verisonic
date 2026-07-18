/** Broadcaster installer download URLs. Override via VITE_BROADCASTER_DOWNLOAD_BASE. */
const downloadBase =
  (import.meta.env.VITE_BROADCASTER_DOWNLOAD_BASE as string | undefined)?.replace(/\/$/, '') ||
  '/downloads/broadcaster';

export const BROADCASTER_INSTALLERS = {
  windows: `${downloadBase}/VeriSonic_Broadcaster_Setup.exe`,
  macos: `${downloadBase}/VeriSonic_Broadcaster.pkg`,
  linux: `${downloadBase}/verisonic-broadcaster_1.0.0_amd64.deb`,
} as const;

export type BroadcasterPlatform = keyof typeof BROADCASTER_INSTALLERS;

export function getBroadcasterInstallerUrl(platform: BroadcasterPlatform): string {
  return BROADCASTER_INSTALLERS[platform];
}

export function detectBroadcasterPlatform(): BroadcasterPlatform {
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes('linux')) return 'linux';
  if (ua.includes('mac')) return 'macos';
  return 'windows';
}

export function platformLabel(platform: BroadcasterPlatform): string {
  switch (platform) {
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
  }
}
