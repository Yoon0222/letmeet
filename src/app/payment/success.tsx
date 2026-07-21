import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

// 네이티브 결제 복귀(성공). 토스가 pickleball://payment/success?paymentKey&orderId&amount 로 앱을 연다.
// 여기서 서버(pay-verify)로 승인 확인 → 예약 확정. (인앱 브라우저가 콜백을 못 잡는 경우의 처리)
export default function PaymentSuccess() {
  const params = useLocalSearchParams<{ paymentKey?: string; orderId?: string; amount?: string }>();
  const router = useRouter();
  const done = useRef(false);
  const [msg, setMsg] = useState('결제를 확인하고 있어요…');

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const orderId = typeof params.orderId === 'string' ? params.orderId : undefined;
      const paymentKey = typeof params.paymentKey === 'string' ? params.paymentKey : undefined;
      try {
        if (orderId && paymentKey) {
          const { data, error } = await supabase.functions.invoke('pay-verify', {
            body: { order_id: orderId, paymentId: paymentKey },
          });
          setMsg(!error && data?.paid ? '결제가 완료됐어요! 예약이 확정됐습니다.' : '결제 확인에 실패했어요. 예약이 취소됩니다.');
        }
      } catch {
        setMsg('결제 확인 중 문제가 발생했어요.');
      } finally {
        setTimeout(() => router.replace('/court/reservations' as never), 1200);
      }
    })();
  }, [params.orderId, params.paymentKey, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color="#16C784" />
      <Text style={styles.text}>{msg}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, backgroundColor: '#F6F7F9' },
  text: { fontSize: 15, color: '#374151', textAlign: 'center', lineHeight: 22 },
});
