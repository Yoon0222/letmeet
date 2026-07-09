import { StyleSheet, Text, View } from 'react-native';

import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { AppSpacing } from '@/theme';
import { playStyleLabel, skillLabel } from '@/lib/format';
import type { Profile } from '@/lib/types';

type ProfileSummaryCardProps = {
  profile: Profile | null;
  meetupCount: number;
};

export function ProfileSummaryCard({ profile, meetupCount }: ProfileSummaryCardProps) {
  const skill = profile?.skill_level ?? 3;

  return (
    <AppCard disabled style={styles.card}>
      <Avatar nickname={profile?.nickname ?? '?'} uri={profile?.avatar_url} size={82} />
      <Text style={styles.nick}>{profile?.nickname ?? '...'}</Text>
      <Text style={styles.region}>
        {profile?.region || '지역 미설정'} · {playStyleLabel(profile?.play_style ?? 'all')}
      </Text>
      {profile?.dupr_id ? (
        <Badge
          label={profile.dupr_verified ? `DUPR ${profile.dupr_rating?.toFixed(1) ?? ''} 인증` : `DUPR ${profile.dupr_id}`}
          color={profile.dupr_verified ? '#16A34A' : '#6B7280'}
          bg={profile.dupr_verified ? '#DCFCE7' : '#F6F7F9'}
          style={{ marginTop: 8 }}
        />
      ) : null}
      <View style={styles.statsRow}>
        <Stat value={skill.toFixed(1)} label={skillLabel(skill)} />
        <Stat value={String(meetupCount)} label="참여모임" />
        <Stat value={profile?.dupr_verified ? '인증' : '미인증'} label="DUPR" />
      </View>
      {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
    </AppCard>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: 6, padding: AppSpacing.md },
  nick: { fontSize: 26, fontWeight: '800', color: '#111827', marginTop: 8 },
  region: { fontSize: 13, color: '#6B7280' },
  statsRow: { flexDirection: 'row', gap: AppSpacing.sm, marginTop: AppSpacing.sm, alignSelf: 'stretch' },
  stat: { flex: 1, backgroundColor: '#F6F7F9', borderRadius: 18, padding: 16, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 13, color: '#6B7280' },
  bio: { fontSize: 16, lineHeight: 22, color: '#6B7280', textAlign: 'center', marginTop: AppSpacing.sm },
});
