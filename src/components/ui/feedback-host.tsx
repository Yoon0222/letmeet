import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppColors, AppSpacing, Radius, Shadows } from '@/theme';
import {
  getFeedbackState,
  pressDialogButton,
  subscribeFeedback,
  type FeedbackButton,
  type ToastKind,
} from '@/lib/feedback';

const TOAST_BG: Record<ToastKind, string> = {
  info: '#111827',
  success: AppColors.primary,
  error: AppColors.dangerText,
};

/**
 * 인앱 피드백 렌더러 — 루트에 한 번 마운트한다.
 * feedback 스토어(토스트/다이얼로그)를 구독해 화면 위에 겹쳐 그린다.
 */
export function FeedbackHost() {
  const state = useSyncExternalStore(subscribeFeedback, getFeedbackState, getFeedbackState);
  const dialog = state.dialog;

  // 버튼 2개(취소+확인 형태)면 가로 배치, 그 외엔 세로 목록.
  const twoUp = !!dialog && dialog.buttons.length === 2;

  return (
    <>
      {/* 토스트 — 하단 중앙, 자동 사라짐 */}
      {state.toasts.length > 0 ? (
        <SafeAreaView pointerEvents="box-none" style={styles.toastLayer} edges={['bottom']}>
          {state.toasts.map((t) => (
            <View key={t.id} style={[styles.toast, { backgroundColor: TOAST_BG[t.kind] }]}>
              <Text style={styles.toastText}>{t.message}</Text>
            </View>
          ))}
        </SafeAreaView>
      ) : null}

      {/* 다이얼로그 */}
      <Modal
        visible={!!dialog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          const cancel = dialog?.buttons.find((b) => b.style === 'cancel');
          if (cancel) pressDialogButton(cancel);
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.card}>
            {dialog?.title ? <Text style={styles.title}>{dialog.title}</Text> : null}
            {dialog?.message ? <Text style={styles.message}>{dialog.message}</Text> : null}

            <View style={[styles.buttons, twoUp && styles.buttonsRow]}>
              {dialog?.buttons.map((b, i) => (
                <DialogButton key={i} btn={b} flex={twoUp} />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DialogButton({ btn, flex }: { btn: FeedbackButton; flex: boolean }) {
  const destructive = btn.style === 'destructive';
  const cancel = btn.style === 'cancel';

  const bg = cancel ? AppColors.background : destructive ? AppColors.dangerText : AppColors.primary;
  const fg = cancel ? AppColors.textSecondary : '#FFFFFF';

  return (
    <Pressable
      onPress={() => pressDialogButton(btn)}
      style={({ pressed }) => [
        styles.button,
        flex && { flex: 1 },
        cancel && styles.buttonCancel,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{btn.text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: AppSpacing.md,
    paddingHorizontal: AppSpacing.sm,
    gap: AppSpacing.xs,
  },
  toast: {
    maxWidth: 480,
    paddingHorizontal: AppSpacing.sm,
    paddingVertical: 13,
    borderRadius: Radius.input,
    borderCurve: 'continuous',
    ...Shadows.subtle,
  },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: AppColors.surface,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
    paddingTop: AppSpacing.md,
    paddingHorizontal: AppSpacing.md,
    paddingBottom: AppSpacing.sm,
    ...Shadows.subtle,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: AppColors.textPrimary,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    color: AppColors.textSecondary,
    textAlign: 'center',
    marginTop: AppSpacing.xs,
  },
  buttons: {
    marginTop: AppSpacing.md,
    gap: 10,
  },
  buttonsRow: {
    flexDirection: 'row',
  },
  button: {
    height: 50,
    borderRadius: Radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppSpacing.sm,
  },
  buttonCancel: {
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
