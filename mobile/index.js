import TrackPlayer from 'react-native-track-player';

TrackPlayer.registerPlaybackService(() =>
  require('./src/services/playbackService').playbackService,
);

require('expo-router/entry');
