import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { playStyleLabel, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts } from '@/lib/types';

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const [myMeetups, setMyMeetups] = useState<MeetupWithCounts[]>([]);

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) return;
    const { data: parts } = await supabase
      .from('meetup_participants')
      .select('meetup_id')
      .eq('user_id', uid);
    const ids = (parts ?? []).map((p) => p.meetup_id);
    if (ids.length === 0) {
      setMyMeetups([]);
      return;
    }
    const { data } = await supabase
      .from('meetups_with_counts')
      .select('*')
      .in('id', ids)
      .order('start_time', { ascending: true });
    setMyMeetups(data ?? []);
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmSignOut() {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠어요?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const needsSetup = profile && !profile.region;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>내 정보</Text>
          <Pressable onPress={() => router.push('/profile/edit')} hitSlop={10}>
            <Ionicons name="create-outline" size={24} color={theme.text} />
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Avatar nickname={profile?.nickname ?? '?'} uri={profile?.avatar_url} size={72} />
          <Text style={[styles.nick, { color: theme.text }]}>{profile?.nickname ?? '...'}</Text>
          <Text style={[styles.region, { color: theme.textSecondary }]}>
            {profile?.region || '지역 미설정'} · {playStyleLabel(profile?.play_style ?? 'all')}
          </Text>

          {profile?.dupr_id ? (
            <Badge
              label={
                profile.dupr_verified
                  ? `DUPR ${profile.dupr_rating?.toFixed(1) ?? ''} 인증`
                  : `DUPR ${profile.dupr_id} (미인증)`
              }
              color={profile.dupr_verified ? '#185FA5' : '#60646C'}
              bg={profile.dupr_verified ? 'rgba(45,127,249,0.14)' : 'rgba(136,135,128,0.14)'}
              style={{ marginTop: 6 }}
            />
          ) : null}

          <View style={styles.statsRow}>
            <Stat
              value={(profile?.skill_level ?? 0).toFixed(1)}
              label={skillLabel(profile?.skill_level ?? 3)}
              theme={theme}
            />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <Stat value={String(myMeetups.length)} label="참여 모임" theme={theme} />
          </View>

          {profile?.bio ? (
            <Text style={[styles.bio, { color: theme.textSecondary }]}>{profile.bio}</Text>
          ) : null}
        </View>

        {needsSetup && (
          <Pressable
            onPress={() => router.push('/profile/edit')}
            style={[styles.setupBanner, { backgroundColor: 'rgba(61,186,111,0.12)' }]}>
            <Ionicons name="information-circle" size={20} color={theme.primary} />
            <Text style={[styles.setupText, { color: theme.text }]}>
              프로필을 완성하면 더 잘 맞는 모임을 추천받아요
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        )}

        <Text style={[styles.sectionTitle, { color: theme.text }]}>내 모임</Text>
        {myMeetups.length === 0 ? (
          <Text style={[styles.emptyMeetup, { color: theme.textSecondary }]}>
            아직 참여한 모임이 없어요. 모임 탭에서 찾아보세요!
          </Text>
        ) : (
          <View style={{ gap: Spacing.three }}>
            {myMeetups.map((m) => (
              <MeetupCard key={m.id} meetup={m} onPress={() => router.push(`/meetup/${m.id}`)} />
            ))}
          </View>
        )}

        <Button title="로그아웃" variant="outline" onPress={confirmSignOut} style={{ marginTop: Spacing.four }} />
        <Text style={[styles.email, { color: theme.tabIconDefault }]}>{session?.user.email}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({
  value,
  label,
  theme,
}: {
  value: string;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  card: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    padding: Spacing.four,
    gap: 6,
  },
  nick: { fontSize: 22, fontWeight: '800', marginTop: 6 },
  region: { fontSize: 14 },
  statsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four, marginTop: Spacing.three },
  divider: { width: 1, height: 36 },
  stat: { alignItems: 'center', minWidth: 64 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  bio: { fontSize: 14, textAlign: 'center', marginTop: Spacing.three, lineHeight: 20 },
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.three,
    borderRadius: 14,
  },
  setupText: { flex: 1, fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: Spacing.three },
  emptyMeetup: { fontSize: 14, lineHeight: 20 },
  email: { fontSize: 12, textAlign: 'center', marginTop: Spacing.three },
});
