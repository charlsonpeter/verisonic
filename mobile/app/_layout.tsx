import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PlayerProvider } from '@/context/PlayerContext';
import { MiniPlayer } from '@/components/MiniPlayer';
import { colors } from '@/theme/tokens';

function AppShell({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {children}
      {!isLoading ? <MiniPlayer /> : null}
      {isLoading ? (
        <View style={[StyleSheet.absoluteFillObject, styles.boot]}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  return (
    <AuthProvider>
      <PlayerProvider>
        <StatusBar style="light" />
        <AppShell>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="now-playing"
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen name="profile" options={{ presentation: 'card', headerShown: false }} />
            <Stack.Screen name="search" options={{ presentation: 'card', headerShown: false }} />
          </Stack>
        </AppShell>
      </PlayerProvider>
    </AuthProvider>
  );
}
