import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { AppSpacing, Radius, Typography } from '@/theme';
import type { ClubWithCounts } from '@/lib/types';

export function ClubCard({ club, onPress }: { club: ClubWithCounts; onPress: () => void }) {
  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.cover}>
        <Ionicons name="people-outline" size={24} color="#16C784" />
      </View>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{club.name}</Text>
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
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  name: { ...Typography.body, fontWeight: '700', color: '#111827' },
  meta: { ...Typography.caption, color: '#6B7280' },
});
