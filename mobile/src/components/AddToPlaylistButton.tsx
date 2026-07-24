import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import { noticeError, noticeSuccess } from '@/components/ConfirmDialog';
import type { TrackMenuAnchor } from '@/components/TrackOverflowMenu';
import type { Playlist, Track } from '@/types/models';
import { colors, fonts, radii } from '@/theme/tokens';

const MENU_WIDTH = 268;
const MENU_MAX_HEIGHT = 340;

type Props = {
  track: Track;
  /** Controlled open (e.g. from track ⋮ menu). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the + trigger when opened only via menu. */
  hideTrigger?: boolean;
  /** Anchor for controlled opens (from ⋮ menu). */
  anchor?: TrackMenuAnchor | null;
};

function menuPosition(
  anchor: TrackMenuAnchor,
  topInset: number,
  bottomInset: number,
) {
  const winH = Dimensions.get('window').height;
  const winW = Dimensions.get('window').width;
  const gap = 8;
  const edge = 10;

  const spaceBelow = winH - (anchor.y + anchor.h) - bottomInset - gap;
  const spaceAbove = anchor.y - topInset - gap;
  // Prefer the side with more room (player + sits mid/low → usually above).
  const openAbove = spaceAbove >= spaceBelow || spaceBelow < 220;

  const available = openAbove ? spaceAbove : spaceBelow;
  const maxHeight = Math.max(160, Math.min(MENU_MAX_HEIGHT, available - 4));

  let top = openAbove
    ? anchor.y - maxHeight - gap
    : anchor.y + anchor.h + gap;
  top = Math.max(topInset, Math.min(top, winH - bottomInset - maxHeight));

  // Horizontally: keep menu near the button, clamped to screen.
  const anchorCenter = anchor.x + anchor.w / 2;
  let left = anchorCenter - MENU_WIDTH / 2;
  // If button is on the right half, prefer right-align under/over the button.
  if (anchorCenter > winW * 0.55) {
    left = anchor.x + anchor.w - MENU_WIDTH;
  } else if (anchorCenter < winW * 0.45) {
    left = anchor.x;
  }
  left = Math.max(edge, Math.min(left, winW - MENU_WIDTH - edge));

  return {
    top,
    left,
    width: MENU_WIDTH,
    maxHeight,
  };
}

export function AddToPlaylistButton({
  track,
  open,
  onOpenChange,
  hideTrigger,
  anchor: controlledAnchor,
}: Props) {
  const insets = useSafeAreaInsets();
  const triggerRef = useRef<View>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const [triggerAnchor, setTriggerAnchor] = useState<TrackMenuAnchor | null>(null);

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

  const openFromTrigger = () => {
    const node = triggerRef.current;
    if (!node) {
      setTriggerAnchor({
        x: Dimensions.get('window').width - 56,
        y: 120,
        w: 40,
        h: 40,
      });
      setVisible(true);
      return;
    }
    node.measureInWindow((x, y, w, h) => {
      setTriggerAnchor({ x, y, w, h });
      setVisible(true);
    });
  };

  const close = () => {
    setVisible(false);
    setNewName('');
  };

  const add = async (playlistId: number, nameHint?: string) => {
    setAddingId(playlistId);
    try {
      await addTrackToPlaylist(playlistId, track.id);
      close();
      await noticeSuccess('Playlist', `Added to "${nameHint || 'playlist'}"`);
    } catch (e) {
      await noticeError('Playlist', e instanceof Error ? e.message : 'Could not add track.');
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
      await noticeError('Playlist', e instanceof Error ? e.message : 'Could not create playlist.');
    } finally {
      setCreating(false);
    }
  };

  const anchor =
    controlledAnchor ||
    triggerAnchor ||
    ({
      x: Dimensions.get('window').width - 56,
      y: insets.top + 80,
      w: 40,
      h: 40,
    } satisfies TrackMenuAnchor);

  const pos = menuPosition(anchor, insets.top + 8, Math.max(insets.bottom, 12));

  return (
    <>
      {!hideTrigger ? (
        <View ref={triggerRef} collapsable={false}>
          <Pressable
            onPress={openFromTrigger}
            style={[styles.roundBtn, visible && styles.roundBtnActive]}
            hitSlop={8}
          >
            <Ionicons name="add" size={20} color={visible ? colors.accent : colors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <Modal
        visible={visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.layer} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View style={[styles.menu, pos]}>
            <Text style={styles.title}>Add to playlist</Text>
            <Text numberOfLines={1} style={styles.trackHint}>
              {track.title}
            </Text>

            <View style={styles.createRow}>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="New playlist"
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
                  <Ionicons name="add" size={18} color={colors.playIcon} />
                )}
              </Pressable>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 20 }} />
            ) : (
              <FlatList
                data={playlists}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={{ maxHeight: Math.max(100, pos.maxHeight - 118) }}
                ListEmptyComponent={
                  <Text style={styles.empty}>No playlists yet — create one above.</Text>
                }
                renderItem={({ item }) => {
                  const busy = addingId === item.id;
                  const count = item.track_count ?? item.tracks?.length ?? 0;
                  return (
                    <Pressable
                      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                      disabled={busy}
                      onPress={() => void add(item.id, item.name)}
                    >
                      <View style={styles.rowIcon}>
                        <Ionicons name="folder" size={14} color={colors.accent} />
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
                        <Ionicons name="add-circle-outline" size={18} color={colors.textMuted} />
                      )}
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        </View>
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
  layer: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingTop: 12,
    paddingBottom: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 13,
    paddingHorizontal: 6,
  },
  trackHint: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    color: colors.text,
    fontFamily: fonts.medium,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  createBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.playButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: colors.textDim,
    textAlign: 'center',
    paddingVertical: 20,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  rowMeta: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 1,
  },
});
