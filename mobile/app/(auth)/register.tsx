import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const { register, error, clearError } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    clearError();
    setLoading(true);
    await register(email, password, fullName);
    setLoading(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <LinearGradient
        pointerEvents="none"
        colors={['#0f172a', '#020617', '#000000']}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
      >
        <View style={styles.card}>
          <View pointerEvents="none" style={styles.glow} />
          <Text style={styles.brand}>VeriSonic</Text>
          <Text style={styles.heading}>Create Audiophile Account</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={16} color={colors.accent} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Display Name</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={16} color={colors.textDim} />
            <TextInput
              autoCorrect={false}
              textContentType="name"
              autoComplete="name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Your name"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
          </View>

          <Text style={styles.label}>Email</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="mail-outline" size={16} color={colors.textDim} />
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@email.com"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
          </View>

          <Text style={styles.label}>Password</Text>
          <View style={styles.inputWrap}>
            <Ionicons name="key-outline" size={16} color={colors.textDim} />
            <TextInput
              secureTextEntry
              textContentType="newPassword"
              autoComplete="password-new"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
          </View>

          <Button label="Create account" onPress={() => void onSubmit()} loading={loading} />

          <Text style={styles.footer}>
            Already have an account?{' '}
            <Link href="/(auth)/login" style={styles.link}>
              Sign in
            </Link>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  center: { flex: 1, justifyContent: 'center' },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -40,
    left: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
  },
  brand: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 13,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.3,
    marginBottom: spacing.lg,
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 11,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  input: {
    flex: 1,
    color: colors.text,
    // Avoid custom fontFamily on TextInput — breaks typing on Android.
    fontSize: 14,
    padding: 0,
    minHeight: 22,
  },
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: radii.md,
    padding: 12,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    color: colors.accent,
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
  footer: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  link: {
    color: colors.accent,
    fontFamily: fonts.bold,
  },
});
