import TrackPlayer, { Event } from 'react-native-track-player';
import { playbackRemote } from './playbackRemote';

/** Runs in the Android/iOS media foreground service headless JS context. */
export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    void TrackPlayer.play();
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => {
    void TrackPlayer.pause();
  });
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    void TrackPlayer.stop();
    playbackRemote.emit('stop');
  });
  TrackPlayer.addEventListener(Event.RemoteSeek, (e) => {
    void TrackPlayer.seekTo(e.position);
  });
  TrackPlayer.addEventListener(Event.RemoteNext, () => {
    playbackRemote.emit('next');
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, () => {
    playbackRemote.emit('previous');
  });
}
