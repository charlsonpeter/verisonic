import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '@/context/PlayerContext';
import { colors } from '@/theme/tokens';

export function FavoriteButton({ trackId }: { trackId: number }) {
  const { favoriteIds, toggleFavorite } = usePlayer();
  const isFav = favoriteIds.has(trackId);
  return (
    <Pressable onPress={() => void toggleFavorite(trackId)} hitSlop={10}>
      <Ionicons
        name={isFav ? 'heart' : 'heart-outline'}
        size={20}
        color={isFav ? colors.accentStrong : colors.textMuted}
      />
    </Pressable>
  );
}
