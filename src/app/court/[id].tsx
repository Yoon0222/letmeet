import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MonthCalendar } from '@/components/month-calendar';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { AMENITIES, amenityLabel, surfaceLabel } from '@/lib/court-meta';
import { startCourtPayment } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import type { Court, CourtBlock, CourtReservation } from '@/lib/types';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CourtDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [court, setCourt] = useState<Court | null>(null);
  const [reservations, setReservations] = useState<CourtReservation[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [openDays, setOpenDays] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<CourtBlock[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null); // 연속선택 시작점
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const now = Date.now();
      const today = ymd(new Date(now));
      const [courtRes, openRes, blockRes] = await Promise.all([
        supabase.from('courts').select('*').eq('id', id).maybeSingle(),
        // 오늘 이후 오픈일만 (운영자가 연 날짜)
        supabase.from('court_open_days').select('day').eq('court_id', id).gte('day', today).order('day', { ascending: true }),
        // 연대관(정기 대관) 차단 시간대
        supabase.from('court_blocks').select('*').eq('court_id', id),
      ]);
      const openList = (openRes.data ?? []).map((r) => r.day);
      const autoN = courtRes.data?.auto_open_days ?? 0;
      setCourt(courtRes.data ?? null);
      setNowMs(now);
      setOpenDays(openList);
      setBlocks((blockRes.data as CourtBlock[]) ?? []);
      // 자동 오픈이 있으면 오늘이 가장 가까운 예약일, 없으면 가장 이른 수동 오픈일
      setSelectedDate(autoN > 0 ? today : (openList[0] ?? ''));
      setLoading(false);
    })();
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

  // 예약 가능일(달력) = 수동 오픈일 ∪ 자동 오픈 윈도우(오늘부터 auto_open_days일)
  const todayYmd = ymd(new Date(nowMs));
  const openDaySet = new Set(openDays);
  for (let i = 0; i < (court.auto_open_days ?? 0); i++) {
    const d = new Date(nowMs);
    d.setDate(d.getDate() + i);
    openDaySet.add(ymd(d));
  }
  const hasOpenDays = openDaySet.size > 0;

  // 시설 정보 (면/바닥, 편의시설)
  const units = Array.isArray(court.court_units) ? court.court_units : [];
  const amenities = Array.isArray(court.amenities) ? court.amenities : [];
  const images = Array.isArray(court.images) ? court.images : [];
  const surfaces = [...new Set(units.map((u) => surfaceLabel(u.surface)))];
  const unitText = `${units.length}면${surfaces.length ? ` · ${surfaces.join(', ')}` : ''}`;

  // 시간 슬롯
  const hours = Array.from({ length: Math.max(0, court.close_hour - court.open_hour) }, (_, i) => court.open_hour + i);
  const reservedByHour = new Map<number, CourtReservation>();
  reservations.forEach((r) => reservedByHour.set(r.hour, r));
  const isToday = selectedDate === ymd(new Date(nowMs));
  const curHour = new Date(nowMs).getHours();

  // 연대관 차단 시간: 선택한 날짜의 요일에 걸린 블록의 [start, end) 시간
  const selWeekday = selectedDate ? new Date(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)) - 1, Number(selectedDate.slice(8, 10))).getDay() : -1;
  const blockedHours = new Set<number>();
  blocks.forEach((b) => {
    if (b.weekday === selWeekday) for (let h = b.start_hour; h < b.end_hour; h++) blockedHours.add(h);
  });

  // 예약창에서는 선택/예약만. 취소·변경은 '내 예약' 화면에서.
  const isAvailable = (h: number) => !reservedByHour.has(h) && !blockedHours.has(h) && !(isToday && h < curHour);

  // 시작 시각 탭 → 종료 시각 탭 = 연속 구간 예약. (중간에 예약불가 있으면 새로 시작)
  function onSlotPress(h: number) {
    if (anchor == null) {
      setAnchor(h);
      setPicked([h]);
      return;
    }
    if (h === anchor && picked.length === 1) {
      setAnchor(null);
      setPicked([]);
      return;
    }
    const lo = Math.min(anchor, h);
    const hi = Math.max(anchor, h);
    const range: number[] = [];
    let ok = true;
    for (let x = lo; x <= hi; x++) {
      if (!isAvailable(x)) {
        ok = false;
        break;
      }
      range.push(x);
    }
    if (ok) setPicked(range);
    else {
      setAnchor(h);
      setPicked([h]);
    }
  }

  async function reserve() {
    if (!uid || picked.length === 0) return;
    setBooking(true);
    const result = await startCourtPayment({
      court: { id: court!.id, hourly_price: court!.hourly_price },
      uid,
      slotDate: selectedDate,
      hours: [...picked],
    });
    setBooking(false);
    if (!result.ok) {
      if (result.reason === 'slot') Alert.alert('예약 실패', '방금 다른 분이 예약한 시간이 있어요. 다시 선택해주세요.');
      else if (result.reason === 'error') Alert.alert('결제 실패', result.message ?? '잠시 후 다시 시도해주세요.');
      // 'canceled'(사용자가 결제창 닫음)는 조용히 넘어감
    } else {
      const hoursText = [...picked].sort((a, b) => a - b).map((h) => `${h}시`).join(', ');
      setPicked([]);
      setAnchor(null);
      Alert.alert('예약 완료', `${selectedDate}\n${hoursText} ${result.free ? '예약됐어요.' : '결제·예약이 완료됐어요.'}`, [
        { text: '계속 예약', style: 'cancel' },
        { text: '내 예약 보기', onPress: () => router.push('/court/reservations') },
      ]);
    }
    loadReservations(selectedDate);
  }

  const total = picked.length * court.hourly_price;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen options={{ title: court.name }} />
      <ScrollView contentContainerStyle={styles.content}>
        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery} style={styles.galleryWrap}>
            {images.map((url) => (
              <Image key={url} source={{ uri: url }} style={[styles.galleryImg, { backgroundColor: theme.backgroundElement }]} />
            ))}
          </ScrollView>
        ) : null}
        <View style={[styles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Info icon="location-outline" text={`${court.region || '지역 미설정'}${court.address ? ` · ${court.address}` : ''}`} theme={theme} />
          <Info icon="home-outline" text={court.indoor ? '실내 코트' : '실외 코트'} theme={theme} />
          <Info icon="time-outline" text={`운영 ${court.open_hour}시 – ${court.close_hour}시`} theme={theme} />
          <Info icon="cash-outline" text={court.hourly_price > 0 ? `시간당 ${court.hourly_price.toLocaleString()}원` : '무료'} theme={theme} />
          {units.length > 0 ? <Info icon="grid-outline" text={unitText} theme={theme} /> : null}
          {court.lessons ? <Info icon="school-outline" text="레슨 가능" theme={theme} /> : null}
        </View>

        {amenities.length > 0 ? (
          <View style={styles.amenityRow}>
            {amenities.map((a) => (
              <View key={a} style={[styles.amenityChip, { backgroundColor: theme.backgroundElement }]}>
                <Text style={[styles.amenityText, { color: theme.text }]}>
                  {AMENITIES.find((x) => x.key === a)?.emoji ?? ''} {amenityLabel(a)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {court.description ? <Text style={[styles.desc, { color: theme.textSecondary }]}>{court.description}</Text> : null}

        {/* 날짜 (월별 달력 · 운영자가 연 날짜만 선택 가능) */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>날짜</Text>
        {!hasOpenDays ? (
          <View style={[styles.noDays, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="calendar-outline" size={22} color={theme.textSecondary} />
            <Text style={[styles.noDaysText, { color: theme.textSecondary }]}>아직 예약 가능한 날짜가 없어요.{'\n'}코트 운영자가 예약일을 열면 예약할 수 있어요.</Text>
          </View>
        ) : (
          <MonthCalendar
            todayYmd={todayYmd}
            selected={selectedDate || null}
            onSelectDay={(d) => {
              setSelectedDate(d);
              setPicked([]);
              setAnchor(null);
            }}
            enabledDays={openDaySet}
            markedDays={openDaySet}
          />
        )}

        {/* 시간 슬롯 */}
        {selectedDate ? (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>시간 선택</Text>
            <Text style={[styles.rangeHint, { color: theme.textSecondary }]}>시작 시간을 누르고 종료 시간을 누르면 연속으로 선택돼요.</Text>
            <View style={styles.slotWrap}>
          {hours.map((h) => {
            const r = reservedByHour.get(h);
            const mine = !!r && r.user_id === uid;
            const past = isToday && h < curHour;
            const blocked = blockedHours.has(h); // 연대관
            const sel = picked.includes(h);
            // 연대관·예약됨(내 것 포함)·지난 시간은 선택 불가. 취소는 '내 예약' 화면에서.
            const disabled = blocked || !!r || past;
            const bg = sel ? theme.primary : mine ? theme.backgroundElement : r || blocked ? theme.backgroundElement : theme.card;
            const fg = sel ? '#fff' : mine ? theme.accent : r || past || blocked ? theme.textSecondary : theme.text;
            const borderColor = sel ? theme.primary : mine ? theme.accent : theme.border;
            return (
              <Pressable
                key={h}
                disabled={disabled}
                onPress={() => onSlotPress(h)}
                style={[styles.slot, { backgroundColor: bg, borderColor, opacity: past || blocked ? 0.5 : 1 }]}>
                <Text style={[styles.slotHour, { color: fg }]}>{h}시</Text>
                <Text style={[styles.slotState, { color: fg }]}>{blocked ? '대관' : mine ? '내 예약' : r ? '예약됨' : past ? '지남' : sel ? '선택' : '가능'}</Text>
              </Pressable>
            );
          })}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: theme.background, borderTopColor: theme.border }]}>
        <Button
          title={
            picked.length === 0
              ? '시간을 선택하세요'
              : total > 0
                ? `${total.toLocaleString()}원 결제하기`
                : `${picked.length}시간 예약하기`
          }
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
  galleryWrap: { marginHorizontal: -Spacing.four },
  gallery: { gap: 8, paddingHorizontal: Spacing.four },
  galleryImg: { width: 280, height: 170, borderRadius: 14 },
  infoCard: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', flex: 1 },
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenityChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  amenityText: { fontSize: 13, fontWeight: '600' },
  desc: { fontSize: 15, lineHeight: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: Spacing.two },
  rangeHint: { fontSize: 12, marginTop: -4 },
  noDays: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: Spacing.three },
  noDaysText: { fontSize: 13, lineHeight: 19, flex: 1 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: 72, borderWidth: 1, borderRadius: 12, paddingVertical: 8, alignItems: 'center', gap: 2 },
  slotHour: { fontSize: 15, fontWeight: '800' },
  slotState: { fontSize: 11, fontWeight: '600' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1 },
});
