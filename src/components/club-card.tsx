import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppSpacing, Radius, Typography } from '@/theme';
import type { ClubWithCounts } from '@/lib/types';

export function ClubCard({ club, onPress }: { club: ClubWithCounts; onPress: () => void }) {
  return (
    <AppCard onPress={onPress} style={styles.card}>
      {club.image_url ? (
        <Image source={{ uri: club.image_url }} style={styles.cover} />
      ) : (
        <View style={styles.cover}>
          <Ionicons name="people-outline" size={24} color="#16C784" />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{club.name}</Text>
          {club.tier === 'premium' ? <Badge label="Premium" style={styles.badge} /> : null}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {club.region || '지역 미설정'} · 멤버 {club.member_count}명
        </Text>
      </View>
      <Avatar nickname={club.owner_nickname} uri={club.owner_avatar_url} size={34} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  cover: {
    width: 52,
    height: 52,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...Typography.body, fontWeight: '800', color: '#F8FAFC' },
  meta: { ...Typography.caption, color: '#AAB4C0' },
  badge: { paddingHorizontal: 8, paddingVertical: 3 },
});
