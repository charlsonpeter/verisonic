import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { colors, fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (isLoading || sent.current || token) return;
    sent.current = true;
    router.replace('/(auth)/login');
  }, [token, isLoading]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#020617',
            borderTopColor: 'rgba(255,255,255,0.05)',
            height: 58,
            paddingBottom: 6,
            paddingTop: 4,
          },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textDim,
          tabBarLabelStyle: {
            fontFamily: fonts.semibold,
            fontSize: 9,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'compass' : 'compass-outline'}
                color={color}
                size={focused ? 23 : 21}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="radio"
          options={{
            title: 'Radio',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'radio' : 'radio-outline'}
                color={color}
                size={focused ? 23 : 21}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="favorites"
          options={{
            title: 'Favorites',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'heart' : 'heart-outline'}
                color={color}
                size={focused ? 23 : 21}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="playlists"
          options={{
            title: 'Playlists',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons
                name={focused ? 'folder' : 'folder-outline'}
                color={color}
                size={focused ? 23 : 21}
              />
            ),
          }}
        />
        <Tabs.Screen name="library" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
