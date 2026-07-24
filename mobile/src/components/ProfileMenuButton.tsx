import React, { useCallback, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import { colors, fonts } from '@/theme/tokens';
import { mediaUri } from '@/utils/mediaUrl';

const MENU_WIDTH = 228;

/** Top-right account menu — square edges except bottom-left radius. */
export function ProfileMenuButton() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout, tierLabel } = useAuth();
  const [open, setOpen] = useState(false);

  const initial = (user?.full_name || user?.email || 'V').trim().charAt(0).toUpperCase();
  const avatar = mediaUri(user?.profile_image_url);

  const close = useCallback(() => setOpen(false), []);

  const onProfile = () => {
    close();
    router.push('/profile');
  };

  const onSignOut = async () => {
    close();
    await logout();
    router.replace('/(auth)/login');
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.avatarBtn, pressed && { opacity: 0.85 }]}
        accessibilityLabel="Account menu"
      >
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarLetter}>{initial}</Text>
        )}
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <View style={styles.dismissLayer} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <View
            style={[
              styles.menu,
              {
                top: 0,
                right: 0,
                paddingTop: insets.top,
              },
            ]}
          >
            <View style={styles.userBlock}>
              {avatar ? (
                <Image source={{ uri: avatar }} style={styles.menuAvatar} />
              ) : (
                <View style={[styles.menuAvatar, styles.menuAvatarFallback]}>
                  <Text style={styles.menuAvatarLetter}>{initial}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={styles.userName}>
                  {user?.full_name || 'Listener'}
                </Text>
                <Text numberOfLines={1} style={styles.userEmail}>
                  {user?.email || ''}
                </Text>
                {tierLabel ? (
                  <Text numberOfLines={1} style={styles.userTier}>
                    {tierLabel}
                  </Text>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={onProfile}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Ionicons name="person-outline" size={16} color={colors.textMuted} />
              <Text style={styles.menuItemText}>My Profile</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              onPress={() => void onSignOut()}
              style={({ pressed }) => [styles.menuItem, pressed && styles.signOutPressed]}
            >
              <Ionicons name="log-out-outline" size={16} color={colors.accent} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarLetter: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  dismissLayer: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    width: MENU_WIDTH,
    backgroundColor: '#0f172a',
    // Only bottom-left is rounded — flush with top & right screen edges
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomLeftRadius: 16,
    borderWidth: 1,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 8 },
    elevation: 12,
  },
  userBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 4,
  },
  menuAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  menuAvatarFallback: {
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuAvatarLetter: {
    color: colors.textMuted,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  userName: {
    color: '#e2e8f0',
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  userEmail: {
    color: colors.textDim,
    fontFamily: fonts.medium,
    fontSize: 10,
    marginTop: 2,
  },
  userTier: {
    color: colors.accent,
    fontFamily: fonts.extrabold,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  menuItemText: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
    marginHorizontal: 8,
  },
  signOutPressed: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  signOutText: {
    color: colors.accent,
    fontFamily: fonts.semibold,
    fontSize: 12,
  },
});
