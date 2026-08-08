import React, { useCallback, useState } from 'react';
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchListeningHistory, fetchTrending } from '@/api/endpoints';
import { DownloadButton } from '@/components/DownloadButton';
import { FavoriteButton } from '@/components/FavoriteButton';
import {
  EmptyState,
  LoadingBlock,
  Screen,
  SectionTitle,
  TrackRow,
  TrackTile,
} from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import type { Track } from '@/types/models';
import { colors, fonts, spacing } from '@/theme/tokens';

function chunkTiles(tracks: Track[], size = 9): Track[][] {
  const pages: Track[][] = [];
  for (let i = 0; i < tracks.length; i += size) {
    pages.push(tracks.slice(i, i + size));
  }
  return pages.length ? pages : [[]];
}

export default function HomeScreen() {
  const { playTrack } = usePlayer();
  const [trending, setTrending] = useState<Track[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [trend, history] = await Promise.all([
        fetchTrending(24),
        fetchListeningHistory(18, 0).catch(() => []),
      ]);
      setTrending(trend);
      setRecent(history.map((h) => h.track).filter(Boolean));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  const recentPages = chunkTiles(recent.slice(0, 18), 9);
  const trendingPages = chunkTiles(trending.slice(0, 18), 9);

  return (
    <Screen style={{ paddingBottom: 72 }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
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
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        {recent.length > 0 ? (
          <View style={styles.section}>
            <SectionTitle icon="time-outline">Recently Played</SectionTitle>
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {recentPages.map((page, pageIdx) => (
                <View key={`recent-${pageIdx}`} style={styles.tilePage}>
                  {page.map((track) => (
                    <TrackTile
                      key={track.id}
                      track={track}
                      onPress={() => void playTrack(track, recent)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionTitle icon="flame">Trending Now</SectionTitle>
          {trending.length === 0 ? (
            <EmptyState message="No trending tracks yet." />
          ) : (
            <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
              {trendingPages.map((page, pageIdx) => (
                <View key={`trend-${pageIdx}`} style={styles.tilePage}>
                  {page.map((track) => (
                    <TrackTile
                      key={track.id}
                      track={track}
                      onPress={() => void playTrack(track, trending)}
                    />
                  ))}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <SectionTitle icon="list">Quick play</SectionTitle>
            {trending.length > 0 ? (
              <Pressable onPress={() => void playTrack(trending[0], trending)}>
                <Text style={styles.playAll}>Play all</Text>
              </Pressable>
            ) : null}
          </View>
          {trending.length === 0 ? (
            <EmptyState message="Nothing to play yet." />
          ) : (
            trending.slice(0, 8).map((item, index) => (
              <TrackRow
                key={`list-${item.id}`}
                track={item}
                index={index}
                onPress={() => void playTrack(item, trending)}
                right={
                  <View style={styles.rowActions}>
                    <FavoriteButton trackId={item.id} />
                    <DownloadButton track={item} />
                  </View>
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  playAll: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tilePage: {
    width: Dimensions.get('window').width - 32,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginRight: 12,
  },
});
