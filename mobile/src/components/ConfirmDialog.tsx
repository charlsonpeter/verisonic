import React, { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fonts, radii, spacing } from '@/theme/tokens';

export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive styling for the confirm action (delete / remove). */
  destructive?: boolean;
};

export type NoticeOptions = {
  title: string;
  message: string;
  buttonLabel?: string;
  variant?: 'default' | 'success' | 'error';
};

type PendingConfirm = ConfirmOptions & {
  kind: 'confirm';
  resolve: (value: boolean) => void;
};

type PendingNotice = NoticeOptions & {
  kind: 'notice';
  resolve: () => void;
};

type Pending = PendingConfirm | PendingNotice;

let setPendingExternal: ((p: Pending | null) => void) | null = null;

function enqueue(pending: Pending): void {
  if (!setPendingExternal) {
    if (pending.kind === 'confirm') pending.resolve(false);
    else pending.resolve();
    return;
  }
  setPendingExternal(pending);
}

/** Promise-based themed confirm. Resolves true if confirmed. */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    enqueue({ kind: 'confirm', ...options, resolve });
  });
}

/** Themed single-button message (success / error / info). */
export function notice(options: NoticeOptions): Promise<void> {
  return new Promise((resolve) => {
    enqueue({ kind: 'notice', ...options, resolve });
  });
}

export function noticeSuccess(title: string, message: string): Promise<void> {
  return notice({ title, message, variant: 'success', buttonLabel: 'OK' });
}

export function noticeError(title: string, message: string): Promise<void> {
  return notice({ title, message, variant: 'error', buttonLabel: 'OK' });
}

function centeredCardStyle() {
  const winW = Dimensions.get('window').width;
  const winH = Dimensions.get('window').height;
  const width = Math.min(340, winW - 48);
  return {
    position: 'absolute' as const,
    left: (winW - width) / 2,
    // Slightly above true center — looks more natural; avoids flex first-frame jump.
    top: Math.max(80, winH * 0.32),
    width,
  };
}

/** Mount once near the app root (inside providers). */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    setPendingExternal = setPending;
    return () => {
      setPendingExternal = null;
    };
  }, []);

  const dismiss = useCallback((confirmed: boolean) => {
    setPending((current) => {
      if (!current) return null;
      if (current.kind === 'confirm') current.resolve(confirmed);
      else current.resolve();
      return null;
    });
  }, []);

  const onRequestClose = () => dismiss(false);
  const cardPos = centeredCardStyle();

  return (
    <Modal
      visible={!!pending}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onRequestClose}
    >
      {pending ? (
        <View style={styles.backdrop} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
          <View style={[styles.card, cardPos]}>
            {pending.kind === 'notice' ? (
              <View
                style={[
                  styles.accentBar,
                  {
                    backgroundColor:
                      pending.variant === 'success'
                        ? colors.success
                        : pending.variant === 'error'
                          ? colors.accentStrong
                          : colors.accent,
                  },
                ]}
              />
            ) : null}

            <Text style={styles.title}>{pending.title}</Text>
            <Text style={styles.message}>{pending.message}</Text>

            {pending.kind === 'notice' ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => dismiss(true)}
                  style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.btnPressed]}
                >
                  <Text style={styles.btnPrimaryText}>{pending.buttonLabel || 'OK'}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.actions}>
                <Pressable
                  onPress={() => dismiss(false)}
                  style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
                >
                  <Text style={styles.btnGhostText}>{pending.cancelLabel || 'Cancel'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => dismiss(true)}
                  style={({ pressed }) => [
                    styles.btn,
                    pending.destructive ? styles.btnDanger : styles.btnPrimary,
                    pressed && styles.btnPressed,
                  ]}
                >
                  <Text
                    style={pending.destructive ? styles.btnDangerText : styles.btnPrimaryText}
                  >
                    {pending.confirmLabel || (pending.destructive ? 'Delete' : 'Confirm')}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.72)',
  },
  card: {
    backgroundColor: colors.bgMid,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  title: {
    color: colors.text,
    fontFamily: fonts.extrabold,
    fontSize: 17,
    marginBottom: 8,
  },
  message: {
    color: colors.textMuted,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    minWidth: 88,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnGhost: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  btnGhostText: {
    color: colors.textMuted,
    fontFamily: fonts.semibold,
    fontSize: 13,
  },
  btnPrimary: {
    backgroundColor: colors.accentStrong,
  },
  btnPrimaryText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  btnDanger: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  btnDangerText: {
    color: colors.accentStrong,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
});
