import { Ionicons } from '@expo/vector-icons';
import { NaverMapMarkerOverlay, NaverMapView, type NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Court } from '@/lib/types';

export type CourtMapProps = {
  courts: Court[];
  onSelect: (id: string) => void;
  center?: { latitude: number; longitude: number };
  /** 검색어 등 — 값이 바뀌면 courts(검색결과)가 보이도록 카메라 이동 */
  focus?: string;
};

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
const geo = (courts: Court[]) => courts.filter((c) => c.latitude != null && c.longitude != null);

// 네이티브 전용 — 네이버 지도 SDK. (웹에서는 court-map.tsx 폴백이 로드됨)
export default function CourtMap({ courts, onSelect, center: centerProp, focus }: CourtMapProps) {
  const theme = useTheme();
  const ref = useRef<NaverMapViewRef>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pts = geo(courts);
  const center = centerProp ?? (pts.length ? { latitude: avg(pts.map((p) => p.latitude as number)), longitude: avg(pts.map((p) => p.longitude as number)) } : SEOUL);
  const selected = pts.find((c) => c.id === selectedId) ?? null;

  // 검색 시: 결과 코트들이 화면에 들어오도록 카메라 이동
  useEffect(() => {
    if (!focus) return;
    const p = geo(courts);
    if (p.length === 0) return;
    const lats = p.map((c) => c.latitude as number);
    const lngs = p.map((c) => c.longitude as number);
    if (p.length === 1) {
      ref.current?.animateCameraTo({ latitude: lats[0], longitude: lngs[0], zoom: 13 });
      return;
    }
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padLat = Math.max(0.005, (maxLat - minLat) * 0.15);
    const padLng = Math.max(0.005, (maxLng - minLng) * 0.15);
    ref.current?.animateRegionTo({
      latitude: minLat - padLat,
      longitude: minLng - padLng,
      latitudeDelta: maxLat - minLat + padLat * 2,
      longitudeDelta: maxLng - minLng + padLng * 2,
    });
  }, [focus, courts]);

  return (
    <View style={styles.fill}>
      <NaverMapView
        ref={ref}
        style={styles.fill}
        initialCamera={{ ...center, zoom: 11 }}
        isShowLocationButton={false}
        onTapMap={() => setSelectedId(null)}>
        {pts.map((c) => (
          <NaverMapMarkerOverlay
            key={c.id}
            latitude={c.latitude as number}
            longitude={c.longitude as number}
            onTap={() => setSelectedId(c.id)}
            caption={{ text: c.name, color: Brand.primary }}
          />
        ))}
      </NaverMapView>

      {/* 마커 탭 시 사진·정보 팝업 */}
      {selected ? (
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Pressable style={styles.cardRow} onPress={() => onSelect(selected.id)}>
            {selected.images?.[0] ? (
              <Image source={{ uri: selected.images[0] }} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="tennisball-outline" size={22} color={theme.tabIconDefault} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                {selected.name}
              </Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                {selected.region || '지역 미설정'} · {selected.indoor ? '실내' : '실외'} · {selected.open_hour}–{selected.close_hour}시
              </Text>
              <Text style={[styles.price, { color: theme.primary }]}>
                {selected.hourly_price > 0 ? `시간당 ${selected.hourly_price.toLocaleString()}원` : '무료'}
              </Text>
            </View>
            <View style={[styles.goBtn, { backgroundColor: theme.primary }]}>
              <Text style={styles.goText}>예약</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setSelectedId(null)} hitSlop={8} style={styles.close}>
            <Ionicons name="close" size={16} color={theme.textSecondary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { position: 'absolute', left: 12, right: 12, bottom: 16, borderRadius: 16, borderWidth: 1, padding: 12, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 60, height: 60, borderRadius: 12 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700', paddingRight: 20 },
  meta: { fontSize: 12, marginTop: 3 },
  price: { fontSize: 13, fontWeight: '700', marginTop: 5 },
  goBtn: { borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  goText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  close: { position: 'absolute', right: 8, top: 8 },
});
