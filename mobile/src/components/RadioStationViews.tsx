import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RadioStation } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import { coverUri } from '@/utils/mediaUrl';

const TILE_W = 108;

function formatLocation(station: RadioStation): string | null {
  if (station.city) {
    return `${station.city}${station.country ? `, ${station.country}` : ''}`;
  }
  return null;
}

function isLiveBroadcast(station: RadioStation): boolean {
  return station.is_online !== false && !!station.stream_url?.includes('/live');
}

type TileProps = {
  station: RadioStation;
  isCurrent: boolean;
  isPlaying: boolean;
  onPress: () => void;
};

/** Web `RadioTile` — compact square used in the mobile horizontal strip. */
export function RadioTile({ station, isCurrent, isPlaying, onPress }: TileProps) {
  const offline = station.is_online === false;
  const live = isLiveBroadcast(station);
  const location = formatLocation(station);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        pressed && !offline && { opacity: 0.92, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={[styles.tileCoverWrap, isCurrent && styles.tileCoverCurrent]}>
        <Image
          source={{ uri: coverUri(station.cover_art_url) }}
          style={[styles.tileCover, offline && styles.tileCoverDim]}
        />
        {offline ? (
          <View style={styles.tileOverlay}>
            <View style={styles.offlineBadge}>
              <Text style={styles.offlineLabel}>Offline</Text>
            </View>
          </View>
        ) : null}
        {live ? <View style={styles.liveDot} /> : null}
      </View>
      <View style={styles.tileMetaRow}>
        <Text numberOfLines={1} style={styles.tileName}>
          {station.name}
        </Text>
        {station.broadcast_frequency ? (
          <Text numberOfLines={1} style={styles.tileFreq}>
            {station.broadcast_frequency}
          </Text>
        ) : null}
      </View>
      <Text numberOfLines={1} style={styles.tileLoc}>
        {location || ' '}
      </Text>
    </Pressable>
  );
}

type CardProps = {
  station: RadioStation;
  isCurrent: boolean;
  isPlaying: boolean;
  onPress: () => void;
};

/** Web `RadioCard` — full station card (mobile slate-900 style). */
export function RadioStationCard({ station, isCurrent, isPlaying, onPress }: CardProps) {
  const offline = station.is_online === false;
  const live = isLiveBroadcast(station);
  const location = formatLocation(station);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        offline && { opacity: 0.6 },
        isCurrent && !offline && styles.cardCurrent,
        pressed && { opacity: 0.94 },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardCoverWrap}>
          <Image source={{ uri: coverUri(station.cover_art_url) }} style={styles.cardCover} />
          <View style={styles.cardPlayBadge}>
            <Ionicons
              name={isCurrent && isPlaying ? 'pause' : 'play'}
              size={16}
              color="#fff"
              style={!(isCurrent && isPlaying) ? { marginLeft: 1 } : undefined}
            />
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTitleRow}>
            <Text numberOfLines={1} style={[styles.cardTitle, isCurrent && { color: colors.accent }]}>
              {station.name}
            </Text>
            {offline ? (
              <View style={[styles.statusPill, styles.statusOffline]}>
                <View style={[styles.statusDot, { backgroundColor: colors.textDim }]} />
                <Text style={[styles.statusText, { color: colors.textMuted }]}>Offline</Text>
              </View>
            ) : live ? (
              <View style={[styles.statusPill, styles.statusLive]}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.statusText, { color: colors.success }]}>Live</Text>
              </View>
            ) : isCurrent ? (
              <View style={[styles.statusPill, styles.statusPlaying]}>
                <View style={[styles.statusDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.statusText, { color: colors.accent }]}>Playing</Text>
              </View>
            ) : null}
          </View>

          {station.description ? (
            <Text numberOfLines={1} style={styles.cardDesc}>
              {station.description}
            </Text>
          ) : null}

          {live ? (
            <View style={styles.onAirBox}>
              <View style={styles.onAirLabelRow}>
                <Ionicons name="radio" size={10} color={colors.accent} />
                <Text style={styles.onAirLabel}>On Air Now</Text>
              </View>
              <Text numberOfLines={1} style={styles.onAirTitle}>
                {station.current_track_title ||
                  station.current_program_title ||
                  'Live Program'}
              </Text>
              <Text numberOfLines={1} style={styles.onAirArtist}>
                By {station.current_track_artist || 'Broadcaster'}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.footerLoc}>
          <Ionicons name="location-outline" size={14} color={colors.textDim} />
          <Text numberOfLines={1} style={styles.footerLocText}>
            {location || 'No location set'}
          </Text>
        </View>
        {station.broadcast_frequency ? (
          <View style={styles.freqChip}>
            <Text style={styles.freqChipText}>{station.broadcast_frequency}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TILE_W,
    marginRight: 12,
  },
  tileCoverWrap: {
    width: TILE_W,
    height: TILE_W,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    marginBottom: 6,
  },
  tileCoverCurrent: {
    borderWidth: 2,
    borderColor: 'rgba(244, 63, 94, 0.5)',
  },
  tileCover: {
    width: '100%',
    height: '100%',
  },
  tileCoverDim: {
    opacity: 0.45,
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  offlineLabel: {
    color: '#e2e8f0',
    fontFamily: fonts.extrabold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  liveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: 'rgba(2,6,23,0.8)',
  },
  tileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 14,
  },
  tileName: {
    flex: 1,
    color: '#e2e8f0',
    fontFamily: fonts.bold,
    fontSize: 10,
  },
  tileFreq: {
    color: colors.textDim,
    fontFamily: fonts.semibold,
    fontSize: 9,
    maxWidth: 36,
  },
  tileLoc: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 9,
    marginTop: 2,
    height: 13,
  },

  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardCurrent: {
    borderColor: 'rgba(244, 63, 94, 0.3)',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  cardCoverWrap: {
    width: 88,
    height: 88,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCover: {
    width: '100%',
    height: '100%',
  },
  cardPlayBadge: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,23,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  statusOffline: {
    backgroundColor: 'rgba(100,116,139,0.1)',
    borderColor: 'rgba(100,116,139,0.2)',
  },
  statusLive: {
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderColor: 'rgba(52,211,153,0.2)',
  },
  statusPlaying: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontFamily: fonts.extrabold,
    fontSize: 8,
    textTransform: 'uppercase',
  },
  cardDesc: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginBottom: 8,
  },
  onAirBox: {
    backgroundColor: 'rgba(2,6,23,0.6)',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  onAirLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  onAirLabel: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  onAirTitle: {
    color: '#e2e8f0',
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  onAirArtist: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 2,
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  footerLoc: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  footerLocText: {
    flex: 1,
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 10,
  },
  freqChip: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  freqChipText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 8,
    textTransform: 'uppercase',
  },
});
