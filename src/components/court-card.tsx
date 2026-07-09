import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { AppSpacing, Radius } from '@/theme';
import { formatDistance } from '@/lib/geo';
import type { Court } from '@/lib/types';

type CourtCardProps = {
  court: Court;
  dist?: number | null;
  onPress: () => void;
};

export function CourtCard({ court, dist, onPress }: CourtCardProps) {
  return (
    <AppCard onPress={onPress} style={styles.card}>
      {court.images?.[0] ? (
        <Image source={{ uri: court.images[0] }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          <Ionicons name="tennisball-outline" size={24} color="#9CA3AF" />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{court.name}</Text>
          {dist != null ? (
            <View style={styles.distPill}>
              <Ionicons name="location-outline" size={12} color="#16C784" />
              <Text style={styles.distText}>{formatDistance(dist)}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {court.region || '지역 미설정'} · {court.indoor ? '실내' : '실외'} · {court.open_hour}시-{court.close_hour}시
        </Text>
        <Text style={styles.price}>
          {court.hourly_price > 0 ? `시간당 ${court.hourly_price.toLocaleString()}원` : '무료'}
        </Text>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: AppSpacing.sm },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
    backgroundColor: '#F6F7F9',
  },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111827' },
  distPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 16, backgroundColor: '#DCFCE7' },
  distText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  meta: { fontSize: 13, color: '#6B7280' },
  price: { fontSize: 16, fontWeight: '700', color: '#111827' },
});
