import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppSpacing, Radius, Typography } from '@/theme';
import { formatMeetupTime } from '@/lib/format';
import type { MeetupWithCounts } from '@/lib/types';

export function MeetupCard({
  meetup,
  courtImageUrl,
  onPress,
}: {
  meetup: MeetupWithCounts;
  courtImageUrl?: string | null;
  onPress: () => void;
}) {
  const full = meetup.participant_count >= meetup.max_players;
  const closed = meetup.status !== 'open';

  return (
    <AppCard onPress={onPress} style={styles.card} padded={false}>
      <Image
        source={courtImageUrl ? { uri: courtImageUrl } : require('@/assets/images/play-store-feature-graphic.png')}
        style={[
          styles.backgroundImage,
          courtImageUrl ? styles.backgroundPhoto : styles.backgroundFallback,
        ]}
        resizeMode="cover"
      />
      <View style={[styles.overlay, courtImageUrl ? styles.overlayPhoto : styles.overlayFallback]} />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.time}>{formatMeetupTime(meetup.start_time)}</Text>
          <View style={styles.badges}>
            {meetup.dupr_premium ? (
              <Badge label="DUPR+" color="#8B5CF6" bg="rgba(139,92,246,0.14)" />
            ) : meetup.dupr_certified ? (
              <Badge label="DUPR" color="#2D6BD6" bg="rgba(45,107,214,0.14)" />
            ) : null}
            {closed ? (
              <Badge label={meetup.status === 'cancelled' ? '취소됨' : '마감'} color="#F87171" bg="rgba(248,113,113,0.14)" />
            ) : full ? (
              <Badge label="정원마감" color="#FBBF24" bg="rgba(251,191,36,0.14)" />
            ) : (
              <Badge label="모집중" />
            )}
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {meetup.title}
        </Text>

        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={16} color="#AAB4C0" />
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
            <View style={[styles.pill, meetup.fee > 0 && styles.feePill]}>
              <Ionicons name="cash-outline" size={13} color={meetup.fee > 0 ? '#16C784' : '#AAB4C0'} />
              <Text style={[styles.pillText, meetup.fee > 0 && styles.feePillText]}>
                {meetup.fee > 0 ? `${meetup.fee.toLocaleString()}원` : '무료'}
              </Text>
            </View>
            <View style={styles.pill}>
              <Ionicons name="people-outline" size={13} color="#AAB4C0" />
              <Text style={styles.pillText}>
                {meetup.participant_count}/{meetup.max_players}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    minHeight: 190,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  backgroundPhoto: { opacity: 1 },
  backgroundFallback: { opacity: 0.72 },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  overlayPhoto: { backgroundColor: 'rgba(4,8,11,0.66)' },
  overlayFallback: { backgroundColor: 'rgba(4,8,11,0.76)' },
  content: {
    flex: 1,
    minHeight: 188,
    padding: AppSpacing.sm,
    gap: AppSpacing.xs,
    justifyContent: 'space-between',
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: AppSpacing.sm },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { fontSize: 14, fontWeight: '800', color: '#16C784' }, // 날짜는 작게(제목보다), 그린 라벨
  title: { ...Typography.cardTitle, color: '#F8FAFC' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meta: { ...Typography.caption, color: '#AAB4C0', flex: 1 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.xs,
  },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  host: { fontSize: 13, fontWeight: '600', color: '#AAB4C0', flex: 1 },
  tags: { flexDirection: 'row', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: Radius.chip,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  pillText: { fontSize: 13, fontWeight: '700', color: '#AAB4C0' },
  feePill: { backgroundColor: 'rgba(22,199,132,0.12)' },
  feePillText: { color: '#16C784', fontWeight: '700' },
});
