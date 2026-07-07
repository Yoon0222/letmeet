import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { Court, CourtReservation } from '@/lib/types';

const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CourtDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [court, setCourt] = useState<Court | null>(null);
  const [reservations, setReservations] = useState<CourtReservation[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!id) return;
    supabase
      .from('courts')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        const now = Date.now();
        setCourt(data ?? null);
        setNowMs(now);
        setSelectedDate(ymd(new Date(now)));
        setLoading(false);
      });
  }, [id]);

  const loadReservations = useCallback(
    async (date: string) => {
      if (!id || !date) return;
      const { data } = await supabase
        .from('court_reservations')
        .select('*')
        .eq('court_id', id)
        .eq('slot_date', date)
        .eq('status', 'reserved');
      setReservations((data as CourtReservation[]) ?? []);
    },
    [id],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadReservations(selectedDate);
  }, [loadReservations, selectedDate]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!court) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.textSecondary }}>코트를 찾을 수 없어요.</Text>
      </View>
    );
  }

  // 다음 7일
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + i);
    return d;
  });
  const dayLabel = (d: Date, i: number) => (i === 0 ? '오늘' : i === 1 ? '내일' : `${d.getMonth() + 1}.${d.getDate()}(${DOW[d.getDay()]})`);

  // 시간 슬롯
  const hours = Array.from({ length: Math.max(0, court.close_hour - court.open_hour) }, (_, i) => court.open_hour + i);
  const reservedByHour = new Map<number, CourtReservation>();
  reservations.forEach((r) => reservedByHour.set(r.hour, r));
  const isToday = selectedDate === ymd(new Date(nowMs));
  const curHour = new Date(nowMs).getHours();

  const toggle = (h: number) => setPicked((p) => (p.includes(h) ? p.filter((x) => x !== h) : [...p, h]));

  async function reserve() {
    if (!uid || picked.length === 0) return;
    setBooking(true);
    const rows = picked.map((h) => ({ court_id: court!.id, user_id: uid, slot_date: selectedDate, hour: h }));
    const { error } = await supabase.from('court_reservations').insert(rows);
    setBooking(false);
    if (error) {
      Alert.alert(
        '예약 실패',
        /duplicate|unique/i.test(error.message) ? '방금 다른 분이 예약한 시간이 있어요. 다시 선택해주세요.' : error.message,
      );
    } else {
      Alert.alert('예약 완료', `${selectedDate}\n${[...picked].sort((a, b) => a - b).map((h) => `${h}시`).join(', ')} 예약됐어요.`);
      setPicked([]);
    }
    loadReservations(selectedDate);
  }

  const total = picked.length * court.hourly_price;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: court.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.name, { color: theme.text }]}>{court.name}</Text>
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Info icon="location-outline" text={`${court.region || '지역 미설정'}${court.address ? ` · ${court.address}` : ''}`} theme={theme} />
          <Info icon="home-outline" text={court.indoor ? '실내 코트' : '실외 코트'} theme={theme} />
          <Info icon="time-outline" text={`운영 ${court.open_hour}시 – ${court.close_hour}시`} theme={theme} />
          <Info icon="cash-outline" text={court.hourly_price > 0 ? `시간당 ${court.hourly_price.toLocaleString()}원` : '무료'} theme={theme} />
        </View>
        {court.description ? <Text style={[styles.desc, { color: theme.textSecondary }]}>{court.description}</Text> : null}

        {/* 날짜 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>날짜</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {days.map((d, i) => {
            const key = ymd(d);
            const active = key === selectedDate;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  setSelectedDate(key);
                  setPicked([]);
                }}
                style={[styles.dateChip, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
                <Text style={[styles.dateText, { color: active ? '#fff' : theme.textSecondary }]}>{dayLabel(d, i)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* 시간 슬롯 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>시간 선택</Text>
        <View style={styles.slotWrap}>
          {hours.map((h) => {
            const r = reservedByHour.get(h);
            const mine = r && r.user_id === uid;
            const past = isToday && h <= curHour;
            const sel = picked.includes(h);
            const disabled = !!r || past;
            const bg = sel
              ? theme.primary
              : mine
                ? 'rgba(45,127,249,0.15)'
                : r
                  ? theme.backgroundElement
                  : past
                    ? 'transparent'
                    : theme.card;
            const fg = sel ? '#fff' : mine ? '#185FA5' : r || past ? theme.textSecondary : theme.text;
            return (
              <Pressable
                key={h}
                disabled={disabled}
                onPress={() => toggle(h)}
                style={[styles.slot, { backgroundColor: bg, borderColor: sel ? theme.primary : theme.border, opacity: past ? 0.4 : 1 }]}>
                <Text style={[styles.slotHour, { color: fg }]}>{h}시</Text>
                <Text style={[styles.slotState, { color: fg }]}>{mine ? '내 예약' : r ? '예약됨' : past ? '지남' : sel ? '선택' : '가능'}</Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Button
          title={picked.length > 0 ? `${picked.length}시간 예약하기${total > 0 ? ` · ${total.toLocaleString()}원` : ''}` : '시간을 선택하세요'}
          onPress={reserve}
          disabled={picked.length === 0}
          loading={booking}
        />
      </View>
    </SafeAreaView>
  );
}

function Info({ icon, text, theme }: { icon: keyof typeof Ionicons.glyphMap; text: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={theme.primary} />
      <Text style={[styles.infoText, { color: theme.text }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  name: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', flex: 1 },
  desc: { fontSize: 15, lineHeight: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: Spacing.two },
  dateRow: { gap: 8, paddingBottom: 4 },
  dateChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  dateText: { fontSize: 14, fontWeight: '700' },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: 72, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 2 },
  slotHour: { fontSize: 15, fontWeight: '800' },
  slotState: { fontSize: 11, fontWeight: '600' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1 },
});
