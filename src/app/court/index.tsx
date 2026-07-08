import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CourtMap from '@/components/court-map';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { distanceKm, formatDistance, type LatLng } from '@/lib/geo';
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

const RADIUS_KM = 5;

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

  // 거리 계산 + 필터 (검색 중이면 전체 대상, 아니면 5km 반경)
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
    : locState === 'locating'
      ? '내 위치 확인 중…'
      : myLoc
        ? `내 주변 ${RADIUS_KM}km · ${visible.length}곳`
        : '위치 권한이 꺼져 있어요. 전체 코트예요 — 지역으로 검색해보세요.';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: '코트 예약',
          headerRight: () => (
            <Pressable onPress={() => router.push('/court/reservations')} hitSlop={8}>
              <Text style={{ color: theme.primary, fontWeight: '700', fontSize: 15 }}>내 예약</Text>
            </Pressable>
          ),
        }}
      />

      {!loading && rows.length > 0 ? (
        <View style={styles.header}>
          <View style={styles.topRow}>
            {/* 검색 */}
            <View style={[styles.search, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="search" size={16} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="지역·코트 이름 검색"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <Pressable onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={16} color={theme.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            {/* 목록/지도 토글 */}
            <View style={[styles.toggle, { backgroundColor: theme.backgroundElement }]}>
              {(['list', 'map'] as const).map((m) => {
                const active = mode === m;
                return (
                  <Pressable key={m} onPress={() => setMode(m)} style={[styles.toggleBtn, active && { backgroundColor: theme.card }]}>
                    <Ionicons name={m === 'list' ? 'list' : 'map'} size={16} color={active ? theme.primary : theme.textSecondary} />
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={[styles.status, { color: theme.textSecondary }]}>{statusText}</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : mode === 'map' ? (
        <CourtMap
          courts={visible.map((v) => v.court)}
          center={myLoc ? { latitude: myLoc.lat, longitude: myLoc.lng } : undefined}
          onSelect={(id) => router.push(`/court/${id}`)}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={({ court }) => court.id}
          contentContainerStyle={styles.list}
          renderItem={({ item: { court, dist } }) => (
            <Pressable
              onPress={() => router.push(`/court/${court.id}`)}
              style={({ pressed }) => [styles.card, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 }]}>
              {court.images?.[0] ? (
                <Image source={{ uri: court.images[0] }} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="tennisball-outline" size={22} color={theme.tabIconDefault} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                    {court.name}
                  </Text>
                  {dist != null ? (
                    <View style={[styles.distPill, { backgroundColor: theme.backgroundElement }]}>
                      <Ionicons name="location" size={11} color={theme.primary} />
                      <Text style={[styles.distText, { color: theme.primary }]}>{formatDistance(dist)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {court.region || '지역 미설정'} · {court.indoor ? '실내' : '실외'} · {court.open_hour}–{court.close_hour}시
                </Text>
                <Text style={[styles.price, { color: theme.primary }]}>
                  {court.hourly_price > 0 ? `시간당 ${court.hourly_price.toLocaleString()}원` : '무료'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </Pressable>
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
              <Ionicons name={searching ? 'search' : 'location-outline'} size={44} color={theme.tabIconDefault} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {rows.length === 0 ? '등록된 코트가 없어요' : searching ? '검색 결과가 없어요' : '주변 5km에 코트가 없어요'}
              </Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
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
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two, gap: 8 },
  topRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  toggle: { flexDirection: 'row', borderRadius: 10, padding: 3, gap: 2 },
  toggleBtn: { alignItems: 'center', justifyContent: 'center', width: 38, height: 34, borderRadius: 8 },
  status: { fontSize: 13 },
  list: { padding: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: Spacing.three },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, fontWeight: '700', flexShrink: 1 },
  distPill: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  distText: { fontSize: 12, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 3 },
  price: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80, paddingHorizontal: Spacing.four },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center' },
});
