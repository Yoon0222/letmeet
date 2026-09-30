import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CourtCard } from '@/components/court-card';
import CourtMap from '@/components/court-map';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { distanceKm, formatDistance, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';
import { AppColors } from '@/theme';

let Location: typeof import('expo-location') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Location = require('expo-location');
} catch {
  Location = null;
}

const ymd = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export default function CourtListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const [rows, setRows] = useState<Court[]>([]);
  const [openToday, setOpenToday] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('map');
  const [query, setQuery] = useState('');
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState<5 | 20 | null>(null);
  const [todayOnly, setTodayOnly] = useState(false);
  const [indoorOnly, setIndoorOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const today = ymd(new Date());
    const [{ data, error }, { data: openRows }] = await Promise.all([
      supabase.from('courts').select('*').order('region', { ascending: true }),
      supabase.from('court_open_days').select('court_id').eq('day', today),
    ]);
    if (error) {
      console.warn('[courts] load error', error.message);
      setRows([]);
    } else {
      const next = (data as Court[] | null) ?? [];
      setRows(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    }
    setOpenToday(new Set((openRows ?? []).map((item) => item.court_id)));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    let cancelled = false;
    const loc = Location;
    void (async () => {
      if (!loc) return;
      try {
        const { status } = await loc.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const lastPosition = await loc.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000, requiredAccuracy: 500 });
        if (lastPosition && !cancelled) {
          setMyLoc({ lat: lastPosition.coords.latitude, lng: lastPosition.coords.longitude });
        }

        const position = await Promise.race([
          loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Balanced }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);
        if (position && !cancelled) setMyLoc({ lat: position.coords.latitude, lng: position.coords.longitude });
      } catch {
        // 위치 권한이 없어도 검색과 전체 지도는 동작한다.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const withDistance = useMemo(() => rows.map((court) => ({
    court,
    dist: myLoc && court.latitude != null && court.longitude != null ? distanceKm(myLoc, { lat: court.latitude, lng: court.longitude }) : null,
  })), [myLoc, rows]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => withDistance.filter(({ court, dist }) => {
    if (q && !`${court.name} ${court.region} ${court.address}`.toLowerCase().includes(q)) return false;
    if (radius && (dist == null || dist > radius)) return false;
    if (todayOnly && !(openToday.has(court.id) || court.auto_open_days > 0)) return false;
    if (indoorOnly && !court.indoor) return false;
    if (freeOnly && court.hourly_price > 0) return false;
    return true;
  }).sort((a, b) => {
    if (a.dist != null && b.dist != null) return a.dist - b.dist;
    if (a.dist != null) return -1;
    if (b.dist != null) return 1;
    return a.court.name.localeCompare(b.court.name, 'ko');
  }), [freeOnly, indoorOnly, openToday, q, radius, todayOnly, withDistance]);

  const selectedEntry = visible.find(({ court }) => court.id === selectedId) ?? visible[0] ?? null;
  const selected = selectedEntry?.court ?? null;
  function cycleRadius() {
    if (!myLoc) return;
    setRadius((value) => value == null ? 5 : value === 5 ? 20 : null);
  }

  if (loading) return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><View style={styles.center}><ActivityIndicator color={theme.primary} /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false, title: '코트 예약' }} />
      <View style={styles.header}>
        <View style={styles.titleRow}><Text style={styles.screenTitle}>코트 예약</Text><Pressable onPress={() => router.push(session ? '/court/reservations' : '/(auth)/sign-in')} style={styles.myReservationLink}><Ionicons name="calendar-outline" size={16} color="#16C784" /><Text style={styles.headerLink}>내 예약</Text></Pressable></View>
        <View style={styles.searchRow}>
          <View style={styles.search}><Ionicons name="search" size={18} color={AppColors.textMuted} /><TextInput value={query} onChangeText={setQuery} placeholder="지역·코트 이름 검색" placeholderTextColor="#707B87" style={styles.searchInput} />{query ? <Pressable onPress={() => setQuery('')} hitSlop={8}><Ionicons name="close-circle" size={17} color="#707B87" /></Pressable> : null}</View>
          <View style={styles.toggle}>{(['map', 'list'] as const).map((item) => <Pressable key={item} onPress={() => setMode(item)} style={[styles.toggleBtn, mode === item && styles.toggleBtnActive]}><Ionicons name={item === 'map' ? 'map' : 'list'} size={18} color={mode === item ? '#07100D' : '#AAB4C0'} /></Pressable>)}</View>
        </View>
        <View style={styles.filters}>
          <FilterChip label={radius ? `${radius}km 이내` : '거리'} icon="location-outline" active={!!radius} disabled={!myLoc} onPress={cycleRadius} />
          <FilterChip label="오늘 예약 가능" icon="calendar-outline" active={todayOnly} onPress={() => setTodayOnly((value) => !value)} />
          <FilterChip label="실내" icon="home-outline" active={indoorOnly} onPress={() => setIndoorOnly((value) => !value)} />
          <FilterChip label={freeOnly ? '무료만' : '가격'} icon="cash-outline" active={freeOnly} onPress={() => setFreeOnly((value) => !value)} />
        </View>
      </View>

      {mode === 'map' ? (
        <View style={styles.mapMode}>
          <View style={styles.mapWrap}><CourtMap courts={visible.map(({ court }) => court)} center={myLoc ? { latitude: myLoc.lat, longitude: myLoc.lng } : undefined} focus={q} showCard={false} onPreview={setSelectedId} onSelect={(id) => router.push(`/court/${id}`)} /></View>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>주변 코트 {visible.length}곳</Text>
            {selected ? <View style={styles.selectedCard}>
              <Pressable onPress={() => router.push(`/court/${selected.id}`)} style={styles.courtInfoRow}>
                {selected.images?.[0] || selected.image_url ? <Image source={{ uri: selected.images?.[0] ?? selected.image_url ?? '' }} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]}><Ionicons name="tennisball-outline" size={24} color="#707B87" /></View>}
                <View style={{ flex: 1 }}><Text style={styles.courtName}>{selected.name}</Text><Text style={styles.courtMeta}>{selected.region || '지역 미설정'} · {selected.indoor ? '실내' : '실외'}{selectedEntry?.dist != null ? ` · ${formatDistance(selectedEntry.dist)}` : ''}</Text>{openToday.has(selected.id) || selected.auto_open_days > 0 ? <Text style={styles.available}>오늘 예약 가능</Text> : null}<Text style={styles.price}>{selected.hourly_price ? `시간당 ${selected.hourly_price.toLocaleString()}원` : '무료'}</Text></View><Ionicons name="chevron-forward" size={18} color="#707B87" />
              </Pressable>
              <Pressable onPress={() => router.push(`/court/${selected.id}`)} style={styles.reserveButton}><Text style={styles.reserveText}>코트 상세 보기</Text></Pressable>
            </View> : <Text style={styles.noCourt}>조건에 맞는 코트가 없어요.</Text>}
          </View>
        </View>
      ) : (
        <FlatList data={visible} keyExtractor={({ court }) => court.id} contentContainerStyle={styles.list} renderItem={({ item }) => <CourtCard court={item.court} dist={item.dist} onPress={() => router.push(`/court/${item.court.id}`)} />} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.primary} />} ListEmptyComponent={<View style={styles.empty}><Ionicons name="search" size={40} color="#707B87" /><Text style={styles.emptyTitle}>조건에 맞는 코트가 없어요</Text><Text style={styles.emptyBody}>검색어나 필터를 바꿔보세요.</Text></View>} />
      )}
    </SafeAreaView>
  );
}

function FilterChip({ label, icon, active, disabled, onPress }: { label: string; icon: keyof typeof Ionicons.glyphMap; active: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive, disabled && styles.filterChipDisabled]}><Ionicons name={icon} size={14} color={active ? '#16C784' : '#AAB4C0'} /><Text style={[styles.filterText, active && styles.filterTextActive]} numberOfLines={1}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: 10, gap: 10 }, titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, screenTitle: { color: '#F8FAFC', fontSize: 28, fontWeight: '900' }, myReservationLink: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }, headerLink: { color: '#16C784', fontSize: 13, fontWeight: '900' },
  searchRow: { flexDirection: 'row', gap: 8 }, search: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, searchInput: { flex: 1, color: '#F8FAFC', fontSize: 14, padding: 0 }, toggle: { flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, toggleBtn: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, toggleBtnActive: { backgroundColor: '#16C784' },
  filters: { flexDirection: 'row', gap: 6 }, filterChip: { minWidth: 0, flex: 1, minHeight: 35, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, borderRadius: 12, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, filterChipActive: { borderColor: 'rgba(22,199,132,0.55)', backgroundColor: 'rgba(22,199,132,0.10)' }, filterChipDisabled: { opacity: 0.42 }, filterText: { flexShrink: 1, color: '#AAB4C0', fontSize: 10, fontWeight: '800' }, filterTextActive: { color: '#16C784' },
  mapMode: { flex: 1 }, mapWrap: { flex: 1, minHeight: 220 }, sheet: { backgroundColor: '#070A0D', paddingHorizontal: Spacing.three, paddingTop: 7, paddingBottom: 106, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(255,255,255,0.09)' }, handle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#707B87', marginBottom: 8 }, sheetTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '900', marginBottom: 8 }, selectedCard: { gap: 8 }, courtInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, thumb: { width: 68, height: 68, borderRadius: 12, backgroundColor: '#10161D' }, thumbEmpty: { alignItems: 'center', justifyContent: 'center' }, courtName: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' }, courtMeta: { color: '#AAB4C0', fontSize: 11, fontWeight: '600', marginTop: 2 }, available: { color: '#16C784', fontSize: 11, fontWeight: '800', marginTop: 3 }, price: { color: '#F8FAFC', fontSize: 13, fontWeight: '900', marginTop: 3 }, reserveButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#16C784' }, reserveText: { color: '#07100D', fontSize: 14, fontWeight: '900' }, noCourt: { color: '#AAB4C0', fontSize: 13, paddingVertical: 20, textAlign: 'center' },
  list: { padding: Spacing.three, gap: Spacing.three, paddingBottom: 124 }, empty: { alignItems: 'center', gap: 8, paddingTop: 60 }, emptyTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' }, emptyBody: { color: '#AAB4C0', fontSize: 13 },
});
