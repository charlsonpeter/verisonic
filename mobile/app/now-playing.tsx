import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DownloadButton } from '@/components/DownloadButton';
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton';
import { confirm } from '@/components/ConfirmDialog';
import { TrackFileInfoSheet } from '@/components/TrackFileInfoSheet';
import {
  TrackOverflowMenu,
  TrackOverflowTrigger,
  openTrackMenuFromView,
  type TrackMenuAnchor,
  type TrackMenuTarget,
} from '@/components/TrackOverflowMenu';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import type { Track } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import { formatDuration } from '@/utils/accountTier';
import { coverUri } from '@/utils/mediaUrl';
import {
  isSynchronizedLyrics,
  lineIndexForTime,
  parseLyricsFromText,
  trackHasLyrics,
} from '@/utils/lrc';

const COVER = Math.min(Dimensions.get('window').width - 64, 280);

export default function NowPlayingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { canPlayFull } = useAuth();
  const {
    mode,
    currentTrack,
    currentStation,
    queue,
    isPlaying,
    positionMs,
    durationMs,
    isShuffle,
    repeatMode,
    playbackSpeed,
    favoriteIds,
    reactions,
    togglePlay,
    playNext,
    playPrevious,
    seekTo,
    playTrack,
    toggleShuffle,
    cycleRepeat,
    bumpSpeed,
    resetSpeed,
    toggleFavorite,
    toggleReaction,
    clearQueue,
    removeFromQueueAt,
    reorderQueue,
  } = usePlayer();

  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [menuTarget, setMenuTarget] = useState<TrackMenuTarget | null>(null);
  const [playlistPicker, setPlaylistPicker] = useState<{
    track: Track;
    anchor: TrackMenuAnchor;
  } | null>(null);
  const [infoTrack, setInfoTrack] = useState<Track | null>(null);
  const lyricsListRef = useRef<ScrollView>(null);
  const lineYRef = useRef<Record<number, number>>({});

  const closeList = () => {
    setMenuTarget(null);
    setListOpen(false);
  };

  const confirmClearQueue = () => {
    void (async () => {
      const ok = await confirm({
        title: 'Clear queue',
        message: 'Remove all tracks from the Now Playing list?',
        confirmLabel: 'Clear',
        destructive: true,
      });
      if (ok) clearQueue();
    })();
  };

  const confirmRemoveFromList = (track: Track, index: number) => {
    void (async () => {
      const ok = await confirm({
        title: 'Remove from list',
        message: `Remove "${track.title}" from Now Playing?`,
        confirmLabel: 'Remove',
        destructive: true,
      });
      if (ok) removeFromQueueAt(index);
    })();
  };

  const isRadio = mode === 'radio';
  const title = currentTrack?.title || currentStation?.name || '';
  const subtitle =
    currentTrack?.artist_name_override ||
    currentTrack?.artist_name ||
    currentStation?.current_program_title ||
    'Live radio';
  const cover = coverUri(currentTrack?.cover_art_url || currentStation?.cover_art_url);
  const ratio = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const hasLyrics = !isRadio && trackHasLyrics(currentTrack?.lyrics);
  const parsedLyrics = useMemo(
    () => (hasLyrics && currentTrack?.lyrics ? parseLyricsFromText(currentTrack.lyrics) : []),
    [currentTrack?.lyrics, hasLyrics],
  );
  const synced = isSynchronizedLyrics(parsedLyrics);
  const activeLyricIdx = synced
    ? lineIndexForTime(parsedLyrics, positionMs / 1000)
    : -1;
  const isFav = currentTrack ? favoriteIds.has(currentTrack.id) : false;
  const reaction = currentTrack ? reactions[currentTrack.id] : undefined;

  useEffect(() => {
    if (!lyricsOpen || activeLyricIdx < 0) return;
    const y = lineYRef.current[activeLyricIdx];
    if (typeof y === 'number') {
      lyricsListRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: true });
    }
  }, [activeLyricIdx, lyricsOpen]);

  if (mode === 'idle' || (!currentTrack && !currentStation)) {
    return (
      <View style={[styles.wrap, { paddingTop: insets.top + 16 }]}>
        <LinearGradient colors={['#0f172a', '#020617', '#000000']} style={StyleSheet.absoluteFill} />
        <Pressable onPress={() => router.back()} style={styles.roundBtn}>
          <Ionicons name="chevron-down" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.empty}>Nothing playing</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.ambientRoot} pointerEvents="none">
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={styles.ambient}
            blurRadius={64}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#0f172a', '#4c0519', '#020617']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {/* Light glass tint — keep cover color visible through blur */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.08)',
            'rgba(2, 6, 23, 0.22)',
            'rgba(2, 6, 23, 0.48)',
          ]}
          locations={[0, 0.45, 1]}
          style={styles.ambientTint}
        />
      </View>

      <View style={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.roundBtn} hitSlop={8}>
          <Ionicons name="chevron-down" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerLabel}>{isRadio ? 'Radio' : 'Now Playing'}</Text>
        <Pressable
          onPress={() => setListOpen(true)}
          style={[styles.roundBtn, listOpen && styles.roundBtnActive]}
          hitSlop={8}
        >
          <Ionicons name="list" size={18} color={listOpen ? colors.accent : colors.text} />
        </Pressable>
      </View>

      <View style={styles.center}>
        {!lyricsOpen ? (
          <Pressable
            onPress={() => {
              if (hasLyrics) setLyricsOpen(true);
            }}
            style={styles.artWrap}
          >
            <Image source={{ uri: cover }} style={styles.art} />
          </Pressable>
        ) : (
          <Pressable style={styles.lyricsPanel} onPress={() => setLyricsOpen(false)}>
            <ScrollView
              ref={lyricsListRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: synced ? 100 : 16 }}
            >
              {parsedLyrics.map((line, idx) => (
                <Text
                  key={`${idx}-${line.time}`}
                  onLayout={(e) => {
                    lineYRef.current[idx] = e.nativeEvent.layout.y;
                  }}
                  style={[
                    styles.lyricLine,
                    synced && styles.lyricSynced,
                    idx === activeLyricIdx && styles.lyricActive,
                  ]}
                >
                  {line.text}
                </Text>
              ))}
              {!parsedLyrics.length ? (
                <Text style={styles.lyricLine}>No lyrics available.</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        )}
      </View>

      <View style={styles.infoRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        </View>
        {currentTrack ? <DownloadButton track={currentTrack} /> : null}
      </View>

      {!canPlayFull ? (
        <Text style={styles.previewHint}>Preview mode — Premium unlocks full playback</Text>
      ) : null}

      {/* Like / speed / favorite */}
      {!isRadio ? (
        <View style={styles.actionsRow}>
          <View style={styles.actionGroup}>
            <Pressable
              onPress={() => currentTrack && void toggleReaction(currentTrack.id, 'like')}
              style={[styles.roundBtn, reaction === 'like' && styles.likeActive]}
            >
              <Ionicons
                name={reaction === 'like' ? 'thumbs-up' : 'thumbs-up-outline'}
                size={16}
                color={reaction === 'like' ? colors.accent : colors.textMuted}
              />
            </Pressable>
            <Pressable
              onPress={() => currentTrack && void toggleReaction(currentTrack.id, 'dislike')}
              style={[styles.roundBtn, reaction === 'dislike' && styles.dislikeActive]}
            >
              <Ionicons
                name={reaction === 'dislike' ? 'thumbs-down' : 'thumbs-down-outline'}
                size={16}
                color={reaction === 'dislike' ? colors.accent : colors.textMuted}
              />
            </Pressable>
          </View>

          <View style={styles.speedGroup}>
            <Pressable onPress={() => void bumpSpeed(-1)} hitSlop={8}>
              <Ionicons name="play-back" size={16} color={colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => void resetSpeed()}>
              <Text style={styles.speedLabel}>{playbackSpeed}x</Text>
            </Pressable>
            <Pressable onPress={() => void bumpSpeed(1)} hitSlop={8}>
              <Ionicons name="play-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.actionGroup}>
            {currentTrack ? <AddToPlaylistButton track={currentTrack} /> : null}
            <Pressable
              onPress={() => currentTrack && void toggleFavorite(currentTrack.id)}
              style={[styles.roundBtn, isFav && styles.favActive]}
            >
              <Ionicons
                name={isFav ? 'heart' : 'heart-outline'}
                size={18}
                color={isFav ? colors.accentStrong : colors.textMuted}
              />
            </Pressable>
          </View>
        </View>
      ) : null}

      {!isRadio ? (
        <View style={styles.progressBlock}>
          <Pressable
            style={styles.seekTrack}
            onPress={(e) => {
              const width = e.nativeEvent.locationX;
              const estimatedWidth = Dimensions.get('window').width - 48;
              void seekTo((width / estimatedWidth) * (durationMs || 0));
            }}
          >
            <View style={[styles.seekFill, { width: `${ratio * 100}%` }]} />
          </Pressable>
          <View style={styles.times}>
            <Text style={styles.time}>{formatDuration(positionMs / 1000)}</Text>
            <Text style={styles.time}>{formatDuration((durationMs || 0) / 1000)}</Text>
          </View>
        </View>
      ) : (
        <View style={{ height: 28 }} />
      )}

      <View style={styles.controls}>
        <Pressable
          onPress={toggleShuffle}
          disabled={isRadio}
          style={{ opacity: isRadio ? 0.25 : 1 }}
        >
          <Ionicons
            name="shuffle"
            size={20}
            color={isShuffle ? colors.accent : colors.textDim}
          />
        </Pressable>

        <Pressable
          onPress={() => void playPrevious()}
          disabled={isRadio}
          style={{ opacity: isRadio ? 0.25 : 1 }}
        >
          <Ionicons name="play-skip-back" size={26} color={colors.text} />
        </Pressable>

        <Pressable onPress={() => void togglePlay()} style={styles.playBtn}>
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={30}
            color={colors.playIcon}
            style={!isPlaying ? { marginLeft: 2 } : undefined}
          />
        </Pressable>

        <Pressable
          onPress={() => void playNext()}
          disabled={isRadio}
          style={{ opacity: isRadio ? 0.25 : 1 }}
        >
          <Ionicons name="play-skip-forward" size={26} color={colors.text} />
        </Pressable>

        <Pressable
          onPress={cycleRepeat}
          disabled={isRadio}
          style={{ opacity: isRadio ? 0.25 : 1 }}
        >
          <View>
            <Ionicons
              name="repeat"
              size={20}
              color={repeatMode !== 'none' ? colors.accent : colors.textDim}
            />
            {repeatMode === 'one' ? (
              <View style={styles.repeatOne}>
                <Text style={styles.repeatOneText}>1</Text>
              </View>
            ) : null}
          </View>
        </Pressable>
      </View>
      </View>

      {/* Web-mobile parity: full-screen “Now Playing” list (not a bottom queue sheet). */}
      <Modal
        visible={listOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeList}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View
            style={[
              styles.listScreen,
              { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8) },
            ]}
          >
            <View style={styles.listHeader}>
              <View style={styles.listHeaderLeft}>
                <Ionicons name="musical-notes" size={16} color={colors.accent} />
                <Text style={styles.listHeaderTitle}>{isRadio ? 'Programs' : 'Now Playing'}</Text>
              </View>
              <Pressable onPress={closeList} hitSlop={12} style={styles.roundBtn}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={styles.listMetaRow}>
              <Text style={styles.listMeta}>
                {isRadio ? 'Scheduled Broadcasts' : `Tracks: ${queue.length}`}
              </Text>
              {!isRadio && queue.length > 0 ? (
                <Pressable onPress={confirmClearQueue} hitSlop={8} style={styles.clearBtn}>
                  <Ionicons name="trash-outline" size={14} color={colors.accent} />
                  <Text style={styles.clearBtnText}>Clear Queue</Text>
                </Pressable>
              ) : null}
            </View>

            {isRadio ? (
              <View style={styles.listEmpty}>
                <Ionicons name="radio-outline" size={28} color={colors.textDim} />
                <Text style={styles.listEmptyText}>{currentStation?.name || 'Live radio'}</Text>
                <Text style={styles.queueMeta}>
                  {currentStation?.current_program_title || 'Program schedule not available offline'}
                </Text>
              </View>
            ) : (
              <DraggableFlatList
                data={queue}
                keyExtractor={(item, i) => `${item.id}-${i}`}
                activationDistance={12}
                onDragEnd={({ from, to }) => reorderQueue(from, to)}
                contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 24 }}
                ListEmptyComponent={
                  <View style={styles.listEmpty}>
                    <Ionicons name="musical-notes-outline" size={32} color={colors.textDim} />
                    <Text style={styles.listEmptyText}>No tracks loaded</Text>
                  </View>
                }
                renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<Track>) => {
                  const index = getIndex() ?? 0;
                  const active = currentTrack?.id === item.id;
                  return (
                    <ScaleDecorator>
                      <Pressable
                        onLongPress={drag}
                        delayLongPress={220}
                        disabled={isActive}
                        style={[
                          styles.listRow,
                          active && styles.listRowActive,
                          isActive && styles.listRowDragging,
                        ]}
                        onPress={() => {
                          void playTrack(item, queue);
                        }}
                      >
                        <View style={styles.listCoverWrap}>
                          <Image source={{ uri: coverUri(item.cover_art_url) }} style={styles.listCover} />
                          {active ? (
                            <View style={styles.listCoverOverlay}>
                              <Ionicons
                                name={isPlaying ? 'musical-notes' : 'play'}
                                size={14}
                                color={colors.accent}
                              />
                            </View>
                          ) : null}
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text
                            numberOfLines={1}
                            style={[styles.queueTitle, active && { color: colors.accent }]}
                          >
                            {item.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.queueMeta}>
                            {item.artist_name_override || item.artist_name}
                          </Text>
                        </View>
                        <TrackOverflowTrigger
                          onPress={(anchorEl) =>
                            openTrackMenuFromView(item, index, anchorEl, setMenuTarget)
                          }
                        />
                      </Pressable>
                    </ScaleDecorator>
                  );
                }}
              />
            )}
          </View>

          <TrackOverflowMenu
            target={menuTarget}
            inline
            topInset={insets.top + 8}
            onClose={() => setMenuTarget(null)}
            onAddToPlaylist={(track, anchor) => setPlaylistPicker({ track, anchor })}
            onFileInfo={setInfoTrack}
            onRemove={confirmRemoveFromList}
            removeLabel="Remove from list"
          />
        </GestureHandlerRootView>
      </Modal>

      {playlistPicker ? (
        <AddToPlaylistButton
          track={playlistPicker.track}
          anchor={playlistPicker.anchor}
          hideTrigger
          open
          onOpenChange={(v) => {
            if (!v) setPlaylistPicker(null);
          }}
        />
      ) : null}

      <TrackFileInfoSheet
        track={infoTrack}
        open={!!infoTrack}
        onClose={() => setInfoTrack(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
  ambientRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  ambient: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.5 }],
    opacity: 0.95,
  },
  ambientTint: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    flex: 1,
    zIndex: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  headerLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 10,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundBtnActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
  },
  artWrap: {
    alignItems: 'center',
  },
  art: {
    width: COVER,
    height: COVER,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  lyricsPanel: {
    width: '100%',
    height: COVER + 40,
  },
  lyricLine: {
    textAlign: 'center',
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 10,
  },
  lyricSynced: {
    color: 'rgba(255,255,255,0.55)',
    fontFamily: fonts.medium,
  },
  lyricActive: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 16,
    opacity: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 2,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontFamily: fonts.extrabold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    fontFamily: fonts.semibold,
  },
  previewHint: {
    color: colors.warning,
    marginTop: 8,
    fontSize: 11,
    fontFamily: fonts.semibold,
    zIndex: 2,
  },
  actionsRow: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  actionGroup: { flexDirection: 'row', gap: 8 },
  speedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  speedLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
    minWidth: 40,
    textAlign: 'center',
  },
  likeActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  dislikeActive: {
    backgroundColor: 'rgba(244,63,94,0.08)',
    borderColor: colors.accentBorder,
  },
  favActive: {
    backgroundColor: 'rgba(244,63,94,0.12)',
    borderColor: colors.accentBorder,
  },
  progressBlock: {
    marginTop: spacing.md,
    zIndex: 2,
  },
  seekTrack: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 10,
  },
  seekFill: {
    height: '100%',
    backgroundColor: colors.accentStrong,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  controls: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    zIndex: 2,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.playButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOne: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOneText: {
    color: colors.text,
    fontSize: 7,
    fontFamily: fonts.extrabold,
  },
  empty: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 80,
    fontFamily: fonts.medium,
  },
  listScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listHeaderTitle: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  listMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 8,
  },
  listMeta: {
    color: colors.textMuted,
    fontFamily: fonts.extrabold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  clearBtnText: {
    color: colors.accent,
    fontFamily: fonts.semibold,
    fontSize: 10,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    marginBottom: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  listRowActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  listRowDragging: {
    opacity: 0.92,
    transform: [{ scale: 1.02 }],
    borderColor: colors.accentBorder,
    backgroundColor: colors.bgElevated,
  },
  listCoverWrap: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
  },
  listCover: {
    width: '100%',
    height: '100%',
  },
  listCoverOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  listEmptyText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  queueTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  queueMeta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
});
