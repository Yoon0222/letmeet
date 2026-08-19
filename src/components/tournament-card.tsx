import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

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
      {t.images?.[0] ? <Image source={{ uri: t.images[0] }} style={styles.cover} /> : null}
      <View style={styles.topRow}>
        <Text style={styles.time}>{formatMeetupTime(t.start_at)}</Text>
        {registering ? (
          <Badge label="접수중" />
        ) : t.status === 'ongoing' ? (
          <Badge label="진행중" color="#16C784" bg="rgba(22,199,132,0.14)" />
        ) : (
          <Badge label={t.status === 'finished' ? '종료' : '취소됨'} color="#AAB4C0" bg="rgba(255,255,255,0.07)" />
        )}
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>{t.title}</Text>
        <Badge label={t.discipline === 'doubles' ? '복식' : '단식'} color="#FBBF24" bg="rgba(251,191,36,0.14)" />
      </View>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={15} color="#707B87" />
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
            <Ionicons name="ribbon-outline" size={13} color="#AAB4C0" />
            <Text style={styles.pillText}>{skillRangeLabel(t.skill_min, t.skill_max)}</Text>
          </View>
          <View style={styles.pill}>
            <Ionicons name="people-outline" size={13} color="#AAB4C0" />
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
  cover: { width: '100%', height: 140, borderRadius: Radius.card, borderCurve: 'continuous', backgroundColor: '#151D25', marginBottom: AppSpacing.xs },
  ended: { opacity: 0.62 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm },
  time: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: AppSpacing.xs },
  title: { ...Typography.cardTitle, color: '#F8FAFC', flex: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...Typography.caption, color: '#AAB4C0', flex: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm, marginTop: AppSpacing.xs },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  host: { fontSize: 13, fontWeight: '600', color: '#AAB4C0', flex: 1 },
  tags: { flexDirection: 'row', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: Radius.chip, backgroundColor: 'rgba(255,255,255,0.07)' },
  pillText: { fontSize: 13, fontWeight: '700', color: '#AAB4C0' },
});
