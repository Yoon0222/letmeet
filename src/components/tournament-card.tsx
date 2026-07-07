import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMeetupTime, skillRangeLabel } from '@/lib/format';
import type { TournamentWithCounts } from '@/lib/types';

export function TournamentCard({
  tournament,
  onPress,
}: {
  tournament: TournamentWithCounts;
  onPress: () => void;
}) {
  const theme = useTheme();
  const t = tournament;
  const registering = t.status === 'registration';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={styles.topRow}>
        <Text style={[styles.time, { color: theme.primary }]}>{formatMeetupTime(t.start_at)}</Text>
        {registering ? (
          <Badge label="접수중" />
        ) : t.status === 'ongoing' ? (
          <Badge label="진행중" color="#185FA5" bg="rgba(45,127,249,0.14)" />
        ) : (
          <Badge
            label={t.status === 'finished' ? '종료' : '취소됨'}
            color="#60646C"
            bg="rgba(136,135,128,0.14)"
          />
        )}
      </View>

      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
          {t.title}
        </Text>
        <Badge
          label={t.discipline === 'doubles' ? '복식' : '단식'}
          color="#7A4E00"
          bg="rgba(245,166,35,0.16)"
        />
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={15} color={theme.textSecondary} />
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {t.venue || '장소 미정'}
          {t.region ? ` · ${t.region}` : ''}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.hostRow}>
          <Avatar nickname={t.organizer_nickname} uri={t.organizer_avatar_url} size={24} />
          <Text style={[styles.host, { color: theme.textSecondary }]}>{t.organizer_nickname}</Text>
        </View>
        <View style={styles.tags}>
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="ribbon-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.pillText, { color: theme.textSecondary }]}>
              {skillRangeLabel(t.skill_min, t.skill_max)}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="people-outline" size={13} color={theme.textSecondary} />
            <Text style={[styles.pillText, { color: theme.textSecondary }]}>
              {t.approved_count}/{t.max_participants}{t.discipline === 'doubles' ? '팀' : '명'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: Spacing.three, gap: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 14, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 13, flex: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  host: { fontSize: 13, fontWeight: '600' },
  tags: { flexDirection: 'row', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pillText: { fontSize: 12, fontWeight: '600' },
});
