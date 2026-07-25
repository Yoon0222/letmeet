// 인앱 피드백 시스템 — OS 의 Alert.alert 대체.
//
// Alert.alert 은 웹(react-native-web)에서 no-op 이라 확인창·안내가 아예 안 뜬다.
// 여기서 토스트(자동 사라짐 안내)와 다이얼로그(버튼 목록)를 자체 UI 로 제공하고,
// Alert.alert 과 시그니처가 같은 드롭인 대체 AppAlert 를 둔다 →
// 각 화면은 import 한 줄만 바꾸면 되고(호출부는 그대로), 웹에서도 동작한다.
//
// 렌더는 <FeedbackHost/>(루트에 1개)가 이 스토어를 구독해서 그린다.

export type ToastKind = 'info' | 'success' | 'error';

// react-native 의 AlertButton 과 동일 형태(그대로 넘겨받는다).
// text 는 RN AlertButton 과 맞춰 optional — 렌더 시 빈 값은 무시한다.
export type FeedbackButton = {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type Toast = { id: number; message: string; kind: ToastKind };
export type Dialog = { id: number; title: string; message?: string; buttons: FeedbackButton[] };

type State = { toasts: Toast[]; dialog: Dialog | null };

let state: State = { toasts: [], dialog: null };
const listeners = new Set<() => void>();
let seq = 0;

function emit() {
  state = { ...state };
  listeners.forEach((l) => l());
}

export function subscribeFeedback(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function getFeedbackState(): State {
  return state;
}

// ── 토스트 ────────────────────────────────────────────────
const TOAST_MS = 2800;

export function toast(message: string, kind: ToastKind = 'info') {
  const id = ++seq;
  state.toasts = [...state.toasts, { id, message, kind }];
  emit();
  setTimeout(() => dismissToast(id), TOAST_MS);
}
export function dismissToast(id: number) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  emit();
}

// ── 다이얼로그(버튼 목록) ─────────────────────────────────
function showDialog(d: Omit<Dialog, 'id'>) {
  state.dialog = { id: ++seq, ...d };
  emit();
}
// 버튼을 눌렀을 때: 다이얼로그 닫고 콜백 실행
export function pressDialogButton(btn: FeedbackButton) {
  state.dialog = null;
  emit();
  btn.onPress?.();
}

/** async/await 로 쓰는 확인 다이얼로그. resolve(true=확인, false=취소) */
export function confirmAsync(opts: {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    showDialog({
      title: opts.title,
      message: opts.message,
      buttons: [
        { text: opts.cancelText ?? '취소', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirmText ?? '확인',
          style: opts.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
    });
  });
}

// ── Alert.alert 드롭인 대체 ───────────────────────────────
// 버튼 0~1개 = 단순 안내 → 토스트. 2개 이상 = 선택 → 다이얼로그.
function kindFromTitle(title: string): ToastKind {
  if (/실패|오류|error|에러/i.test(title)) return 'error';
  if (/완료|성공|접수|저장|등록/.test(title)) return 'success';
  return 'info';
}

export const AppAlert = {
  alert(title: string, message?: string, buttons?: FeedbackButton[]) {
    if (!buttons || buttons.length <= 1) {
      const only = buttons?.[0];
      toast(message ? `${title} — ${message}` : title, kindFromTitle(title));
      only?.onPress?.(); // 단일버튼 안내의 후속(예: 확인 후 뒤로가기)은 그대로 실행
      return;
    }
    showDialog({ title, message, buttons });
  },
};
