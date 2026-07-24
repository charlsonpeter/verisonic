import React, { useMemo } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Track } from '@/types/models';
import { formatDuration } from '@/utils/accountTier';
import { coverUri } from '@/utils/mediaUrl';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

type Props = {
  track: Track | null;
  open: boolean;
  onClose: () => void;
};

function buildRows(track: Track): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value?: string | number | null) => {
    if (value === null || value === undefined) return;
    const text = typeof value === 'string' ? value.trim() : String(value);
    if (!text) return;
    rows.push({ label, value: text });
  };

  add('Album', track.album_title);
  add('Album Artist', track.album_artist);
  add('Track #', track.track_number);
  add('Year', track.year);
  add('Composer', track.composer);
  add('Lyricist', track.lyricist);
  add('Language', track.language);
  add('Format', track.file_format);
  add('Quality', track.quality_level);
  if (track.bitrate) add('Bitrate', `${Math.round(track.bitrate / 1000)} kbps`);
  if (track.sample_rate) add('Sample rate', `${track.sample_rate} Hz`);
  if (track.bit_depth) add('Bit depth', `${track.bit_depth}-bit`);
  add('Copyright', track.copyright);
  add('Comment', track.comment);
  if (track.duration > 0) add('Duration', formatDuration(track.duration));
  return rows;
}

function genreTags(genres?: Track['genres']): string[] {
  if (!genres?.length) return [];
  return genres
    .map((g) => (typeof g === 'string' ? g : g?.name || ''))
    .map((g) => g.trim())
    .filter(Boolean);
}

export function TrackFileInfoSheet({ track, open, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const rows = useMemo(() => (track ? buildRows(track) : []), [track]);
  const tags = useMemo(() => (track ? genreTags(track.genres) : []), [track]);

  if (!track) return null;

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: insets.bottom + 16, maxHeight: '88%' }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>File info</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <Image source={{ uri: coverUri(track.cover_art_url) }} style={styles.cover} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title}>{track.title}</Text>
                <Text style={styles.artist}>
                  {track.artist_name_override || track.artist_name}
                </Text>
                {tags.length ? (
                  <View style={styles.tags}>
                    {tags.map((tag) => (
                      <Text key={tag} style={styles.tag}>
                        {tag}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardLabel}>Details</Text>
              {rows.length ? (
                rows.map((row) => (
                  <View key={row.label} style={styles.metaRow}>
                    <Text style={styles.metaLabel}>{row.label}</Text>
                    <Text style={styles.metaValue}>{row.value}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>No additional track information available.</Text>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  hero: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.md,
  },
  cover: {
    width: 72,
    height: 72,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 17,
  },
  artist: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 13,
    marginTop: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  tag: {
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    overflow: 'hidden',
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 9,
    fontFamily: fonts.extrabold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardLabel: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  metaRow: {
    marginBottom: 12,
  },
  metaLabel: {
    color: colors.textDim,
    fontFamily: fonts.extrabold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metaValue: {
    color: colors.text,
    fontFamily: fonts.semibold,
    fontSize: 13,
    marginTop: 3,
  },
  empty: {
    color: colors.textDim,
    fontFamily: fonts.medium,
    fontSize: 12,
    fontStyle: 'italic',
  },
});
