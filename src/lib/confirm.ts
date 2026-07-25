import { confirmAsync } from '@/lib/feedback';

/**
 * 파괴적 동작(로그아웃·탈퇴·취소) 확인.
 * 인앱 다이얼로그(FeedbackHost)로 처리한다 — 네이티브·웹 모두 동작.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
) {
  confirmAsync({ title, message, confirmText, destructive: true }).then((ok) => {
    if (ok) onConfirm();
  });
}
