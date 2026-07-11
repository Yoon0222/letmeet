import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppSpacing, Radius, Typography } from '@/theme';
import { formatMeetupTime, skillRangeLabel } from '@/lib/format';
import type { MeetupWithCounts } from '@/lib/types';

export function MeetupCard({
  meetup,
  onPress,
}: {
  meetup: MeetupWithCounts;
  onPress: () => void;
}) {
  const full = meetup.participant_count >= meetup.max_players;
  const closed = meetup.status !== 'open';

  return (
    <AppCard onPress={onPress} style={styles.card}>
      <View style={styles.topRow}>
        <Text style={styles.time}>{formatMeetupTime(meetup.start_time)}</Text>
        {closed ? (
          <Badge label={meetup.status === 'cancelled' ? '취소됨' : '마감'} color="#DC2626" bg="#FEE2E2" />
        ) : full ? (
          <Badge label="정원마감" color="#D97706" bg="#FEF3C7" />
        ) : (
          <Badge label="모집중" />
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {meetup.title}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={16} color="#6B7280" />
        <Text style={styles.meta} numberOfLines={1}>
          {meetup.location_name}
          {meetup.region ? ` · ${meetup.region}` : ''}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.hostRow}>
          <Avatar nickname={meetup.host_nickname} uri={meetup.host_avatar_url} size={28} />
          <Text style={styles.host} numberOfLines={1}>{meetup.host_nickname}</Text>
        </View>

        <View style={styles.tags}>
          <View style={styles.pill}>
            <Ionicons name="ribbon-outline" size={13} color="#6B7280" />
            <Text style={styles.pillText}>{skillRangeLabel(meetup.skill_min, meetup.skill_max)}</Text>
          </View>
          <View style={styles.pill}>
            <Ionicons name="people-outline" size={13} color="#6B7280" />
            <Text style={styles.pillText}>
              {meetup.participant_count}/{meetup.max_players}
            </Text>
          </View>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: AppSpacing.xs,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm },
  time: { fontSize: 14, fontWeight: '800', color: '#16C784' }, // 날짜는 작게(제목보다), 그린 라벨
  title: { ...Typography.cardTitle, color: '#111827' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { ...Typography.caption, color: '#6B7280', flex: 1 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.xs,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  host: { fontSize: 13, fontWeight: '600', color: '#6B7280', flex: 1 },
  tags: { flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    borderCurve: 'continuous',
    backgroundColor: '#F6F7F9',
  },
  pillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
});
