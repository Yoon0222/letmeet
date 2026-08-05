import AsyncStorage from '@react-native-async-storage/async-storage';

// 진행 중 결제 정보. 외부 결제앱(카카오페이 등)으로 나갔다가 앱이 돌아오면
// 이 orderId 로 서버(pay-verify)에서 결제 성공 여부를 직접 확인한다.
// (딥링크 자동 복귀가 불안정해도, 앱으로 돌아오기만 하면 결제가 확정된다.)
const KEY = 'pinut.pendingPayment';

export type PendingPayment = { orderId: string; orderName?: string; startedAt: number };

export async function setPendingPayment(p: { orderId: string; orderName?: string }): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...p, startedAt: Date.now() }));
  } catch {
    // 저장 실패는 무시(웹뷰 복귀 경로가 백업)
  }
}

export async function getPendingPayment(): Promise<PendingPayment | null> {
  try {
    const s = await AsyncStorage.getItem(KEY);
    return s ? (JSON.parse(s) as PendingPayment) : null;
  } catch {
    return null;
  }
}

export async function clearPendingPayment(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
