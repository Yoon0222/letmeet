import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CourtMap from '@/components/court-map';
import { CourtCard } from '@/components/court-card';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { distanceKm, type LatLng } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

// expo-location 은 네이티브 모듈이라 구 개발 빌드엔 없을 수 있음.
// 없으면 크래시 대신 null → 위치 없이 '전체 + 검색' 폴백.
let Location: typeof import('expo-location') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Location = require('expo-location');
} catch {
  Location = null;
}

const RADIUS_KM = 20;

export default function CourtListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [query, setQuery] = useState('');
  const [myLoc, setMyLoc] = useState<LatLng | null>(null);
  const [locState, setLocState] = useState<'locating' | 'ok' | 'off'>('locating');

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('courts').select('*').order('region', { ascending: true });
    if (error) {
      console.warn('[courts] load error', error.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 현재 위치 (한 번). 권한 거부/실패/시간초과 시 '전체 + 검색' 폴백.
  useEffect(() => {
    let cancelled = false;
    const loc = Location;
    (async () => {
      if (!loc) {
        setLocState('off');
        return;
      }
      try {
        const { status } = await loc.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          if (!cancelled) setLocState('off');
          return;
        }
        const pos = await Promise.race([
          loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Balanced }),
          new Promise<null>((res) => setTimeout(() => res(null), 8000)),
        ]);
        if (cancelled) return;
        if (pos) {
          setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocState('ok');
        } else {
          setLocState('off');
        }
      } catch {
        if (!cancelled) setLocState('off');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 거리 계산 + 필터 (검색 중이면 전체 대상, 아니면 RADIUS_KM 반경)
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const withDist = rows.map((c) => ({
    court: c,
    dist: myLoc && c.latitude != null && c.longitude != null ? distanceKm(myLoc, { lat: c.latitude, lng: c.longitude }) : null,
  }));
  let visible = searching
    ? withDist.filter(({ court }) => {
        const hay = `${court.name} ${court.region} ${court.address}`.toLowerCase();
        return hay.includes(q);
      })
    : myLoc
      ? withDist.filter(({ dist }) => dist != null && dist <= RADIUS_KM)
      : withDist; // 위치 없음 → 전체
  visible = [...visible].sort((a, b) => {
    if (a.dist != null && b.dist != null) return a.dist - b.dist;
    if (a.dist != null) return -1;
    if (b.dist != null) return 1;
    return a.court.name.localeCompare(b.court.name, 'ko');
  });

  const statusText = searching
    ? `'${query.trim()}' 검색 결과 ${visible.length}곳`
    : mode === 'map'
      ? `지도 · 전체 ${rows.length}곳`
      : locState === 'locating'
        ? '내 위치 확인 중…'
        : myLoc
          ? `내 주변 ${RADIUS_KM}km · ${visible.length}곳`
          : '위치 권한이 꺼져 있어요. 전체 코트예요 — 지역으로 검색해보세요.';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '코트 예약',
          headerRight: () => (
            <Pressable onPress={() => router.push('/court/reservations')} hitSlop={8}>
              <Text style={styles.headerLink}>내 예약</Text>
            </Pressable>
          ),
        }}
      />

      {!loading && rows.length > 0 ? (
        <View style={styles.header}>
          <View style={styles.topRow}>
            {/* 검색 */}
            <View style={styles.search}>
              <Ionicons name="search" size={16} color="#6B7280" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="지역·코트 이름 검색"
                placeholderTextColor="#9CA3AF"
                style={styles.searchInput}
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                </Pressable>
              ) : null}
            </View>
            {/* 목록/지도 토글 */}
            <View style={styles.toggle}>
              {(['list', 'map'] as const).map((m) => {
                const active = mode === m;
                return (
                  <Pressable key={m} onPress={() => setMode(m)} style={[styles.toggleBtn, active && styles.toggleBtnActive]}>
                    <Ionicons name={m === 'list' ? 'list' : 'map'} size={16} color={active ? '#16C784' : '#6B7280'} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={styles.status}>{statusText}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : mode === 'map' ? (
        // 지도는 공간 탐색용 — 반경 제한 없이 전부(검색 중이면 검색결과)
        <CourtMap
          courts={searching ? visible.map((v) => v.court) : rows}
          center={myLoc ? { latitude: myLoc.lat, longitude: myLoc.lng } : undefined}
          focus={searching ? q : ''}
          onSelect={(id) => router.push(`/court/${id}`)}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={({ court }) => court.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: { court, dist } }) => (
            <CourtCard court={court} dist={dist} onPress={() => router.push(`/court/${court.id}`)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={searching ? 'search' : 'location-outline'} size={44} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>
                {rows.length === 0 ? '등록된 코트가 없어요' : searching ? '검색 결과가 없어요' : `주변 ${RADIUS_KM}km에 코트가 없어요`}
              </Text>
              <Text style={styles.emptyBody}>
                {rows.length === 0 ? '코트가 등록되면 여기에 표시됩니다.' : searching ? '다른 지역명으로 검색해보세요.' : '지역·코트 이름으로 검색하면 더 넓게 찾을 수 있어요.'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  headerLink: { color: '#16C784', fontWeight: '700', fontSize: 15 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two, gap: 8 },
  topRow: { flexDirection: 'row', gap: 8 },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0, color: '#111827' },
  toggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 3,
    gap: 2,
  },
  toggleBtn: { alignItems: 'center', justifyContent: 'center', width: 38, height: 36, borderRadius: 9 },
  toggleBtnActive: { backgroundColor: '#F0FDF4' },
  status: { fontSize: 13, color: '#6B7280' },
  list: { padding: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: Spacing.four },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  emptyBody: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
});
