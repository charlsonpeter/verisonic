import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  changePassword,
  fetchSubscriptionPlans,
  updateProfile,
} from '@/api/endpoints';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import { purchasePlan } from '@/services/razorpay';
import type { SubscriptionPlan } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import {
  formatInr,
  hasPaidSubscription,
  isOnFreeTrial,
  parseServerDateTime,
} from '@/utils/accountTier';
import { mediaUri } from '@/utils/mediaUrl';

function formatProfileDate(iso?: string | null): string {
  if (!iso) return '';
  const d = parseServerDateTime(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, tierLabel, refreshUser, isPremium } = useAuth();
  const { favoriteIds } = usePlayer();

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );
  const [savingPassword, setSavingPassword] = useState(false);

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void fetchSubscriptionPlans()
        .then(setPlans)
        .catch(() => setPlans([]));
    }, []),
  );

  const paid = hasPaidSubscription(user);
  const trial = isOnFreeTrial(user);
  const avatar = mediaUri(user?.profile_image_url);
  const initial = (user?.full_name || user?.email || 'V').trim().charAt(0).toUpperCase();

  const stats = useMemo(() => {
    const uniques = favoriteIds.size;
    return [
      { label: 'Accumulated Streamings', val: String(uniques * 3), desc: 'Plays recorded' },
      { label: 'Unique tracks audited', val: String(uniques), desc: 'Acoustic signatures' },
      {
        label: 'Bandwidth consumed',
        val: `${(uniques * 0.05).toFixed(2)} GB`,
        desc: 'Lossless packet streams',
      },
      {
        label: 'Avg streaming resolution',
        val: uniques > 0 ? '1,411 kbps' : 'N/A',
        desc: 'Active format depth',
      },
    ];
  }, [favoriteIds.size]);

  const onSaveProfile = async () => {
    if (!fullName.trim() || !email.trim()) {
      setProfileMsg({ type: 'error', text: 'Display Name and Email are required.' });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      await updateProfile(fullName.trim(), email.trim().toLowerCase());
      await refreshUser();
      setProfileMsg({ type: 'success', text: 'Profile details saved successfully!' });
    } catch (e) {
      setProfileMsg({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to update user profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const closePassword = () => {
    setPasswordOpen(false);
    setPasswordMsg(null);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const onChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'All password fields are required.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      await changePassword(oldPassword, newPassword);
      setPasswordMsg({ type: 'success', text: 'Password updated successfully!' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setPasswordMsg({
        type: 'error',
        text: e instanceof Error ? e.message : 'Failed to change password.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const onBuy = async (planId: string) => {
    if (!user) return;
    setBusyPlan(planId);
    try {
      const message = await purchasePlan(planId, user.email, user.full_name);
      await refreshUser();
      Alert.alert('Premium', message);
    } catch (e) {
      Alert.alert('Checkout', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0f172a', '#020617', '#000000']} style={StyleSheet.absoluteFill} />

      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Profile</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* 1. Profile header card */}
        <View style={styles.headerCard}>
          <View style={styles.headerGlow} />
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.headerAvatar} />
          ) : (
            <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
              <Text style={styles.headerInitial}>{initial}</Text>
            </View>
          )}
          <View style={styles.headerMeta}>
            <Text style={styles.headerName}>{user?.full_name || 'Guest User'}</Text>
            <View
              style={[
                styles.tierBadge,
                paid
                  ? styles.tierPaid
                  : trial
                    ? styles.tierTrial
                    : styles.tierFree,
              ]}
            >
              <Text
                style={[
                  styles.tierBadgeText,
                  {
                    color: paid ? colors.accent : trial ? '#fbbf24' : colors.textDim,
                  },
                ]}
              >
                {tierLabel}
              </Text>
            </View>
            <Text style={styles.headerEmail}>{user?.email}</Text>
            {paid ? (
              <View style={styles.subDates}>
                {user?.subscription_activated_at ? (
                  <View style={styles.dateCard}>
                    <Text style={styles.dateLabel}>Subscribed from</Text>
                    <Text style={styles.dateValue}>
                      {formatProfileDate(user.subscription_activated_at)}
                    </Text>
                  </View>
                ) : null}
                {user?.subscription_expires_at ? (
                  <View style={styles.dateCard}>
                    <Text style={styles.dateLabel}>Renew on</Text>
                    <Text style={[styles.dateValue, { color: '#fda4af' }]}>
                      {formatProfileDate(user.subscription_expires_at)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>

        {/* 2. Stats */}
        <View style={styles.sectionHead}>
          <Ionicons name="pulse" size={14} color={colors.accent} />
          <Text style={styles.sectionHeadText}>Audiophile Stream Analytics</Text>
        </View>
        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statVal}>{stat.val}</Text>
              <Text style={styles.statDesc}>{stat.desc}</Text>
            </View>
          ))}
        </View>

        {/* 3. Account settings */}
        <View style={styles.settingsWrap}>
          <View style={styles.sectionHead}>
            <Ionicons name="settings-outline" size={14} color={colors.accent} />
            <Text style={styles.sectionHeadText}>Account Settings</Text>
          </View>

          {profileMsg ? (
            <View
              style={[
                styles.msgBox,
                profileMsg.type === 'success' ? styles.msgOk : styles.msgErr,
              ]}
            >
              <Text
                style={[
                  styles.msgText,
                  { color: profileMsg.type === 'success' ? colors.success : colors.accent },
                ]}
              >
                {profileMsg.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.settingsCard}>
            <View style={styles.settingsCardHead}>
              <Text style={styles.settingsCardTitle}>Update Profile Details</Text>
              <Pressable
                onPress={() => {
                  setPasswordMsg(null);
                  setPasswordOpen(true);
                }}
                style={styles.pwBtn}
              >
                <Ionicons name="key-outline" size={12} color={colors.accent} />
                <Text style={styles.pwBtnText}>Change Password</Text>
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Display Name</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Email Address</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
          </View>

          <Pressable
            onPress={() => void onSaveProfile()}
            disabled={savingProfile}
            style={({ pressed }) => [
              styles.saveBtn,
              savingProfile && { opacity: 0.5 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.saveBtnText}>
              {savingProfile ? 'Saving Details...' : 'Save Profile Details'}
            </Text>
          </Pressable>
        </View>

        {/* Premium (mobile checkout) */}
        {!isPremium ? (
          <View style={styles.premiumSection}>
            <View style={styles.sectionHead}>
              <Ionicons name="diamond" size={14} color="#fbbf24" />
              <Text style={[styles.sectionHeadText, { color: '#fbbf24' }]}>Go Premium</Text>
            </View>
            {plans.map((plan) => (
              <View key={plan.id} style={styles.planCard}>
                <Text style={styles.planLabel}>{plan.label}</Text>
                <Text style={styles.planDesc}>{plan.description}</Text>
                <Text style={styles.planPrice}>{formatInr(plan.amount_rupees)}</Text>
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="Buy"
                    loading={busyPlan === plan.id}
                    onPress={() => void onBuy(plan.id)}
                  />
                </View>
              </View>
            ))}
            {!plans.length ? (
              <Text style={styles.planDesc}>Plans unavailable right now.</Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Change password modal */}
      <Modal
        visible={passwordOpen}
        transparent
        animationType="fade"
        onRequestClose={closePassword}
      >
        <Pressable style={styles.modalBackdrop} onPress={closePassword}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHead}>
              <Ionicons name="key" size={16} color={colors.accent} />
              <Text style={styles.modalTitle}>Change Password</Text>
            </View>

            {passwordMsg ? (
              <View
                style={[
                  styles.msgBox,
                  passwordMsg.type === 'success' ? styles.msgOk : styles.msgErr,
                ]}
              >
                <Text
                  style={[
                    styles.msgText,
                    { color: passwordMsg.type === 'success' ? colors.success : colors.accent },
                  ]}
                >
                  {passwordMsg.text}
                </Text>
              </View>
            ) : null}

            <Text style={styles.fieldLabel}>Current Password</Text>
            <TextInput
              secureTextEntry
              value={oldPassword}
              onChangeText={setOldPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>New Password</Text>
            <TextInput
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />
            <Text style={styles.fieldLabel}>Confirm New Password</Text>
            <TextInput
              secureTextEntry
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              style={styles.input}
            />

            <View style={styles.modalActions}>
              <Button label="Cancel" variant="ghost" onPress={closePassword} />
              <Button
                label={savingPassword ? 'Updating...' : 'Update Password'}
                loading={savingPassword}
                onPress={() => void onChangePassword()}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  topTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },

  headerCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  headerGlow: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  headerAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    marginBottom: 14,
  },
  headerAvatarFallback: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInitial: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 32,
  },
  headerMeta: {
    alignItems: 'center',
    width: '100%',
  },
  headerName: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 22,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  tierBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  tierPaid: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  tierTrial: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  tierFree: {
    backgroundColor: '#020617',
    borderColor: colors.border,
  },
  tierBadgeText: {
    fontFamily: fonts.extrabold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  headerEmail: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 12,
    marginTop: 8,
  },
  subDates: {
    width: '100%',
    marginTop: 14,
    gap: 8,
  },
  dateCard: {
    backgroundColor: 'rgba(2,6,23,0.5)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateLabel: {
    color: colors.textDim,
    fontFamily: fonts.bold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dateValue: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
    marginTop: 4,
  },

  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionHeadText: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.lg,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  statLabel: {
    color: colors.textDim,
    fontFamily: fonts.bold,
    fontSize: 9,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statVal: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 18,
  },
  statDesc: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 9,
    marginTop: 6,
  },

  settingsWrap: {
    backgroundColor: 'rgba(15,23,42,0.35)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  settingsCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  settingsCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  settingsCardTitle: {
    color: colors.accent,
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    flex: 1,
  },
  pwBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pwBtnText: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 9,
    textTransform: 'uppercase',
  },
  fieldLabel: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 13,
    marginBottom: 12,
  },
  saveBtn: {
    alignSelf: 'center',
    backgroundColor: colors.accentStrong,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  saveBtnText: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  msgBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  msgOk: {
    backgroundColor: 'rgba(52,211,153,0.1)',
    borderColor: 'rgba(52,211,153,0.25)',
  },
  msgErr: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  msgText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
  },

  premiumSection: {
    marginBottom: spacing.lg,
  },
  planCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  planLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
  },
  planDesc: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
    fontFamily: fonts.medium,
  },
  planPrice: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    marginTop: 8,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  modalTitle: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
