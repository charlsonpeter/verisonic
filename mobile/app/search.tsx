import React, { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { searchMusic } from '@/api/endpoints';
import { DownloadButton } from '@/components/DownloadButton';
import { FavoriteButton } from '@/components/FavoriteButton';
import { EmptyState, TrackRow } from '@/components/ui';
import { usePlayer } from '@/context/PlayerContext';
import type { Track } from '@/types/models';
import { colors, radii, spacing } from '@/theme/tokens';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playTrack } = usePlayer();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      setSearching(true);
      void searchMusic(q)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [term]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0f172a', '#020617', '#000000']} style={StyleSheet.absoluteFill} />
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={16} color={colors.textDim} />
          <TextInput
            value={term}
            onChangeText={setTerm}
            placeholder="Song, artist, album…"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="none"
            autoFocus
          />
          {term.length > 0 ? (
            <Pressable onPress={() => setTerm('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textDim} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <EmptyState
            message={
              term.trim().length < 2
                ? 'Type at least 2 characters'
                : searching
                  ? 'Searching…'
                  : 'No matches'
            }
          />
        }
        renderItem={({ item, index }) => (
          <TrackRow
            track={item}
            index={index}
            onPress={() => void playTrack(item, results)}
            right={
              <View style={styles.rowActions}>
                <FavoriteButton trackId={item.id} />
                <DownloadButton track={item} />
              </View>
            }
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  backBtn: {
    padding: 2,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    padding: 0,
  },
  list: {
    flex: 1,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
