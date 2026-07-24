import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchFavorites } from '@/api/endpoints';
import { DownloadButton } from '@/components/DownloadButton';
import { FavoriteButton } from '@/components/FavoriteButton';
import { EmptyState, LoadingBlock, Screen, TrackRow } from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import type { Track } from '@/types/models';
import { colors, fonts, spacing } from '@/theme/tokens';

export default function FavoritesScreen() {
  const { playTrack, refreshLibraryState } = usePlayer();
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await fetchFavorites();
      setFavorites(rows);
      await refreshLibraryState();
    } catch {
      setFavorites([]);
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

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingBottom: 140 }}>
      {favorites.length > 0 ? (
        <View style={styles.top}>
          <Pressable onPress={() => void playTrack(favorites[0], favorites)}>
            <Text style={styles.playAll}>Play all</Text>
          </Pressable>
        </View>
      ) : null}
      <FlatList
        data={favorites}
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
        ListEmptyComponent={<EmptyState message="No favorites yet. Heart tracks while listening." />}
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            onPress={() => void playTrack(item, favorites)}
            right={
              <View style={styles.rowActions}>
                <FavoriteButton trackId={item.id} />
                <DownloadButton track={item} />
              </View>
            }
          />
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: spacing.sm,
  },
  playAll: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
