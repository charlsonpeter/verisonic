import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createPlaylist,
  fetchLikedTracks,
  fetchPlaylist,
  fetchPlaylists,
} from '@/api/endpoints';
import { DownloadButton } from '@/components/DownloadButton';
import { FavoriteButton } from '@/components/FavoriteButton';
import {
  Button,
  EmptyState,
  LoadingBlock,
  Screen,
  TrackRow,
} from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import { listDownloads } from '@/services/downloads';
import type { DownloadedTrackMeta, Playlist, Track } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type LibraryKind = 'liked' | 'downloads';

type OpenCollection = {
  kind: 'library' | 'playlist';
  id: LibraryKind | number;
  title: string;
};

function downloadToTrack(d: DownloadedTrackMeta): Track {
  return {
    id: d.trackId,
    title: d.title,
    artist_name: d.artistName,
    cover_art_url: d.coverArtUrl,
    duration: 0,
  };
}

export default function PlaylistsScreen() {
  const insets = useSafeAreaInsets();
  const { playTrack, refreshLibraryState } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [downloadCount, setDownloadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [openCollection, setOpenCollection] = useState<OpenCollection | null>(null);
  const [openTracks, setOpenTracks] = useState<Track[]>([]);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    try {
      const [pls, liked, downloads] = await Promise.all([
        fetchPlaylists().catch(() => [] as Playlist[]),
        fetchLikedTracks().catch(() => [] as Track[]),
        listDownloads().catch(() => [] as DownloadedTrackMeta[]),
      ]);
      setPlaylists(pls);
      setLikedCount(liked.length);
      setDownloadCount(downloads.length);
      await refreshLibraryState().catch(() => undefined);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [refreshLibraryState]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openLibrary = async (kind: LibraryKind) => {
    setOpening(true);
    setOpenCollection({
      kind: 'library',
      id: kind,
      title: kind === 'liked' ? 'Liked Music' : 'Downloaded Music',
    });
    try {
      if (kind === 'liked') {
        setOpenTracks(await fetchLikedTracks());
      } else {
        const downloads = await listDownloads();
        setOpenTracks(downloads.map(downloadToTrack));
      }
    } catch (e) {
      Alert.alert('Library', e instanceof Error ? e.message : 'Could not open collection');
      setOpenCollection(null);
      setOpenTracks([]);
    } finally {
      setOpening(false);
    }
  };

  const openPlaylist = async (playlist: Playlist) => {
    setOpening(true);
    setOpenCollection({ kind: 'playlist', id: playlist.id, title: playlist.name });
    try {
      const detail = await fetchPlaylist(playlist.id);
      setOpenTracks(detail.tracks || []);
    } catch (e) {
      Alert.alert('Playlist', e instanceof Error ? e.message : 'Could not open playlist');
      setOpenCollection(null);
      setOpenTracks([]);
    } finally {
      setOpening(false);
    }
  };

  const closeCollection = () => {
    setOpenCollection(null);
    setOpenTracks([]);
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createPlaylist(name);
      setNewName('');
      setCreating(false);
      await load();
    } catch (e) {
      Alert.alert('Playlist', e instanceof Error ? e.message : 'Could not create playlist');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingBottom: 140 }}>
      <View style={styles.top}>
        <Pressable onPress={() => setCreating(true)}>
          <Text style={styles.create}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.defaults}>
            <Pressable
              style={({ pressed }) => [styles.libCard, pressed && { opacity: 0.9 }]}
              onPress={() => void openLibrary('liked')}
            >
              <View style={[styles.libIcon, styles.libIconLiked]}>
                <Ionicons name="thumbs-up" size={22} color={colors.text} />
              </View>
              <View style={styles.libBody}>
                <Text style={styles.title}>Liked Music</Text>
                <Text style={styles.meta}>{likedCount} tracks</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.libCard, pressed && { opacity: 0.9 }]}
              onPress={() => void openLibrary('downloads')}
            >
              <View style={[styles.libIcon, styles.libIconDownloads]}>
                <Ionicons name="download" size={22} color={colors.text} />
              </View>
              <View style={styles.libBody}>
                <Text style={styles.title}>Downloaded Music</Text>
                <Text style={styles.meta}>{downloadCount} tracks</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
            </Pressable>

            {playlists.length > 0 ? (
              <Text style={styles.sectionLabel}>Your playlists</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState message="No custom playlists yet. Tap + New to create one." />
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            onPress={() => void openPlaylist(item)}
          >
            <View style={[styles.libIcon, styles.libIconPlaylist]}>
              <Ionicons name="musical-notes" size={20} color={colors.accent} />
            </View>
            <View style={styles.libBody}>
              <Text style={styles.title}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.track_count ?? item.tracks?.length ?? 0} tracks
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </Pressable>
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New playlist</Text>
            <TextInput
              value={newName}
              onChangeText={setNewName}
              placeholder="Playlist name"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={() => setCreating(false)} />
              <Button label="Create" loading={busy} onPress={() => void onCreate()} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!openCollection}
        animationType="slide"
        onRequestClose={closeCollection}
      >
        <View
          style={[
            styles.detailRoot,
            { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.detailHeader}>
            <Pressable onPress={closeCollection} hitSlop={12}>
              <Text style={styles.back}>Close</Text>
            </Pressable>
            {openTracks.length > 0 ? (
              <Pressable onPress={() => void playTrack(openTracks[0], openTracks)}>
                <Text style={styles.create}>Play all</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.detailTitle}>{openCollection?.title}</Text>
          <Text style={styles.meta}>{openTracks.length} tracks</Text>
          {opening ? (
            <LoadingBlock />
          ) : (
            <FlatList
              data={openTracks}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={
                <EmptyState
                  message={
                    openCollection?.id === 'liked'
                      ? 'No liked tracks yet. Tap thumbs up while listening.'
                      : openCollection?.id === 'downloads'
                        ? 'No downloads yet. Save tracks for offline play.'
                        : 'This playlist has no tracks yet.'
                  }
                />
              }
              renderItem={({ item, index }) => (
                <TrackRow
                  track={item}
                  index={index}
                  onPress={() => void playTrack(item, openTracks)}
                  right={
                    <View style={styles.rowActions}>
                      <FavoriteButton trackId={item.id} />
                      {openCollection?.id !== 'downloads' ? (
                        <DownloadButton track={item} />
                      ) : null}
                    </View>
                  }
                />
              )}
              contentContainerStyle={{ paddingBottom: 40, paddingTop: 12 }}
            />
          )}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  create: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  defaults: {
    marginBottom: 4,
  },
  sectionLabel: {
    color: colors.textDim,
    fontFamily: fonts.extrabold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  libCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 12,
    marginBottom: spacing.sm,
  },
  libIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  libIconLiked: {
    backgroundColor: colors.accentStrong,
  },
  libIconDownloads: {
    backgroundColor: '#334155',
  },
  libIconPlaylist: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
  },
  libBody: {
    flex: 1,
    minWidth: 0,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 12,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  meta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 4,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.bgMid,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 12,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 16,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  modalActions: { gap: 8 },
  detailRoot: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  back: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
  },
  detailTitle: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 24,
  },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
