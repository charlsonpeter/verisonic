import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  createPlaylist,
  fetchLikedTracks,
  fetchPlaylists,
} from '@/api/endpoints';
import { noticeError } from '@/components/ConfirmDialog';
import {
  Button,
  EmptyState,
  LoadingBlock,
  Screen,
} from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import { listDownloads } from '@/services/downloads';
import type { DownloadedTrackMeta, Playlist, Track } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function PlaylistsScreen() {
  const router = useRouter();
  const { refreshLibraryState } = usePlayer();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [downloadCount, setDownloadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

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

  const openLibrary = (kind: 'liked' | 'downloads') => {
    router.push(`/playlists/${kind}`);
  };

  const openPlaylist = (playlist: Playlist) => {
    router.push({
      pathname: '/playlists/[id]',
      params: { id: String(playlist.id), title: playlist.name },
    });
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
      await noticeError('Playlist', e instanceof Error ? e.message : 'Could not create playlist');
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
              onPress={() => openLibrary('liked')}
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
              onPress={() => openLibrary('downloads')}
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
            onPress={() => openPlaylist(item)}
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

      <Modal
        visible={creating}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setCreating(false)}
      >
        <View style={styles.modalBackdrop} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreating(false)} />
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
  },
  modalCard: {
    position: 'absolute',
    left: Math.max(24, (Dimensions.get('window').width - 340) / 2),
    top: Math.max(80, Dimensions.get('window').height * 0.32),
    width: Math.min(340, Dimensions.get('window').width - 48),
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
});
