import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  downloadTrack,
  isDownloaded,
  removeDownload,
} from '@/services/downloads';
import type { Track } from '@/types/models';
import { colors } from '@/theme/tokens';

export function DownloadButton({ track }: { track: Track }) {
  const { canPlayFull, isPremium } = useAuth();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void isDownloaded(track.id).then((v) => {
      if (alive) setSaved(v);
    });
    return () => {
      alive = false;
    };
  }, [track.id]);

  const onPress = async () => {
    if (!canPlayFull) {
      Alert.alert('Premium required', 'Download and offline playback need Premium or an active free trial.');
      return;
    }
    setBusy(true);
    try {
      if (saved) {
        await removeDownload(track.id);
        setSaved(false);
      } else {
        await downloadTrack(track, isPremium);
        setSaved(true);
      }
    } catch (e) {
      Alert.alert('Download', e instanceof Error ? e.message : 'Could not download track');
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return <ActivityIndicator color={colors.accent} style={{ width: 28 }} />;
  }

  return (
    <Pressable onPress={() => void onPress()} hitSlop={10}>
      <Ionicons
        name={saved ? 'cloud-done' : 'cloud-download-outline'}
        size={22}
        color={saved ? colors.accent : colors.textMuted}
      />
    </Pressable>
  );
}
