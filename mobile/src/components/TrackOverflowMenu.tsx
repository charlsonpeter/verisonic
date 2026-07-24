import React from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Track } from '@/types/models';
import { colors, fonts, radii } from '@/theme/tokens';

const MENU_WIDTH = 220;
const MENU_HEIGHT = 156;

export type TrackMenuAnchor = { x: number; y: number; w: number; h: number };

export type TrackMenuTarget = {
  track: Track;
  index: number;
  anchor: TrackMenuAnchor;
};

export function openTrackMenuFromView(
  track: Track,
  index: number,
  anchorEl: View | null,
  setTarget: (t: TrackMenuTarget) => void,
) {
  if (!anchorEl) {
    setTarget({
      track,
      index,
      anchor: {
        x: Dimensions.get('window').width - 48,
        y: 120,
        w: 36,
        h: 36,
      },
    });
    return;
  }
  anchorEl.measureInWindow((x, y, w, h) => {
    setTarget({ track, index, anchor: { x, y, w, h } });
  });
}

type Props = {
  target: TrackMenuTarget | null;
  topInset?: number;
  /** Render as absolute overlay in parent (needed inside another Modal). */
  inline?: boolean;
  onClose: () => void;
  onAddToPlaylist: (track: Track, anchor: TrackMenuAnchor) => void;
  onFileInfo: (track: Track) => void;
  onRemove: (track: Track, index: number) => void;
  infoLabel?: string;
  removeLabel?: string;
  removeIcon?: keyof typeof Ionicons.glyphMap;
};

/** Anchored ⋮ dropdown menu (not a bottom sheet). */
export function TrackOverflowMenu({
  target,
  topInset = 8,
  inline = false,
  onClose,
  onAddToPlaylist,
  onFileInfo,
  onRemove,
  infoLabel = 'File info',
  removeLabel = 'Remove from list',
  removeIcon = 'trash-outline',
}: Props) {
  if (!target) return null;

  const winH = Dimensions.get('window').height;
  const winW = Dimensions.get('window').width;
  const { x, y, w, h } = target.anchor;
  const right = Math.max(8, winW - (x + w));
  const below = y + h + 6;
  const above = y - MENU_HEIGHT - 6;
  const top = below + MENU_HEIGHT > winH - 12 ? Math.max(topInset, above) : below;

  const menu = (
    <View style={[styles.menuLayer, inline && StyleSheet.absoluteFillObject]} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={[
          styles.trackMenu,
          {
            top,
            right: Math.min(right, winW - MENU_WIDTH - 8),
            width: MENU_WIDTH,
          },
        ]}
      >
        <Pressable
          style={styles.menuItem}
          onPress={() => {
            const t = target.track;
            const a = target.anchor;
            onClose();
            onAddToPlaylist(t, a);
          }}
        >
          <Ionicons name="add" size={18} color={colors.text} />
          <Text style={styles.menuItemText}>Add to playlist</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => {
            const t = target.track;
            onClose();
            onFileInfo(t);
          }}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.text} />
          <Text style={styles.menuItemText}>{infoLabel}</Text>
        </Pressable>
        <Pressable
          style={styles.menuItem}
          onPress={() => {
            const { track, index } = target;
            onClose();
            onRemove(track, index);
          }}
        >
          <Ionicons name={removeIcon} size={18} color={colors.accentStrong} />
          <Text style={[styles.menuItemText, { color: colors.accentStrong }]}>{removeLabel}</Text>
        </Pressable>
      </View>
    </View>
  );

  if (inline) return menu;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {menu}
    </Modal>
  );
}

type TriggerProps = {
  onPress: (anchorEl: View | null) => void;
};

export function TrackOverflowTrigger({ onPress }: TriggerProps) {
  const ref = React.useRef<View>(null);
  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation?.();
          onPress(ref.current);
        }}
        hitSlop={10}
        style={styles.moreBtn}
      >
        <Ionicons name="ellipsis-vertical" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  menuLayer: {
    flex: 1,
    zIndex: 40,
  },
  trackMenu: {
    position: 'absolute',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  menuItemText: {
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  moreBtn: {
    padding: 8,
  },
});
