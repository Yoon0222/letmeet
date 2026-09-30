import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { distanceKm, formatDistance, type LatLng } from '@/lib/geo';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { Court, MeetupWithCounts } from '@/lib/types';

let Location: typeof import('expo-location') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Location = require('expo-location');
} catch {
  Location = null;
}

type DayFilter = 'today' | 'all';
const FIVE_KM = 5;

function presetTime(dayOffset: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function MatchesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const [meetups, setMeetups] = useState<MeetupWithCounts[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kind, setKind] = useState<'normal' | 'dupr'>('normal');
  const [dayFilter, setDayFilter] = useState<DayFilter>('today');
  const [nearOnly, setNearOnly] = useState(false);
  const [skillOnly, setSkillOnly] = useState(false);
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { data: courtRows }, blocked] = await Promise.all([
      supabase.from('meetups_with_counts').select('*').neq('status', 'cancelled').eq('match_count', 0).gte('start_time', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()).order('start_time', { ascending: true }).limit(100),
      supabase.from('courts').select('*').order('region', { ascending: true }),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
    ]);
    if (error) {
      console.warn('[matches] load error', error.message);
      setMeetups([]);
    } else {
      const blockedSet = new Set(blocked);
      setMeetups((data ?? []).filter((item) => !blockedSet.has(item.host_id)));
    }
    setCourts((courtRows as Court[] | null) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    const loc = Location;
    if (!loc) return;
    let cancelled = false;
    void (async () => {
      try {
        const { status } = await loc.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const result = await loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Balanced });
        if (!cancelled) setMyLoc({ lat: result.coords.latitude, lng: result.coords.longitude });
      } catch {
        // 위치 없이도 날짜·실력 필터와 코트 추천은 사용할 수 있다.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const courtDistances = useMemo(() => {
    const map = new Map<string, number>();
    if (!myLoc) return map;
    courts.forEach((court) => {
      if (court.latitude != null && court.longitude != null) map.set(court.id, distanceKm(myLoc, { lat: court.latitude, lng: court.longitude }));
    });
    return map;
  }, [courts, myLoc]);

  const courtImages = useMemo(() => new Map(courts.map((court) => [court.id, court.images?.[0] ?? court.image_url ?? null])), [courts]);

  const normalList = meetups.filter((item) => !item.dupr_certified);
  const duprList = meetups.filter((item) => item.dupr_certified);
  const visible = (kind === 'dupr' ? duprList : normalList).filter((item) => {
    if (dayFilter === 'today' && !isToday(item.start_time)) return false;
    if (nearOnly && (!item.court_id || (courtDistances.get(item.court_id) ?? Infinity) > FIVE_KM)) return false;
    if (skillOnly && profile && (profile.skill_level < item.skill_min || profile.skill_level > item.skill_max)) return false;
    return true;
  });

  const nearestCourt = useMemo(() => {
    const sorted = [...courts].sort((a, b) => {
      const da = courtDistances.get(a.id);
      const db = courtDistances.get(b.id);
      if (da != null && db != null) return da - db;
      if (da != null) return -1;
      if (db != null) return 1;
      const aLocal = profile?.region && a.region.includes(profile.region) ? 0 : 1;
      const bLocal = profile?.region && b.region.includes(profile.region) ? 0 : 1;
      return aLocal - bLocal;
    });
    return sorted[0] ?? null;
  }, [courtDistances, courts, profile]);

  const createMeetup = (preset?: string) => router.push(session ? { pathname: '/meetup/create', params: preset ? { preset } : {} } : '/(auth)/sign-in');

  const header = (
    <View style={styles.topContent}>
      <View style={styles.header}><AppHeader title="번개 모임" subtitle="가까운 코트에서 오늘 함께 칠 사람을 찾아보세요" /></View>
      <View style={styles.kindTabs}>
        <Pressable onPress={() => setKind('normal')} style={[styles.kindTab, kind === 'normal' && styles.kindTabActive]}><Ionicons name="flash" size={16} color={kind === 'normal' ? '#07100D' : '#AAB4C0'} /><Text style={[styles.kindTabText, kind === 'normal' && styles.kindTabTextActive]}>일반 매치 {normalList.length}</Text></Pressable>
        <Pressable onPress={() => setKind('dupr')} style={[styles.kindTab, kind === 'dupr' && styles.kindTabActiveDupr]}><Ionicons name="shield-checkmark" size={16} color={kind === 'dupr' ? '#FFFFFF' : '#AAB4C0'} /><Text style={[styles.kindTabText, kind === 'dupr' && styles.kindTabTextActiveDupr]}>DUPR 매치 {duprList.length}</Text></Pressable>
      </View>
      <View style={styles.filters}>
        <FilterButton icon="calendar-outline" label={dayFilter === 'today' ? '오늘' : '전체 날짜'} active={dayFilter === 'today'} onPress={() => setDayFilter((value) => value === 'today' ? 'all' : 'today')} />
        <FilterButton icon="location-outline" label="5km 이내" active={nearOnly} disabled={!myLoc} onPress={() => setNearOnly((value) => !value)} />
        <FilterButton icon="stats-chart" label="내 실력" active={skillOnly} disabled={!profile} onPress={() => setSkillOnly((value) => !value)} />
      </View>
    </View>
  );

  if (loading) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.center}><ActivityIndicator color={theme.primary} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <View style={styles.itemWrap}><MeetupCard meetup={item} courtImageUrl={item.court_id ? courtImages.get(item.court_id) : null} onPress={() => router.push(`/meetup/${item.id}`)} /></View>}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />}
        ListEmptyComponent={<EmptyDiscovery kind={kind} nearestCourt={nearestCourt} distance={nearestCourt ? courtDistances.get(nearestCourt.id) : undefined} onCreate={createMeetup} onCourt={() => nearestCourt && router.push(`/court/${nearestCourt.id}`)} />}
      />
      {visible.length > 0 ? <AppFAB onPress={() => createMeetup()} style={[styles.fab, { bottom: 86 + Math.max(insets.bottom, 16) }]} /> : null}
    </SafeAreaView>
  );
}

function FilterButton({ icon, label, active, disabled, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; active: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.filterButton, active && styles.filterButtonActive, disabled && styles.filterButtonDisabled]}><Ionicons name={icon} size={17} color={active ? '#16C784' : '#AAB4C0'} /><Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text><Ionicons name="chevron-down" size={13} color="#707B87" /></Pressable>;
}

function EmptyDiscovery({ kind, nearestCourt, distance, onCreate, onCourt }: { kind: 'normal' | 'dupr'; nearestCourt: Court | null; distance?: number; onCreate: (preset?: string) => void; onCourt: () => void }) {
  return <View style={styles.discovery}>
    <View style={styles.emptyPanel}><Ionicons name={kind === 'dupr' ? 'shield-checkmark-outline' : 'flash-outline'} size={40} color="#707B87" /><Text style={styles.emptyTitle}>지금 열린 모임이 없어요</Text><Text style={styles.emptyBody}>조건을 바꾸거나 첫 번개 모임을 열어보세요.</Text><Pressable onPress={() => onCreate()} style={styles.createButton}><Text style={styles.createButtonText}>번개 모임 만들기</Text></Pressable></View>
    <View style={styles.section}><Text style={styles.sectionTitle}>빠르게 모임 열기</Text><QuickRow icon="time-outline" label="오늘 저녁 7시" onPress={() => onCreate(presetTime(0, 19))} /><QuickRow icon="time-outline" label="내일 오전 10시" onPress={() => onCreate(presetTime(1, 10))} /><QuickRow icon="calendar-outline" label="시간 직접 선택" onPress={() => onCreate()} /></View>
    {nearestCourt ? <View style={styles.section}><Text style={styles.sectionTitle}>가까운 코트</Text><Pressable onPress={onCourt} style={styles.courtRow}>{nearestCourt.image_url ? <View style={styles.courtImagePlaceholder}><Ionicons name="image-outline" size={22} color="#707B87" /></View> : <View style={styles.courtImagePlaceholder}><Ionicons name="tennisball-outline" size={23} color="#707B87" /></View>}<View style={{ flex: 1 }}><Text style={styles.courtName}>{nearestCourt.name}</Text><Text style={styles.courtMeta}>{nearestCourt.region} · {nearestCourt.indoor ? '실내' : '실외'} · {nearestCourt.open_hour}시–{nearestCourt.close_hour}시</Text></View>{distance != null ? <Text style={styles.distance}>{formatDistance(distance)}</Text> : null}<Ionicons name="chevron-forward" size={18} color="#707B87" /></Pressable></View> : null}
  </View>;
}

function QuickRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.quickRow}><Ionicons name={icon} size={20} color="#F8FAFC" /><Text style={styles.quickLabel}>{label}</Text><Ionicons name="chevron-forward" size={17} color="#707B87" /></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, list: { paddingBottom: 124 }, topContent: { gap: Spacing.three, paddingBottom: Spacing.three }, header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  kindTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.four }, kindTab: { flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, kindTabActive: { backgroundColor: '#16C784', borderColor: '#16C784' }, kindTabActiveDupr: { backgroundColor: '#2D6BD6', borderColor: '#2D6BD6' }, kindTabText: { fontSize: 14, fontWeight: '800', color: '#AAB4C0' }, kindTabTextActive: { color: '#07100D' }, kindTabTextActiveDupr: { color: '#FFFFFF' },
  filters: { flexDirection: 'row', gap: 7, paddingHorizontal: Spacing.four }, filterButton: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7, borderRadius: 13, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, filterButtonActive: { borderColor: 'rgba(22,199,132,0.55)', backgroundColor: 'rgba(22,199,132,0.10)' }, filterButtonDisabled: { opacity: 0.45 }, filterText: { color: '#AAB4C0', fontSize: 12, fontWeight: '800' }, filterTextActive: { color: '#16C784' },
  itemWrap: { marginHorizontal: Spacing.four, marginBottom: Spacing.three }, discovery: { gap: Spacing.four, paddingHorizontal: Spacing.four }, emptyPanel: { alignItems: 'center', gap: 8, padding: Spacing.four, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, emptyTitle: { marginTop: 4, fontSize: 19, fontWeight: '900', color: '#F8FAFC' }, emptyBody: { fontSize: 13, lineHeight: 19, color: '#AAB4C0', textAlign: 'center' }, createButton: { alignSelf: 'stretch', minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 14, backgroundColor: '#16C784' }, createButtonText: { color: '#07100D', fontSize: 15, fontWeight: '900' },
  section: { gap: 9 }, sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' }, quickRow: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Spacing.three, borderRadius: 14, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, quickLabel: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  courtRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 14, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, courtImagePlaceholder: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#182129' }, courtName: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' }, courtMeta: { color: '#AAB4C0', fontSize: 11, fontWeight: '600', marginTop: 5 }, distance: { color: '#AAB4C0', fontSize: 12, fontWeight: '800' }, fab: { position: 'absolute', right: Spacing.four },
});
