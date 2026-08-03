import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { DuprRatingChart, type DuprPoint } from '@/components/ui/dupr-rating-chart';
import { getDuprHistory, SAMPLE_DUPR_HISTORY } from '@/lib/dupr';

// DUPR 레이팅 추이 카드. 캐시 히스토리를 불러와 그래프로 보여준다.
// allowSample: 실제 히스토리가 비었을 때 개발/프리뷰에서만 샘플로 대체(프로덕션엔 노출 안 함).
export function DuprRatingCard({
  userId,
  allowSample = false,
}: {
  userId: string;
  allowSample?: boolean;
}) {
  const [data, setData] = useState<DuprPoint[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const hist = await getDuprHistory(userId);
      if (!alive) return;
      if (hist.length === 0 && allowSample && __DEV__) setData(SAMPLE_DUPR_HISTORY);
      else setData(hist);
    })();
    return () => {
      alive = false;
    };
  }, [userId, allowSample]);

  // 데이터 없으면 카드 자체를 숨긴다(레이팅 없는 계정에 빈 그래프 안 보이게).
  if (!data || data.length < 2) return null;

  return (
    <AppCard disabled style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="stats-chart" size={18} color="#2D6BD6" />
        <Text style={styles.title}>DUPR 레이팅 추이</Text>
      </View>
      <DuprRatingChart data={data} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
});
