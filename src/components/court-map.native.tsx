import { NaverMapMarkerOverlay, NaverMapView, type NaverMapViewRef } from '@mj-studio/react-native-naver-map';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
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
  const ref = useRef<NaverMapViewRef>(null);
  const pts = geo(courts);
  // 내 위치 우선, 없으면 코트 평균, 그것도 없으면 서울
  const center = centerProp ?? (pts.length ? { latitude: avg(pts.map((p) => p.latitude as number)), longitude: avg(pts.map((p) => p.longitude as number)) } : SEOUL);

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
      <NaverMapView ref={ref} style={styles.fill} initialCamera={{ ...center, zoom: 11 }} isShowLocationButton={false}>
        {pts.map((c) => (
          <NaverMapMarkerOverlay
            key={c.id}
            latitude={c.latitude as number}
            longitude={c.longitude as number}
            onTap={() => onSelect(c.id)}
            caption={{ text: c.name, color: Brand.primary }}
          />
        ))}
      </NaverMapView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
