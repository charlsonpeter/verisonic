import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import { colors, fonts, radii } from '@/theme/tokens';
import { coverUri } from '@/utils/mediaUrl';

const TAB_BAR_HEIGHT = 58;

export function MiniPlayer() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const {
    mode,
    currentTrack,
    currentStation,
    isPlaying,
    positionMs,
    durationMs,
    togglePlay,
    playNext,
    playPrevious,
  } = usePlayer();

  const root = segments[0] as string | undefined;
  const hide =
    !token || root === '(auth)' || root === 'now-playing' || root === 'index' || root == null;
  if (hide) return null;

  const idle = mode === 'idle' || (!currentTrack && !currentStation);
  const title = idle
    ? 'Nothing playing'
    : currentTrack?.title || currentStation?.name || 'Now playing';
  const subtitle = idle
    ? 'Pick a track or station'
    : currentTrack?.artist_name_override ||
      currentTrack?.artist_name ||
      currentStation?.current_program_title ||
      'Radio';
  const cover = idle
    ? coverUri(undefined)
    : coverUri(currentTrack?.cover_art_url || currentStation?.cover_art_url);
  const progress =
    !idle && mode === 'track' && durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const isRadio = mode === 'radio';
  const aboveTabs = root === '(tabs)';
  const bottom = aboveTabs ? TAB_BAR_HEIGHT : Math.max(insets.bottom, 8);

  return (
    <View style={[styles.wrap, { bottom }]}>
      <Pressable
        onPress={() => {
          if (!idle) router.push('/now-playing');
        }}
        style={({ pressed }) => [styles.inner, pressed && !idle && { opacity: 0.95 }]}
      >
        <Image source={{ uri: cover }} style={styles.cover} />

        <View style={styles.meta}>
          <Text numberOfLines={1} style={[styles.title, idle && styles.titleIdle]}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
          <View style={styles.seekTrack}>
            <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              if (!idle) void playPrevious();
            }}
            disabled={idle || isRadio}
            hitSlop={10}
            style={{ opacity: idle || isRadio ? 0.25 : 1 }}
          >
            <Ionicons name="play-skip-back" size={16} color={colors.textMuted} />
          </Pressable>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              if (!idle) void togglePlay();
            }}
            disabled={idle}
            style={[styles.playBtn, idle && { opacity: 0.45 }]}
            hitSlop={8}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={16}
              color={colors.playIcon}
              style={!isPlaying ? { marginLeft: 1 } : undefined}
            />
          </Pressable>

          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              if (!idle) void playNext();
            }}
            disabled={idle || isRadio}
            hitSlop={10}
            style={{ opacity: idle || isRadio ? 0.25 : 1 }}
          >
            <Ionicons name="play-skip-forward" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: 10,
    paddingVertical: 8,
    zIndex: 50,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meta: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  titleIdle: {
    color: colors.textMuted,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
  },
  seekTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginTop: 2,
  },
  seekFill: {
    height: '100%',
    backgroundColor: colors.accentStrong,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 4,
    minWidth: 104,
    justifyContent: 'center',
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.playButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
