import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
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
    <AppCard onPress={onPress} style={[styles.card, ended && styles.ended]} padded={false}>
      {t.images?.[0] ? (
        <Image source={{ uri: t.images[0] }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverEmpty]}>
          <Ionicons name="trophy-outline" size={30} color="#707B87" />
        </View>
      )}
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={styles.time} numberOfLines={1}>{formatMeetupTime(t.start_at)}</Text>
          {registering ? (
            <Badge label="접수중" />
          ) : t.status === 'ongoing' ? (
            <Badge label="진행중" color="#16C784" bg="rgba(22,199,132,0.14)" />
          ) : (
            <Badge label={t.status === 'finished' ? '종료' : '취소됨'} color="#AAB4C0" bg="rgba(255,255,255,0.07)" />
          )}
        </View>

        <Text style={styles.title} numberOfLines={1}>{t.title}</Text>

        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color="#707B87" />
          <Text style={styles.meta} numberOfLines={1}>
            {t.venue || '장소 미정'}{t.region ? ` · ${t.region}` : ''}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.tags}>
            <Badge label={t.discipline === 'doubles' ? '복식' : '단식'} color="#FBBF24" bg="rgba(251,191,36,0.14)" />
            <View style={styles.pill}><Text style={styles.pillText}>{skillRangeLabel(t.skill_min, t.skill_max)}</Text></View>
          </View>
          <View style={styles.capacity}>
            <Ionicons name="people-outline" size={14} color="#AAB4C0" />
            <Text style={styles.capacityText}>{t.approved_count + t.pending_count}/{t.max_participants}{t.discipline === 'doubles' ? '팀' : '명'}</Text>
          </View>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 132, flexDirection: 'row', overflow: 'hidden' },
  cover: { width: 124, alignSelf: 'stretch', backgroundColor: '#151D25' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0, padding: AppSpacing.sm, gap: 7, justifyContent: 'space-between' },
  ended: { opacity: 0.62 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm },
  time: { flex: 1, fontSize: 12, fontWeight: '700', color: '#AAB4C0' },
  title: { ...Typography.cardTitle, color: '#F8FAFC' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { ...Typography.caption, color: '#AAB4C0', flex: 1 },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.xs },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: Radius.chip, backgroundColor: 'rgba(255,255,255,0.07)' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#AAB4C0' },
  capacity: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  capacityText: { fontSize: 12, fontWeight: '800', color: '#F8FAFC' },
});
