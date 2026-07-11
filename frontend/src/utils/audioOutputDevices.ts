export interface AudioOutputDeviceInfo {
  deviceId: string;
  label: string;
  type: string;
}

export const OUTPUT_DEVICE_STORAGE_KEY = 'audioOutputDeviceId';

function outputDeviceStorageKey(userId?: number | null): string {
  return userId ? `${OUTPUT_DEVICE_STORAGE_KEY}:${userId}` : OUTPUT_DEVICE_STORAGE_KEY;
}

export function supportsAudioOutputSelection(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
}

export function supportsSelectAudioOutput(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaDevices' in navigator &&
    typeof (navigator.mediaDevices as MediaDevices & { selectAudioOutput?: unknown }).selectAudioOutput === 'function'
  );
}

export function loadStoredOutputDeviceId(userId?: number | null): string | null {
  const stored = localStorage.getItem(outputDeviceStorageKey(userId));
  return stored ?? null;
}

export function saveStoredOutputDeviceId(deviceId: string, userId?: number | null): void {
  localStorage.setItem(outputDeviceStorageKey(userId), deviceId);
}

export function formatDeviceLabel(device: MediaDeviceInfo, index: number): string {
  if (device.label.trim()) return device.label;
  if (device.deviceId === 'default') return 'System Default';
  if (device.deviceId === 'communications') return 'Communications';
  return `Output ${index + 1}`;
}

export function inferDeviceType(label: string, deviceId: string): string {
  const normalized = label.toLowerCase();

  if (
    deviceId === 'default' ||
    normalized.includes('built-in') ||
    normalized.includes('internal') ||
    normalized.includes('speaker')
  ) {
    return 'Built-in Speakers';
  }
  if (
    normalized.includes('bluetooth') ||
    normalized.includes('airpods') ||
    normalized.includes('buds') ||
    normalized.includes('wireless')
  ) {
    return 'Bluetooth';
  }
  if (normalized.includes('hdmi') || normalized.includes('display') || normalized.includes('tv')) {
    return 'HDMI / Display';
  }
  if (normalized.includes('usb') || normalized.includes('dac') || normalized.includes('interface')) {
    return 'USB Audio';
  }
  if (normalized.includes('headphone') || normalized.includes('headset')) {
    return 'Headphones';
  }

  return 'Audio Output';
}

export async function enumerateAudioOutputDevices(): Promise<AudioOutputDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];

  const devices = await navigator.mediaDevices.enumerateDevices();

  return devices
    .filter((device) => device.kind === 'audiooutput')
    .map((device, index) => {
      const label = formatDeviceLabel(device, index);
      return {
        deviceId: device.deviceId,
        label,
        type: inferDeviceType(label, device.deviceId),
      };
    });
}

export async function applyAudioSinkId(
  audio: HTMLAudioElement,
  deviceId: string,
): Promise<boolean> {
  if (!supportsAudioOutputSelection()) return false;

  try {
    await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
    return true;
  } catch {
    return false;
  }
}

export function isOutputDeviceSelected(selectedId: string, deviceId: string): boolean {
  if (selectedId === deviceId) return true;
  if (!selectedId && deviceId === 'default') return true;
  return false;
}
