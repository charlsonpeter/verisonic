import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  TrackType,
  type AddTrack,
} from 'react-native-track-player';

let setupPromise: Promise<void> | null = null;

export async function ensureTrackPlayer(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
      });
      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          stopForegroundGracePeriod: 5,
        },
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SeekTo,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.Stop,
        ],
        progressUpdateEventInterval: 1,
      });
    })().catch((err) => {
      setupPromise = null;
      throw err;
    });
  }
  await setupPromise;
}

function mediaTypeForUrl(url: string): TrackType | undefined {
  if (/\.m3u8(\?|$)/i.test(url)) return TrackType.HLS;
  if (/\.mpd(\?|$)/i.test(url)) return TrackType.Dash;
  return undefined;
}

export type LoadMediaOptions = {
  url: string;
  title: string;
  artist: string;
  artwork?: string;
  isLive?: boolean;
  shouldPlay?: boolean;
  startPositionMs?: number;
  rate?: number;
};

export async function loadMedia(opts: LoadMediaOptions): Promise<void> {
  await ensureTrackPlayer();
  const {
    url,
    title,
    artist,
    artwork,
    isLive = false,
    shouldPlay = true,
    startPositionMs = 0,
    rate = 1,
  } = opts;

  const track: AddTrack = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title,
    artist,
    artwork,
    isLiveStream: isLive,
  };
  const type = mediaTypeForUrl(url);
  if (type) track.type = type;

  await TrackPlayer.reset();
  await TrackPlayer.add(track);

  if (startPositionMs > 0 && !isLive) {
    await TrackPlayer.seekTo(startPositionMs / 1000).catch(() => undefined);
  }
  if (rate !== 1) {
    await TrackPlayer.setRate(rate).catch(() => undefined);
  }

  if (shouldPlay) await TrackPlayer.play();
  else await TrackPlayer.pause();
}

export async function unloadMedia(): Promise<void> {
  try {
    await ensureTrackPlayer();
    await TrackPlayer.reset();
  } catch {
    // ignore if player never started
  }
}
