import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchSubscriptionPlans } from '@/api/endpoints';
import { noticeError, noticeSuccess } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { usePlayer } from '@/context/PlayerContext';
import { purchasePlan } from '@/services/razorpay';
import type { SubscriptionPlan } from '@/types/models';
import { colors, fonts, radii, spacing } from '@/theme/tokens';
import { formatInr } from '@/utils/accountTier';

export function PremiumModal() {
  const insets = useSafeAreaInsets();
  const { user, refreshUser, canPlayFull } = useAuth();
  const { showPremiumModal, setShowPremiumModal } = usePlayer();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const close = useCallback(() => setShowPremiumModal(false), [setShowPremiumModal]);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await fetchSubscriptionPlans();
      setPlans(list);
    } catch (e) {
      setPlans([]);
      setLoadError(e instanceof Error ? e.message : 'Could not load plans.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!showPremiumModal || canPlayFull) return;
    void loadPlans();
  }, [showPremiumModal, canPlayFull, loadPlans]);

  const onBuy = async (planId: string) => {
    if (!user) return;
    setBusyPlan(planId);
    try {
      const message = await purchasePlan(planId, user.email, user.full_name);
      await refreshUser();
      close();
      await noticeSuccess('Premium', message);
    } catch (e) {
      await noticeError('Checkout', e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setBusyPlan(null);
    }
  };

  if (!showPremiumModal || canPlayFull) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={close}
    >
      <View style={styles.backdrop} pointerEvents="box-none">
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View
          style={[
            styles.card,
            {
              marginTop: insets.top + 24,
              marginBottom: Math.max(insets.bottom, 24),
            },
          ]}
        >
          <Pressable onPress={close} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </Pressable>

          <View style={styles.iconWrap}>
            <Ionicons name="diamond" size={22} color="#0f172a" />
          </View>
          <Text style={styles.title}>Upgrade to Premium</Text>
          <Text style={styles.subtitle}>
            Free preview has ended. Pick a plan to keep listening — checkout opens here.
          </Text>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.plans}
          >
            {loading ? (
              <ActivityIndicator color={colors.premium} style={{ marginVertical: 24 }} />
            ) : null}

            {loadError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{loadError}</Text>
                <Button label="Retry" variant="ghost" onPress={() => void loadPlans()} />
              </View>
            ) : null}

            {!loading && !loadError
              ? plans.map((plan) => (
                  <View key={plan.id} style={styles.planCard}>
                    <Text style={styles.planLabel}>{plan.label}</Text>
                    {plan.description ? (
                      <Text style={styles.planDesc}>{plan.description}</Text>
                    ) : null}
                    <Text style={styles.planPrice}>{formatInr(plan.amount_rupees)}</Text>
                    <View style={{ marginTop: 12 }}>
                      <Button
                        label={busyPlan === plan.id ? 'Opening checkout…' : `Subscribe · ${formatInr(plan.amount_rupees)}`}
                        loading={busyPlan === plan.id}
                        disabled={!!busyPlan}
                        onPress={() => void onBuy(plan.id)}
                      />
                    </View>
                  </View>
                ))
              : null}

            {!loading && !loadError && !plans.length ? (
              <Text style={styles.planDesc}>Plans unavailable right now.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.78)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.bgMid,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.22)',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    maxHeight: '86%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    alignSelf: 'center',
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.premium,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.md,
    paddingHorizontal: 8,
  },
  plans: {
    paddingBottom: 8,
    gap: 10,
  },
  planCard: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  planLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  planDesc: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 4,
  },
  planPrice: {
    color: colors.premium,
    fontFamily: fonts.extrabold,
    fontSize: 18,
    marginTop: 8,
  },
  errorBox: {
    gap: 12,
    marginVertical: 8,
  },
  errorText: {
    color: colors.accent,
    fontFamily: fonts.medium,
    fontSize: 13,
    textAlign: 'center',
  },
});
