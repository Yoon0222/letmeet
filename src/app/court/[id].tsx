import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourtReviews } from '@/components/court-reviews';
import { MonthCalendar } from '@/components/month-calendar';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { createCourtReservation } from '@/lib/court-reservations';
import { AMENITIES, amenityLabel, surfaceLabel } from '@/lib/court-meta';
import { createCourtPaymentHold } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import type { Court, CourtBlock, CourtReservation } from '@/lib/types';
import { AppColors } from '@/theme';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CourtDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [court, setCourt] = useState<Court | null>(null);
  const [reservations, setReservations] = useState<CourtReservation[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [openDays, setOpenDays] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<CourtBlock[]>([]);
  const [selectedUnit, setSelectedUnit] = useState(''); // 선택한 면(코트) 이름. '' = 시설 단위
  const [picked, setPicked] = useState<number[]>([]);
  const [anchor, setAnchor] = useState<number | null>(null); // 연속선택 시작점
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);

  // 순차 선택(날짜→코트→시간) 시 해당 섹션으로 자동 스크롤하기 위한 참조
  const scrollRef = useRef<ScrollView>(null);
  const courtSectionY = useRef(0);
  const timeSectionY = useRef(0);

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
      setCourt(courtRes.data ?? null);
      setNowMs(now);
      setOpenDays(openList);
      setBlocks((blockRes.data as CourtBlock[]) ?? []);
      // 순차 선택 흐름: 날짜·코트를 미리 고르지 않는다. 날짜 선택 → 코트 → 시간 순으로 열림.
      setSelectedUnit('');
      setSelectedDate('');
      setLoading(false);
    })();
  }, [id]);

  const loadReservations = useCallback(
    async (date: string) => {
      if (!id || !date) return;
      // 예약 행 = 확정(expires_at null) 또는 홀드(expires_at 있음). 차단 여부는 아래에서 만료 판정.
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

  // 날짜를 고르면 코트 선택(면이 없으면 시간)으로 자동 스크롤
  useEffect(() => {
    if (!selectedDate) return;
    const hasUnits = Array.isArray(court?.court_units) && court.court_units.length > 0;
    const t = setTimeout(() => {
      const y = hasUnits ? courtSectionY.current : timeSectionY.current;
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 280);
    return () => clearTimeout(t);
  }, [selectedDate, court]);

  // 코트(면)를 고르면 시간 선택으로 자동 스크롤
  useEffect(() => {
    if (!selectedUnit) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, timeSectionY.current - 12), animated: true });
    }, 220);
    return () => clearTimeout(t);
  }, [selectedUnit]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }
  if (!court) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>코트를 찾을 수 없어요.</Text>
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
  // 선택한 면의 예약만 슬롯에 반영 (면별 독립 예약).
  // 차단 대상 = 확정(expires_at null) 또는 아직 안 만료된 홀드(expires_at > now). 만료 홀드는 무시.
  const reservedByHour = new Map<number, CourtReservation>();
  reservations
    .filter((r) => r.court_unit === selectedUnit)
    .filter((r) => r.expires_at == null || new Date(r.expires_at).getTime() > nowMs)
    .forEach((r) => reservedByHour.set(r.hour, r));
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
    const selectedCourt = court;
    if (!selectedCourt) return;
    setBooking(true);

    if (selectedCourt.hourly_price > 0) {
      const result = await createCourtPaymentHold({
        court: { id: selectedCourt.id, name: selectedCourt.name, hourly_price: selectedCourt.hourly_price },
        uid,
        slotDate: selectedDate,
        hours: [...picked],
        courtUnit: selectedUnit,
      });
      setBooking(false);

      if (!result.ok) {
        if (result.reason === 'slot') Alert.alert('이미 예약된 시간', '선택한 시간이 이미 예약되었어요. 다른 시간을 골라주세요.');
        else if (result.reason === 'config') Alert.alert('결제 설정 필요', '결제 설정이 아직 완료되지 않았습니다.');
        else Alert.alert('결제 준비 실패', result.message ?? '잠시 후 다시 시도해주세요.');
        loadReservations(selectedDate);
        return;
      }

      router.push({
        pathname: '/payment/court',
        params: {
          paymentId: result.paymentId,
          orderId: result.orderId,
          orderName: result.orderName,
          amount: String(result.amount),
        },
      });
      return;
    }

    const result = await createCourtReservation({
      court: { id: selectedCourt.id, hourly_price: selectedCourt.hourly_price },
      uid,
      slotDate: selectedDate,
      hours: [...picked],
      courtUnit: selectedUnit,
    });
    setBooking(false);
    if (!result.ok) {
      if (result.reason === 'slot') Alert.alert('이미 예약된 시간', '선택한 시간에 이미 예약이 있어요. (본인 예약일 수 있어요 — 내 예약에서 확인) 다른 시간을 골라주세요.');
      else if (result.reason === 'error') Alert.alert('예약 실패', result.message ?? '잠시 후 다시 시도해주세요.');
      loadReservations(selectedDate);
      return;
    }
    const hoursText = [...picked].sort((a, b) => a - b).map((h) => `${h}시`).join(', ');
    setPicked([]);
    setAnchor(null);
    Alert.alert('예약 완료', `${selectedDate}\n${hoursText} 예약됐어요.`, [
      { text: '계속 예약', style: 'cancel' },
      { text: '내 예약 보기', onPress: () => router.push('/court/reservations') },
    ]);
    loadReservations(selectedDate);
  }

  const total = picked.length * court.hourly_price;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: court.name,
          headerStyle: { backgroundColor: AppColors.background },
          headerTintColor: AppColors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {images.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery} style={styles.galleryWrap}>
            {images.map((url) => (
              <Image key={url} source={{ uri: url }} style={styles.galleryImg} />
            ))}
          </ScrollView>
        ) : null}
        <View style={styles.infoCard}>
          <Info icon="location-outline" text={`${court.region || '지역 미설정'}${court.address ? ` · ${court.address}` : ''}`} />
          <Info icon="home-outline" text={court.indoor ? '실내 코트' : '실외 코트'} />
          <Info icon="time-outline" text={`운영 ${court.open_hour}시 – ${court.close_hour}시`} />
          <Info icon="cash-outline" text={court.hourly_price > 0 ? `시간당 ${court.hourly_price.toLocaleString()}원` : '무료'} />
          {units.length > 0 ? <Info icon="grid-outline" text={unitText} /> : null}
          {court.lessons ? <Info icon="school-outline" text="레슨 가능" /> : null}
        </View>

        {amenities.length > 0 ? (
          <View style={styles.amenityRow}>
            {amenities.map((a) => (
              <View key={a} style={styles.amenityChip}>
                <Text style={styles.amenityText}>
                  {AMENITIES.find((x) => x.key === a)?.emoji ?? ''} {amenityLabel(a)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {court.description ? <Text style={styles.desc}>{court.description}</Text> : null}

        {/* 날짜 (월별 달력 · 운영자가 연 날짜만 선택 가능) */}
        <Text style={styles.sectionTitle}>날짜 선택</Text>
        {!hasOpenDays ? (
          <View style={styles.noDays}>
            <Ionicons name="calendar-outline" size={22} color={AppColors.textMuted} />
            <Text style={styles.noDaysText}>아직 예약 가능한 날짜가 없어요.{'\n'}코트 운영자가 예약일을 열면 예약할 수 있어요.</Text>
          </View>
        ) : (
          <MonthCalendar
            todayYmd={todayYmd}
            selected={selectedDate || null}
            onSelectDay={(d) => {
              // 날짜를 바꾸면 코트 선택을 리셋 → 시간 섹션은 코트를 다시 고를 때 열림(순차)
              setSelectedDate(d);
              setSelectedUnit('');
              setPicked([]);
              setAnchor(null);
            }}
            enabledDays={openDaySet}
            markedDays={openDaySet}
          />
        )}

        {/* 코트(면) 선택 — 면이 여러 개면 */}
        {selectedDate && units.length > 0 ? (
          <>
            <Text
              style={styles.sectionTitle}
              onLayout={(e) => {
                courtSectionY.current = e.nativeEvent.layout.y;
              }}>
              코트 선택
            </Text>
            <View style={styles.unitRow}>
              {units.map((u) => {
                const active = u.name === selectedUnit;
                return (
                  <Pressable
                    key={u.name}
                    onPress={() => {
                      setSelectedUnit(u.name);
                      setPicked([]);
                      setAnchor(null);
                    }}
                    style={[styles.unitChip, active ? styles.unitChipActive : styles.unitChipIdle]}>
                    <Text style={[styles.unitName, { color: active ? '#fff' : AppColors.textPrimary }]}>{u.name}</Text>
                    <Text style={[styles.unitSurface, { color: active ? '#EAFBF3' : AppColors.textSecondary }]}>{surfaceLabel(u.surface)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* 시간 슬롯 — 날짜 선택 후, (면이 있으면) 코트까지 고른 뒤에 열린다 */}
        {selectedDate && (units.length === 0 || selectedUnit) ? (
          <>
            <Text
              style={styles.sectionTitle}
              onLayout={(e) => {
                timeSectionY.current = e.nativeEvent.layout.y;
              }}>
              시간 선택
            </Text>
            <Text style={styles.rangeHint}>시작 시간을 누르고 종료 시간을 누르면 연속으로 선택돼요.</Text>
            <View style={styles.slotWrap}>
              {hours.map((h) => {
                const r = reservedByHour.get(h);
                const mine = !!r && r.user_id === uid;
                const past = isToday && h < curHour;
                const blocked = blockedHours.has(h); // 연대관
                const sel = picked.includes(h);
                // 연대관·예약됨(내 것 포함)·지난 시간은 선택 불가. 취소는 '내 예약' 화면에서.
                const disabled = blocked || !!r || past;
                const bg = sel ? AppColors.primary : mine || r || blocked ? AppColors.surfaceSoft : AppColors.surface;
                const fg = sel ? '#fff' : mine ? '#F59E0B' : r || past || blocked ? AppColors.textMuted : AppColors.textPrimary;
                const borderColor = sel ? AppColors.primary : mine ? '#F59E0B' : AppColors.border;
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

        {/* 코트 리뷰 (0050) — 자체 완결 컴포넌트 */}
        {id ? (
          <View style={{ marginTop: Spacing.four }}>
            <CourtReviews courtId={id} />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.actionBar}>
        <Button
          title={
            picked.length === 0
              ? '시간을 선택하세요'
              : total > 0
                ? `${total.toLocaleString()}원 예약하기`
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

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={AppColors.primary} />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.background },
  notFound: { color: AppColors.textSecondary, fontSize: 15 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  galleryWrap: { marginHorizontal: -Spacing.four },
  gallery: { gap: 8, paddingHorizontal: Spacing.four },
  galleryImg: { width: 280, height: 170, borderRadius: 14, borderCurve: 'continuous', backgroundColor: AppColors.surfaceSoft },
  infoCard: {
    backgroundColor: AppColors.surface,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: Spacing.three,
    gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', color: AppColors.textPrimary, flex: 1 },
  amenityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  amenityChip: { backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  amenityText: { fontSize: 13, fontWeight: '600', color: AppColors.textPrimary },
  desc: { fontSize: 15, lineHeight: 22, color: AppColors.textSecondary },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary, marginTop: Spacing.two },
  rangeHint: { fontSize: 12, color: AppColors.textMuted, marginTop: -4 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  unitChip: { minWidth: 64, alignItems: 'center', borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  unitChipActive: { backgroundColor: AppColors.primary },
  unitChipIdle: { backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border },
  unitName: { fontSize: 15, fontWeight: '800' },
  unitSurface: { fontSize: 11, fontWeight: '600' },
  noDays: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 14, padding: Spacing.three },
  noDaysText: { fontSize: 13, lineHeight: 19, color: AppColors.textSecondary, flex: 1 },
  slotWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: 72, borderWidth: 1, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 8, alignItems: 'center', gap: 2 },
  slotHour: { fontSize: 15, fontWeight: '800' },
  slotState: { fontSize: 11, fontWeight: '600' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: AppColors.border, backgroundColor: AppColors.background },
});
