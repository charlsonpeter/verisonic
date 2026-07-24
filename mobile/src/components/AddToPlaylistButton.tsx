import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addTrackToPlaylist,
  createPlaylist,
  fetchPlaylists,
} from '@/api/endpoints';
import type { Playlist, Track } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type Props = {
  track: Track;
  /** Controlled open (e.g. from track ⋮ menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the + trigger when opened only via menu. */
  hideTrigger?: boolean;
};

export function AddToPlaylistButton({ track, open, onOpenChange, hideTrigger }: Props) {
  const insets = useSafeAreaInsets();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const visible = isControlled ? open : internalOpen;
  const setVisible = (v: boolean) => {
    if (!isControlled) setInternalOpen(v);
    onOpenChange?.(v);
  };

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlaylists(await fetchPlaylists());
    } catch {
      setPlaylists([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load, track.id]);

  const openSheet = () => setVisible(true);

  const add = async (playlistId: number, nameHint?: string) => {
    setAddingId(playlistId);
    try {
      await addTrackToPlaylist(playlistId, track.id);
      Alert.alert('Playlist', `Added to "${nameHint || 'playlist'}"`);
      setVisible(false);
      setNewName('');
    } catch (e) {
      Alert.alert('Playlist', e instanceof Error ? e.message : 'Could not add track.');
    } finally {
      setAddingId(null);
    }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await createPlaylist(name);
      setNewName('');
      await add(created.id, created.name);
    } catch (e) {
      Alert.alert('Playlist', e instanceof Error ? e.message : 'Could not create playlist.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {!hideTrigger ? (
        <Pressable
          onPress={openSheet}
          style={[styles.roundBtn, visible && styles.roundBtnActive]}
          hitSlop={8}
        >
          <Ionicons name="add" size={20} color={visible ? colors.accent : colors.textMuted} />
        </Pressable>
      ) : null}

      <Modal visible={visible} animationType="slide" transparent onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.handle} />
            <Text style={styles.title}>Add to playlist</Text>
            <Text numberOfLines={1} style={styles.trackHint}>
              {track.title}
            </Text>

            <View style={styles.createRow}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="New playlist name"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={() => void createAndAdd()}
              />
              <Pressable
                onPress={() => void createAndAdd()}
                disabled={creating || !newName.trim()}
                style={[styles.createBtn, (!newName.trim() || creating) && { opacity: 0.45 }]}
              >
                {creating ? (
                  <ActivityIndicator color={colors.playIcon} size="small" />
                ) : (
                  <Ionicons name="add" size={20} color={colors.playIcon} />
                )}
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => String(item.id)}
                style={{ maxHeight: 320 }}
                ListEmptyComponent={
                  <Text style={styles.empty}>No playlists yet — create one above.</Text>
                }
                renderItem={({ item }) => {
                  const busy = addingId === item.id;
                  const count = item.track_count ?? item.tracks?.length ?? 0;
                  return (
                    <Pressable
                      style={styles.row}
                      disabled={busy}
                      onPress={() => void add(item.id, item.name)}
                    >
                      <View style={styles.rowIcon}>
                        <Ionicons name="folder" size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={styles.rowTitle}>
                          {item.name}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {count} track{count === 1 ? '' : 's'}
                        </Text>
                      </View>
                      {busy ? (
                        <ActivityIndicator color={colors.accent} size="small" />
                      ) : (
                        <Ionicons name="add-circle-outline" size={20} color={colors.textMuted} />
                      )}
                    </Pressable>
                  );
                }}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgMid,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 16,
  },
  trackHint: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 14,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  createBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.playButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: colors.textDim,
    textAlign: 'center',
    paddingVertical: 28,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 2,
  },
});
