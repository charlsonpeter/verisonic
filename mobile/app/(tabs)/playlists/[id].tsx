import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import DraggableFlatList, {
  ScaleDecorator,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  clearTrackReaction,
  deletePlaylist,
  fetchLikedTracks,
  fetchPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks,
} from '@/api/endpoints';
import { AddToPlaylistButton } from '@/components/AddToPlaylistButton';
import { confirm, noticeError } from '@/components/ConfirmDialog';
import { TrackFileInfoSheet } from '@/components/TrackFileInfoSheet';
import {
  TrackOverflowMenu,
  TrackOverflowTrigger,
  openTrackMenuFromView,
  type TrackMenuAnchor,
  type TrackMenuTarget,
} from '@/components/TrackOverflowMenu';
import { EmptyState, LoadingBlock, Screen, TrackRow } from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import { listDownloads, removeDownload } from '@/services/downloads';
import type { DownloadedTrackMeta, Track } from '@/types/models';
import { colors, fonts } from '@/theme/tokens';

function downloadToTrack(d: DownloadedTrackMeta): Track {
  return {
    id: d.trackId,
    title: d.title,
    artist_name: d.artistName,
    cover_art_url: d.coverArtUrl,
    duration: 0,
  };
}

function titleForId(id: string, paramTitle?: string): string {
  if (id === 'liked') return 'Liked Music';
  if (id === 'downloads') return 'Downloaded Music';
  if (paramTitle?.trim()) return paramTitle.trim();
  return 'Playlist';
}

function emptyMessageForId(id: string): string {
  if (id === 'liked') return 'No liked tracks yet. Tap thumbs up while listening.';
  if (id === 'downloads') return 'No downloads yet. Save tracks for offline play.';
  return 'This playlist has no tracks yet.';
}

function menuLabelsForId(id: string | undefined): {
  infoLabel: string;
  removeLabel: string;
  removeIcon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
} {
  if (id === 'liked') {
    return {
      infoLabel: 'Track info',
      removeLabel: 'Unlike',
      removeIcon: 'thumbs-up-outline',
    };
  }
  if (id === 'downloads') {
    return {
      infoLabel: 'Track info',
      removeLabel: 'Delete from device',
      removeIcon: 'trash-outline',
    };
  }
  return {
    infoLabel: 'File info',
    removeLabel: 'Remove from playlist',
    removeIcon: 'trash-outline',
  };
}

export default function PlaylistDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playTrack } = usePlayer();
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const paramTitle = Array.isArray(params.title) ? params.title[0] : params.title;

  const canReorder = !!id && id !== 'liked' && id !== 'downloads' && !Number.isNaN(Number(id));
  const playlistId = canReorder ? Number(id) : null;

  const [title, setTitle] = useState(() => titleForId(id || '', paramTitle));
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuTarget, setMenuTarget] = useState<TrackMenuTarget | null>(null);
  const [playlistPicker, setPlaylistPicker] = useState<{
    track: Track;
    anchor: TrackMenuAnchor;
  } | null>(null);
  const [infoTrack, setInfoTrack] = useState<Track | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setTracks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (id === 'liked') {
        setTitle('Liked Music');
        setTracks(await fetchLikedTracks());
      } else if (id === 'downloads') {
        setTitle('Downloaded Music');
        const downloads = await listDownloads();
        setTracks(downloads.map(downloadToTrack));
      } else {
        const numericId = Number(id);
        if (Number.isNaN(numericId)) {
          throw new Error('Invalid playlist');
        }
        const detail = await fetchPlaylist(numericId);
        setTitle(detail.name || paramTitle || 'Playlist');
        setTracks(detail.tracks || []);
      }
    } catch (e) {
      void noticeError('Playlist', e instanceof Error ? e.message : 'Could not open playlist');
      setTracks([]);
      router.back();
    } finally {
      setLoading(false);
    }
  }, [id, paramTitle, router]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onReorder = async (next: Track[], from: number, to: number) => {
    if (!playlistId || from === to) return;
    const previous = tracks;
    setTracks(next);
    try {
      const updated = await reorderPlaylistTracks(
        playlistId,
        next.map((t) => t.id),
      );
      setTracks(updated.tracks || next);
    } catch (e) {
      setTracks(previous);
      void noticeError('Playlist', e instanceof Error ? e.message : 'Could not reorder tracks');
    }
  };

  const onRemove = (track: Track, index: number) => {
    const labels =
      id === 'liked'
        ? {
            title: 'Unlike',
            message: `Unlike "${track.title}"?`,
            confirmLabel: 'Unlike',
          }
        : id === 'downloads'
          ? {
              title: 'Delete from device',
              message: `Delete "${track.title}" from this device?`,
              confirmLabel: 'Delete',
            }
          : {
              title: 'Remove from playlist',
              message: `Remove "${track.title}" from this playlist?`,
              confirmLabel: 'Remove',
            };

    void (async () => {
      const ok = await confirm({
        title: labels.title,
        message: labels.message,
        confirmLabel: labels.confirmLabel,
        destructive: true,
      });
      if (!ok) return;

      const previous = tracks;
      setTracks((prev) => prev.filter((_, i) => i !== index));
      try {
        if (id === 'liked') {
          await clearTrackReaction(track.id);
        } else if (id === 'downloads') {
          await removeDownload(track.id);
        } else if (playlistId) {
          const updated = await removeTrackFromPlaylist(playlistId, track.id);
          setTracks(updated.tracks || previous.filter((t) => t.id !== track.id));
        }
      } catch (e) {
        setTracks(previous);
        void noticeError('Playlist', e instanceof Error ? e.message : 'Could not remove track');
      }
    })();
  };

  const onDeletePlaylist = () => {
    if (!playlistId) return;
    void (async () => {
      const ok = await confirm({
        title: 'Delete playlist',
        message: `Delete "${title}"? This cannot be undone.`,
        confirmLabel: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      try {
        await deletePlaylist(playlistId);
        router.back();
      } catch (e) {
        void noticeError('Playlist', e instanceof Error ? e.message : 'Could not delete playlist');
      }
    })();
  };

  const rowMenu = (item: Track, index: number) => (
    <TrackOverflowTrigger
      onPress={(anchorEl) => openTrackMenuFromView(item, index, anchorEl, setMenuTarget)}
    />
  );

  const listBody = canReorder ? (
    <DraggableFlatList
      data={tracks}
      keyExtractor={(item, i) => `${item.id}-${i}`}
      activationDistance={12}
      onDragEnd={({ data, from, to }) => {
        void onReorder(data, from, to);
      }}
      ListEmptyComponent={<EmptyState message={emptyMessageForId(id || '')} />}
      contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}
      renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<Track>) => {
        const index = getIndex() ?? 0;
        return (
          <ScaleDecorator>
            <TrackRow
              track={item}
              index={index}
              disabled={isActive}
              delayLongPress={220}
              onLongPress={drag}
              onPress={() => void playTrack(item, tracks)}
              right={rowMenu(item, index)}
            />
          </ScaleDecorator>
        );
      }}
    />
  ) : (
    <FlatList
      data={tracks}
      keyExtractor={(item) => String(item.id)}
      ListEmptyComponent={<EmptyState message={emptyMessageForId(id || '')} />}
      renderItem={({ item, index }) => (
        <TrackRow
          track={item}
          index={index}
          onPress={() => void playTrack(item, tracks)}
          right={rowMenu(item, index)}
        />
      )}
      contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}
    />
  );

  return (
    <Screen style={{ paddingBottom: 140 }}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>Back</Text>
        </Pressable>
        <View style={styles.topActions}>
          {!loading && tracks.length > 0 ? (
            <Pressable onPress={() => void playTrack(tracks[0], tracks)} hitSlop={8}>
              <Text style={styles.playAll}>Play all</Text>
            </Pressable>
          ) : null}
          {playlistId ? (
            <Pressable onPress={onDeletePlaylist} hitSlop={8} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color={colors.accentStrong} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.meta}>
        {loading
          ? '…'
          : canReorder && tracks.length > 0
            ? `${tracks.length} tracks · Long-press to reorder`
            : `${tracks.length} tracks`}
      </Text>

      {loading ? (
        <LoadingBlock />
      ) : (
        <GestureHandlerRootView style={{ flex: 1 }}>
          {listBody}
          <TrackOverflowMenu
            target={menuTarget}
            topInset={insets.top + 8}
            onClose={() => setMenuTarget(null)}
            onAddToPlaylist={(track, anchor) => setPlaylistPicker({ track, anchor })}
            onFileInfo={setInfoTrack}
            onRemove={(track, index) => {
              onRemove(track, index);
            }}
            {...menuLabelsForId(id)}
          />
        </GestureHandlerRootView>
      )}

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
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  deleteBtn: {
    padding: 4,
  },
  back: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  playAll: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 24,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 4,
  },
});
