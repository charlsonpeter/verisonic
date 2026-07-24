import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import type { RadioStation, Track } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import { formatDuration } from '@/utils/accountTier';
import { coverUri } from '@/utils/mediaUrl';

export function Screen({
  children,
  style,
  withHeader = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  withHeader?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screenRoot, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={['#0f172a', '#020617', '#000000']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {withHeader ? <AppHeader /> : null}
      <View style={[styles.screenBody, style]}>{children}</View>
    </View>
  );
}

export function AppHeader() {
  const router = useRouter();

  return (
    <View style={styles.header}>
      <Text style={styles.brand}>VeriSonic</Text>
      <View style={styles.headerActions}>
        <Pressable
          onPress={() => router.push('/search')}
          hitSlop={10}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="search" size={20} color={colors.text} />
        </Pressable>
        <ProfileMenuButton />
      </View>
    </View>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function SectionTitle({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.sectionTitleRow}>
      {icon ? <Ionicons name={icon} size={18} color={colors.accent} /> : null}
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

export function Subtitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && { opacity: 0.88 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

export function TrackTile({
  track,
  onPress,
}: {
  track: Track;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.88 }]}>
      <Image source={{ uri: coverUri(track.cover_art_url) }} style={styles.tileCover} />
      <Text numberOfLines={1} style={styles.tileTitle}>
        {track.title}
      </Text>
      <Text numberOfLines={1} style={styles.tileMeta}>
        {track.artist_name_override || track.artist_name}
      </Text>
    </Pressable>
  );
}

export function TrackRow({
  track,
  onPress,
  onLongPress,
  delayLongPress,
  disabled,
  right,
  index,
}: {
  track: Track;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  disabled?: boolean;
  right?: React.ReactNode;
  index?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, pressed && !disabled && { opacity: 0.88 }]}
    >
      {typeof index === 'number' ? (
        <Text style={styles.rowIndex}>{String(index + 1).padStart(2, '0')}</Text>
      ) : null}
      <Image source={{ uri: coverUri(track.cover_art_url) }} style={styles.cover} />
      <View style={styles.rowBody}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {track.artist_name_override || track.artist_name}
          {track.duration ? ` · ${formatDuration(track.duration)}` : ''}
        </Text>
      </View>
      {right}
    </Pressable>
  );
}

export function StationRow({
  station,
  onPress,
}: {
  station: RadioStation;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stationCard, pressed && { opacity: 0.9, borderColor: colors.accentBorder }]}
    >
      <Image source={{ uri: coverUri(station.cover_art_url) }} style={styles.stationCover} />
      <View style={styles.rowBody}>
        <View style={styles.stationTitleRow}>
          <Text numberOfLines={1} style={styles.rowTitle}>
            {station.name}
          </Text>
          {station.is_online ? (
            <View style={styles.livePill}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          ) : null}
        </View>
        <Text numberOfLines={2} style={styles.rowMeta}>
          {[station.current_program_title, station.city, station.broadcast_frequency]
            .filter(Boolean)
            .join(' · ') || station.category || 'Radio station'}
        </Text>
      </View>
      <Ionicons name="radio-outline" size={20} color={colors.accent} />
    </Pressable>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function LoadingBlock() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screenBody: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 20,
    letterSpacing: -0.3,
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontFamily: fonts.extrabold,
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 17,
    fontFamily: fonts.extrabold,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontFamily: fonts.medium,
    marginBottom: spacing.lg,
  },
  button: {
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accentStrong,
  },
  buttonGhost: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDanger: {
    backgroundColor: colors.danger,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tile: {
    width: '31%',
    marginBottom: 10,
  },
  tileCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    marginBottom: 6,
  },
  tileTitle: {
    color: colors.text,
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  tileMeta: {
    color: colors.textDim,
    fontSize: 10,
    fontFamily: fonts.medium,
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  rowIndex: {
    width: 22,
    color: colors.textDim,
    fontFamily: fonts.bold,
    fontSize: 11,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  rowMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontFamily: fonts.medium,
    marginTop: 2,
  },
  stationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stationCover: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.bg,
  },
  stationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  livePill: {
    backgroundColor: colors.accentStrong,
    borderRadius: radii.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveText: {
    color: colors.text,
    fontSize: 9,
    fontFamily: fonts.extrabold,
  },
  empty: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    fontFamily: fonts.medium,
    fontSize: 13,
  },
});
