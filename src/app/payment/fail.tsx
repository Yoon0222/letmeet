import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 네이티브 결제 복귀(실패/취소). 홀드된 예약은 스테일 정리(0051)가 해제한다.
export default function PaymentFail() {
  const params = useLocalSearchParams<{ message?: string; code?: string }>();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const t = setTimeout(() => router.replace('/(tabs)'), 1600);
    return () => clearTimeout(t);
  }, [router]);

  const reason = typeof params.message === 'string' ? params.message : '결제가 취소되었어요.';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>결제가 완료되지 않았어요</Text>
      <Text style={styles.text}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 32, backgroundColor: '#F6F7F9' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  text: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
});
