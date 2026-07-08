import { NaverMapMarkerOverlay, NaverMapView } from '@mj-studio/react-native-naver-map';
import { StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';
import type { Court } from '@/lib/types';

export type CourtMapProps = {
  courts: Court[];
  onSelect: (id: string) => void;
  center?: { latitude: number; longitude: number };
};

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const avg = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;

// 네이티브 전용 — 네이버 지도 SDK. (웹에서는 court-map.tsx 폴백이 로드됨)
export default function CourtMap({ courts, onSelect, center: centerProp }: CourtMapProps) {
  const pts = courts.filter((c) => c.latitude != null && c.longitude != null);
  // 내 위치 우선, 없으면 코트 평균, 그것도 없으면 서울
  const center =
    centerProp ??
    (pts.length ? { latitude: avg(pts.map((p) => p.latitude as number)), longitude: avg(pts.map((p) => p.longitude as number)) } : SEOUL);

  return (
    <View style={styles.fill}>
      <NaverMapView style={styles.fill} initialCamera={{ ...center, zoom: 11 }} isShowLocationButton={false}>
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
