import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { cancelCourtReservation } from '@/lib/payments';
import { refundRateFor } from '@/lib/refund';
import { supabase } from '@/lib/supabase';
import type { CourtReservationWithCourt, RefundTier } from '@/lib/types';
import { AppColors } from '@/theme';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  const dow = DOW[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${dow})`;
};

type Group = {
  key: string;
  courtId: string;
  courtName: string;
  unit: string;
  region: string;
  date: string;
  hours: number[];
  price: number;
  refundPolicy: RefundTier[];
  ids: string[];
  past: boolean;
};

export default function MyReservationsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [rows, setRows] = useState<CourtReservationWithCourt[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!uid) return;
    // 확정 예약만 표시한다.
    const { data } = await supabase
      .from('court_reservations')
      .select('*, courts(id,name,region,indoor,hourly_price,refund_policy)')
      .eq('user_id', uid)
      .eq('status', 'reserved')
      .is('expires_at', null)
      .order('slot_date', { ascending: true })
      .order('hour', { ascending: true });
    setRows((data as unknown as CourtReservationWithCourt[]) ?? []);
    setNowMs(Date.now());
    setLoading(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 코트+날짜로 그룹핑
  const today = ymd(new Date(nowMs));
  const curHour = new Date(nowMs).getHours();
  const map = new Map<string, Group>();
  for (const r of rows) {
    const k = `${r.court_id}|${r.court_unit}|${r.slot_date}`;
    let g = map.get(k);
    if (!g) {
      g = { key: k, courtId: r.court_id, courtName: r.courts?.name ?? '코트', unit: r.court_unit ?? '', region: r.courts?.region ?? '', date: r.slot_date, hours: [], price: r.courts?.hourly_price ?? 0, refundPolicy: r.courts?.refund_policy ?? [], ids: [], past: false };
      map.set(k, g);
    }
    g.hours.push(r.hour);
    g.ids.push(r.id);
  }
  const groups = [...map.values()].map((g) => {
    g.hours.sort((a, b) => a - b);
    const maxHour = g.hours[g.hours.length - 1];
    g.past = g.date < today || (g.date === today && maxHour < curHour);
    return g;
  });
  const upcoming = groups.filter((g) => !g.past).sort((a, b) => a.date.localeCompare(b.date) || a.hours[0] - b.hours[0]);
  const pastGroups = groups.filter((g) => g.past).sort((a, b) => b.date.localeCompare(a.date));

  function cancelGroup(g: Group) {
    // 코트 환불 정책 → 남은 일수 기준 환불율/금액
    const rate = refundRateFor(g.refundPolicy, g.date, today);
    const total = g.hours.length * g.price;
    const refund = Math.floor((total * rate) / 100);
    const policyLine =
      total <= 0
        ? '무료 예약이에요. 취소만 진행돼요.'
        : rate <= 0
          ? '지금 취소하면 환불되지 않아요.'
          : rate >= 100
            ? `취소하면 ${refund.toLocaleString()}원(전액) 환불돼요.`
            : `취소하면 ${refund.toLocaleString()}원(${rate}%) 환불돼요.`;
    Alert.alert(
      '예약 취소',
      `${g.courtName}\n${fmtDate(g.date)} · ${g.hours.map((h) => `${h}시`).join(', ')}\n\n${policyLine}\n예약을 취소할까요?`,
      [
        { text: '닫기', style: 'cancel' },
        {
          text: '취소하기',
          style: 'destructive',
          onPress: async () => {
            const res = await cancelCourtReservation(g.ids);
            if (!res.ok) {
              Alert.alert('취소 실패', res.error);
              return;
            }
            Alert.alert(
              '예약 취소 완료',
              res.refunded ? `${res.amount.toLocaleString()}원이 환불됐어요.` : '예약이 취소됐어요.',
            );
            load();
          },
        },
      ],
    );
  }

  const Card = ({ g }: { g: Group }) => (
    <View style={[styles.card, g.past && styles.cardPast]}>
      <Pressable onPress={() => router.push(`/court/${g.courtId}`)} style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.courtName} numberOfLines={1}>
            {g.courtName}
            {g.unit ? <Text style={{ color: '#16C784' }}> · {g.unit}</Text> : null}
          </Text>
          <Text style={styles.meta}>{g.region || '지역 미설정'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={AppColors.textMuted} />
      </Pressable>
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={16} color={AppColors.primary} />
        <Text style={styles.dateText}>{fmtDate(g.date)}</Text>
        <Text style={styles.hoursText}>{g.hours.map((h) => `${h}시`).join(', ')}</Text>
      </View>
      <View style={styles.bottomRow}>
        <Text style={styles.total}>
          {g.hours.length}시간{g.price > 0 ? ` · ${(g.hours.length * g.price).toLocaleString()}원` : ' · 무료'}
        </Text>
        {g.past ? (
          <Text style={styles.doneBadge}>이용 완료</Text>
        ) : (
          <Pressable onPress={() => cancelGroup(g)} hitSlop={6} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>예약 취소</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '내 예약',
          headerStyle: { backgroundColor: AppColors.background },
          headerTintColor: AppColors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={AppColors.textMuted} />
          <Text style={styles.emptyTitle}>예약 내역이 없어요</Text>
          <Pressable onPress={() => router.replace('/(tabs)/court' as never)} style={styles.goBtn}>
            <Text style={styles.goText}>코트 예약하러 가기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {upcoming.length > 0 ? (
            <>
              <Text style={styles.section}>예정된 예약 {upcoming.length}</Text>
              {upcoming.map((g) => (
                <Card key={g.key} g={g} />
              ))}
            </>
          ) : null}
          {pastGroups.length > 0 ? (
            <>
              <Text style={[styles.section, { marginTop: Spacing.three }]}>지난 예약</Text>
              {pastGroups.map((g) => (
                <Card key={g.key} g={g} />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 124 },
  section: { fontSize: 15, fontWeight: '800', color: AppColors.textPrimary, marginBottom: 2 },
  card: {
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 18,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  cardPast: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.three },
  courtName: { fontSize: 17, fontWeight: '700', color: AppColors.textPrimary },
  meta: { fontSize: 13, color: AppColors.textSecondary, marginTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: AppColors.border, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  dateText: { fontSize: 14, fontWeight: '700', color: AppColors.textPrimary },
  hoursText: { fontSize: 13, color: AppColors.textSecondary, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  total: { fontSize: 13, fontWeight: '600', color: AppColors.textSecondary },
  doneBadge: { fontSize: 13, fontWeight: '700', color: AppColors.textMuted },
  cancelBtn: { borderWidth: 1, borderColor: AppColors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  cancelText: { fontSize: 13, fontWeight: '700', color: '#EF4444' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: Spacing.four },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: AppColors.textPrimary },
  goBtn: { marginTop: 8, borderRadius: 999, backgroundColor: AppColors.primary, paddingHorizontal: 20, paddingVertical: 12 },
  goText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
