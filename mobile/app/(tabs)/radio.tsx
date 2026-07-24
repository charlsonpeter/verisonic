import React, { useCallback, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchRadioStations } from '@/api/endpoints';
import { RadioTile } from '@/components/RadioStationViews';
import { EmptyState, LoadingBlock, Screen } from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import type { RadioStation } from '@/types/models';
import { colors, spacing } from '@/theme/tokens';

export default function RadioScreen() {
  const { playRadio, togglePlay, currentStation, isPlaying, mode } = usePlayer();
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setStations(await fetchRadioStations());
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

  const onStationPress = useCallback(
    (station: RadioStation) => {
      if (station.is_online === false) {
        Alert.alert('Station Offline', 'This radio station is currently offline.');
        return;
      }
      const isCurrent = mode === 'radio' && currentStation?.id === station.id;
      if (isCurrent) {
        void togglePlay();
        return;
      }
      void playRadio(station);
    },
    [currentStation?.id, mode, playRadio, togglePlay],
  );

  if (loading) {
    return (
      <Screen>
        <LoadingBlock />
      </Screen>
    );
  }

  return (
    <Screen style={{ paddingBottom: 72 }} withHeader>
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
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {stations.length === 0 ? (
          <EmptyState message="No live stations matching selection found." />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tileStrip}
            style={styles.tileStripWrap}
          >
            {stations.map((st) => {
              const isCurrent = mode === 'radio' && currentStation?.id === st.id;
              return (
                <RadioTile
                  key={st.id}
                  station={st}
                  isCurrent={!!isCurrent}
                  isPlaying={!!isCurrent && isPlaying}
                  onPress={() => onStationPress(st)}
                />
              );
            })}
          </ScrollView>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tileStripWrap: {
    marginHorizontal: -spacing.md,
  },
  tileStrip: {
    paddingHorizontal: spacing.md,
    paddingBottom: 4,
  },
});
