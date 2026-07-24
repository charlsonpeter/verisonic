import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme/tokens';

/** One-shot entry route — never use <Redirect> (re-fires on parent re-render). */
export default function Index() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const didRedirect = useRef(false);

  useEffect(() => {
    if (isLoading || didRedirect.current) return;
    didRedirect.current = true;
    router.replace(token ? '/(tabs)' : '/(auth)/login');
  }, [isLoading, token]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}
