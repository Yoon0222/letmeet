import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { CourtReservationWithCourt } from '@/lib/types';

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
    const { data } = await supabase
      .from('court_reservations')
      .select('*, courts(id,name,region,indoor,hourly_price)')
      .eq('user_id', uid)
      .eq('status', 'reserved')
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
      g = { key: k, courtId: r.court_id, courtName: r.courts?.name ?? '코트', unit: r.court_unit ?? '', region: r.courts?.region ?? '', date: r.slot_date, hours: [], price: r.courts?.hourly_price ?? 0, ids: [], past: false };
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
    Alert.alert('예약 취소', `${g.courtName}\n${fmtDate(g.date)} · ${g.hours.map((h) => `${h}시`).join(', ')}\n예약을 취소할까요?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '취소하기',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('court_reservations').delete().in('id', g.ids);
          if (error) Alert.alert('취소 실패', error.message);
          else load();
        },
      },
    ]);
  }

  const Card = ({ g }: { g: Group }) => (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: g.past ? 0.6 : 1 }]}>
      <Pressable onPress={() => router.push(`/court/${g.courtId}`)} style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.courtName, { color: theme.text }]} numberOfLines={1}>
            {g.courtName}
            {g.unit ? <Text style={{ color: theme.primary }}> · {g.unit}</Text> : null}
          </Text>
          <Text style={[styles.meta, { color: theme.textSecondary }]}>{g.region || '지역 미설정'}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </Pressable>
      <View style={[styles.dateRow, { borderTopColor: theme.border }]}>
        <Ionicons name="calendar-outline" size={16} color={theme.primary} />
        <Text style={[styles.dateText, { color: theme.text }]}>{fmtDate(g.date)}</Text>
        <Text style={[styles.hoursText, { color: theme.textSecondary }]}>{g.hours.map((h) => `${h}시`).join(', ')}</Text>
      </View>
      <View style={styles.bottomRow}>
        <Text style={[styles.total, { color: theme.textSecondary }]}>
          {g.hours.length}시간{g.price > 0 ? ` · ${(g.hours.length * g.price).toLocaleString()}원` : ' · 무료'}
        </Text>
        {g.past ? (
          <Text style={[styles.doneBadge, { color: theme.textSecondary }]}>이용 완료</Text>
        ) : (
          <Pressable onPress={() => cancelGroup(g)} hitSlop={6} style={[styles.cancelBtn, { borderColor: theme.border }]}>
            <Text style={[styles.cancelText, { color: Brand.danger }]}>예약 취소</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: '내 예약' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="calendar-outline" size={48} color={theme.tabIconDefault} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>예약 내역이 없어요</Text>
          <Pressable onPress={() => router.replace('/court')} style={[styles.goBtn, { backgroundColor: theme.primary }]}>
            <Text style={styles.goText}>코트 예약하러 가기</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {upcoming.length > 0 ? (
            <>
              <Text style={[styles.section, { color: theme.text }]}>예정된 예약 {upcoming.length}</Text>
              {upcoming.map((g) => (
                <Card key={g.key} g={g} />
              ))}
            </>
          ) : null}
          {pastGroups.length > 0 ? (
            <>
              <Text style={[styles.section, { color: theme.text, marginTop: Spacing.three }]}>지난 예약</Text>
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
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.four, gap: Spacing.three },
  section: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  card: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: Spacing.three },
  courtName: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  dateText: { fontSize: 14, fontWeight: '700' },
  hoursText: { fontSize: 13, flex: 1 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingBottom: Spacing.three },
  total: { fontSize: 13, fontWeight: '600' },
  doneBadge: { fontSize: 13, fontWeight: '700' },
  cancelBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  cancelText: { fontSize: 13, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: Spacing.four },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  goBtn: { marginTop: 8, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 12 },
  goText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
