import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { colors } from '@/theme/tokens';

export default function AuthLayout() {
  const { token, isLoading } = useAuth();
  const router = useRouter();
  const sent = useRef(false);

  useEffect(() => {
    if (isLoading || sent.current || !token) return;
    sent.current = true;
    router.replace('/(tabs)');
  }, [token, isLoading]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
