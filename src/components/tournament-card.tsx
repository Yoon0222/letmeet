import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppSpacing, Radius, Typography } from '@/theme';
import { formatMeetupTime, skillRangeLabel } from '@/lib/format';
import type { TournamentWithCounts } from '@/lib/types';

export function TournamentCard({
  tournament,
  onPress,
}: {
  tournament: TournamentWithCounts;
  onPress: () => void;
}) {
  const t = tournament;
  const registering = t.status === 'registration';
  const ended = t.status === 'finished' || t.status === 'cancelled';

  return (
    <AppCard onPress={onPress} style={[styles.card, ended && styles.ended]}>
      <View style={styles.topRow}>
        <Text style={styles.time}>{formatMeetupTime(t.start_at)}</Text>
        {registering ? (
          <Badge label="접수중" />
        ) : t.status === 'ongoing' ? (
          <Badge label="진행중" color="#0F8F5F" bg="#DCFCE7" />
        ) : (
          <Badge label={t.status === 'finished' ? '종료' : '취소됨'} color="#6B7280" bg="#F6F7F9" />
        )}
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>{t.title}</Text>
        <Badge label={t.discipline === 'doubles' ? '복식' : '단식'} color="#D97706" bg="#FEF3C7" />
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={15} color="#6B7280" />
        <Text style={styles.meta} numberOfLines={1}>
          {t.venue || '장소 미정'}{t.region ? ` · ${t.region}` : ''}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <View style={styles.hostRow}>
          <Avatar nickname={t.organizer_nickname} uri={t.organizer_avatar_url} size={28} />
          <Text style={styles.host} numberOfLines={1}>{t.organizer_nickname}</Text>
        </View>
        <View style={styles.tags}>
          <View style={styles.pill}>
            <Ionicons name="ribbon-outline" size={13} color="#6B7280" />
            <Text style={styles.pillText}>{skillRangeLabel(t.skill_min, t.skill_max)}</Text>
          </View>
          <View style={styles.pill}>
            <Ionicons name="people-outline" size={13} color="#6B7280" />
            <Text style={styles.pillText}>
              {t.approved_count}/{t.max_participants}{t.discipline === 'doubles' ? '팀' : '명'}
            </Text>
          </View>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: AppSpacing.xs },
  ended: { opacity: 0.62 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm },
  time: { fontSize: 20, fontWeight: '800', color: '#111827' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: AppSpacing.xs },
  title: { ...Typography.cardTitle, color: '#111827', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...Typography.caption, color: '#6B7280', flex: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm, marginTop: AppSpacing.xs },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  host: { fontSize: 13, fontWeight: '600', color: '#6B7280', flex: 1 },
  tags: { flexDirection: 'row', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: Radius.chip, backgroundColor: '#F6F7F9' },
  pillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
});
