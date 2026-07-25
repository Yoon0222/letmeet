import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  getFeedbackState,
  pressDialogButton,
  subscribeFeedback,
  type FeedbackButton,
  type ToastKind,
} from '@/lib/feedback';

/**
 * 인앱 피드백 렌더러 — 루트에 한 번 마운트한다.
 * feedback 스토어(토스트/다이얼로그)를 구독해 화면 위에 겹쳐 그린다.
 */
export function FeedbackHost() {
  const theme = useTheme();
  const state = useSyncExternalStore(subscribeFeedback, getFeedbackState, getFeedbackState);

  const toastColor = (kind: ToastKind) =>
    kind === 'error' ? Brand.danger : kind === 'success' ? theme.primary : '#111827';

  return (
    <>
      {/* 토스트 — 하단 중앙, 자동 사라짐 */}
      {state.toasts.length > 0 ? (
        <SafeAreaView pointerEvents="box-none" style={styles.toastLayer} edges={['bottom']}>
          {state.toasts.map((t) => (
            <View key={t.id} style={[styles.toast, { backgroundColor: toastColor(t.kind) }]}>
              <Text style={styles.toastText}>{t.message}</Text>
            </View>
          ))}
        </SafeAreaView>
      ) : null}

      {/* 다이얼로그 — 버튼 목록(확인/취소·액션시트) */}
      <Modal
        visible={!!state.dialog}
        transparent
        animationType="fade"
        onRequestClose={() => {
          // 안드로이드 뒤로가기 = 취소 버튼이 있으면 그것으로, 없으면 닫기만
          const cancel = state.dialog?.buttons.find((b) => b.style === 'cancel');
          if (cancel) pressDialogButton(cancel);
        }}
      >
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.card }]}>
            {state.dialog?.title ? (
              <Text style={[styles.title, { color: theme.text }]}>{state.dialog.title}</Text>
            ) : null}
            {state.dialog?.message ? (
              <Text style={[styles.message, { color: theme.textSecondary }]}>
                {state.dialog.message}
              </Text>
            ) : null}
            <View style={styles.buttons}>
              {state.dialog?.buttons.map((b, i) => (
                <DialogButton key={i} btn={b} theme={theme} />
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function DialogButton({
  btn,
  theme,
}: {
  btn: FeedbackButton;
  theme: ReturnType<typeof useTheme>;
}) {
  const destructive = btn.style === 'destructive';
  const cancel = btn.style === 'cancel';
  return (
    <Pressable
      onPress={() => pressDialogButton(btn)}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: cancel ? theme.background : destructive ? Brand.danger : theme.primary,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          { color: cancel ? theme.textSecondary : '#FFFFFF' },
        ]}
      >
        {btn.text}
      </Text>
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
    paddingBottom: Spacing.three,
    gap: Spacing.one,
  },
  toast: {
    maxWidth: '90%',
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  title: { fontSize: 17, fontWeight: '800' },
  message: { fontSize: 14, lineHeight: 20 },
  buttons: { gap: Spacing.one, marginTop: Spacing.one },
  button: {
    paddingVertical: 13,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
});
