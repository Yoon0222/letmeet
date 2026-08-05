import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { AppAlert as Alert } from '@/lib/feedback';
import { clearPendingPayment, getPendingPayment } from '@/lib/pending-payment';
import { supabase } from '@/lib/supabase';

// 외부 결제앱(카카오페이 등)에서 돌아와 앱이 foreground 되면, 진행 중 결제를
// orderId 로 서버 확인해 예약을 확정한다. 딥링크 자동 복귀가 흔들려도
// 사용자가 피넛으로 돌아오기만 하면 결제가 확정되는 안전망.
export function PaymentResumeWatcher() {
  const router = useRouter();
  const busy = useRef(false);

  useEffect(() => {
    async function check() {
      if (busy.current) return;
      const p = await getPendingPayment();
      if (!p) return;
      // 30분 초과한 오래된 흔적은 정리
      if (Date.now() - p.startedAt > 30 * 60 * 1000) {
        await clearPendingPayment();
        return;
      }
      busy.current = true;
      try {
        const { data } = await supabase.functions.invoke('pay-verify', { body: { order_id: p.orderId } });
        if (data?.paid) {
          await clearPendingPayment();
          router.replace('/court/reservations' as never);
          setTimeout(() => Alert.alert('결제 완료', '예약이 확정됐어요! 🎉'), 300);
        }
        // pending(아직 결제 미완) 이면 그대로 두고 다음 foreground 에 재확인
      } catch {
        // 확인 실패는 조용히(다음 기회에 재시도)
      } finally {
        busy.current = false;
      }
    }

    const onChange = (state: AppStateStatus) => {
      if (state === 'active') void check();
    };
    const sub = AppState.addEventListener('change', onChange);
    // 앱이 이미 활성인 상태로 마운트될 때도 한 번 확인
    void check();
    return () => sub.remove();
  }, [router]);

  return null;
}
