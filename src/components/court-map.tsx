import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { Court } from '@/lib/types';

export type CourtMapProps = {
  courts: Court[];
  onSelect: (id: string) => void;
  center?: { latitude: number; longitude: number };
};

// 웹/기본 폴백 — 네이티브 지도 SDK 는 앱(iOS/Android)에서만 렌더된다.
// (네이티브에서는 court-map.native.tsx 가 로드됨)
export default function CourtMap({ courts }: CourtMapProps) {
  const theme = useTheme();
  const withGeo = courts.filter((c) => c.latitude != null && c.longitude != null).length;
  return (
    <View style={[styles.center, { backgroundColor: theme.backgroundElement }]}>
      <Ionicons name="map-outline" size={44} color={theme.tabIconDefault} />
      <Text style={[styles.title, { color: theme.text }]}>지도는 앱에서 볼 수 있어요</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>좌표가 등록된 코트 {withGeo}곳</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  body: { fontSize: 13 },
});
