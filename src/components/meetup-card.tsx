import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMeetupTime, skillRangeLabel } from '@/lib/format';
import type { MeetupWithCounts } from '@/lib/types';

export function MeetupCard({
  meetup,
  onPress,
}: {
  meetup: MeetupWithCounts;
  onPress: () => void;
}) {
  const theme = useTheme();
  const full = meetup.participant_count >= meetup.max_players;
  const closed = meetup.status !== 'open';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={styles.topRow}>
        <Text style={[styles.time, { color: theme.primary }]}>
          {formatMeetupTime(meetup.start_time)}
        </Text>
        {closed ? (
          <Badge label={meetup.status === 'cancelled' ? '취소됨' : '마감'} color="#E5484D" bg="rgba(229,72,77,0.14)" />
        ) : full ? (
          <Badge label="정원 마감" color="#F5A623" bg="rgba(245,166,35,0.16)" />
        ) : (
          <Badge label="모집중" />
        )}
      </View>

      <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
        {meetup.title}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={15} color={theme.textSecondary} />
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {meetup.location_name}
          {meetup.region ? ` · ${meetup.region}` : ''}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.hostRow}>
          <Avatar nickname={meetup.host_nickname} uri={meetup.host_avatar_url} size={24} />
          <Text style={[styles.host, { color: theme.textSecondary }]}>{meetup.host_nickname}</Text>
        </View>

        <View style={styles.tags}>
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="ribbon-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.pillText, { color: theme.textSecondary }]}>
              {skillRangeLabel(meetup.skill_min, meetup.skill_max)}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="people-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.pillText, { color: theme.textSecondary }]}>
              {meetup.participant_count}/{meetup.max_players}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 8,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 14, fontWeight: '700' },
  title: { fontSize: 17, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 13, flex: 1 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  host: { fontSize: 13, fontWeight: '600' },
  tags: { flexDirection: 'row', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillText: { fontSize: 12, fontWeight: '600' },
});
