import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { MeetupCard } from '@/components/meetup-card';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts, MeetupWithCounts } from '@/lib/types';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const uid = session?.user.id;

  const [nextMeetup, setNextMeetup] = useState<MeetupWithCounts | null>(null);
  const [recommended, setRecommended] = useState<MeetupWithCounts[]>([]);
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const mySkill = profile?.skill_level ?? 3.5;
  const myRegion = profile?.region ?? '';

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();

    // 내가 참여 중인 다음 모임
    let next: MeetupWithCounts | null = null;
    if (uid) {
      const { data: parts } = await supabase
        .from('meetup_participants')
        .select('meetup_id')
        .eq('user_id', uid);
      const ids = (parts ?? []).map((p) => p.meetup_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('meetups_with_counts')
          .select('*')
          .in('id', ids)
          .eq('status', 'open')
          .gte('start_time', nowIso)
          .order('start_time', { ascending: true })
          .limit(1);
        next = data?.[0] ?? null;
      }
    }
    setNextMeetup(next);

    // 근처 추천 모임 (다가오는 오픈 모임)
    const { data: recs } = await supabase
      .from('meetups_with_counts')
      .select('*')
      .eq('status', 'open')
      .gte('start_time', nowIso)
      .order('start_time', { ascending: true })
      .limit(5);
    setRecommended((recs ?? []).filter((m) => m.id !== next?.id).slice(0, 3));

    // 추천 클럽 (멤버 많은 순)
    const { data: cs } = await supabase
      .from('clubs_with_counts')
      .select('*')
      .order('member_count', { ascending: false })
      .limit(3);
    setClubs(cs ?? []);

    setRefreshing(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={theme.primary}
          />
        }>
        {/* 1. 헤더 */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: theme.text }]}>
              안녕하세요, {profile?.nickname ?? '피클러'}님
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              {myRegion || '지역 미설정'} · 실력 {mySkill.toFixed(1)} {skillLabel(mySkill)}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="notifications-outline" size={24} color={theme.text} />
          </Pressable>
        </View>

        {/* 2. 다가오는 내 모임 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>다가오는 내 모임</Text>
        {nextMeetup ? (
          <MeetupCard meetup={nextMeetup} onPress={() => router.push(`/meetup/${nextMeetup.id}`)} />
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/matches')}
            style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="flash-outline" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>참여 중인 모임이 없어요</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                번개 모임을 찾아 참가해보세요
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        )}

        {/* 3. 빠른 실행 */}
        <View style={styles.quickRow}>
          <Pressable
            onPress={() => router.push('/meetup/create')}
            style={({ pressed }) => [
              styles.quickBtn,
              { backgroundColor: theme.primary, opacity: pressed ? 0.9 : 1 },
            ]}>
            <Ionicons name="add-circle-outline" size={22} color="#fff" />
            <Text style={styles.quickTextPrimary}>모임 만들기</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/clubs')}
            style={({ pressed }) => [
              styles.quickBtn,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.9 : 1 },
            ]}>
            <Ionicons name="people-outline" size={22} color={theme.primary} />
            <Text style={[styles.quickText, { color: theme.text }]}>클럽 찾기</Text>
          </Pressable>
        </View>

        {/* 4. 근처 추천 모임 */}
        <SectionHeader
          title="근처 추천 모임"
          onMore={() => router.push('/(tabs)/matches')}
          theme={theme}
        />
        {recommended.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {recommended.map((m) => (
              <MeetupCard key={m.id} meetup={m} onPress={() => router.push(`/meetup/${m.id}`)} />
            ))}
          </View>
        ) : (
          <Text style={[styles.placeholder, { color: theme.textSecondary }]}>
            아직 예정된 모임이 없어요. 첫 모임을 만들어보세요!
          </Text>
        )}

        {/* 5. 추천 클럽 */}
        <SectionHeader title="추천 클럽" onMore={() => router.push('/(tabs)/clubs')} theme={theme} />
        {clubs.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {clubs.map((c) => (
              <ClubCard key={c.id} club={c} onPress={() => router.push(`/club/${c.id}`)} />
            ))}
          </View>
        ) : (
          <Text style={[styles.placeholder, { color: theme.textSecondary }]}>
            아직 클럽이 없어요. 첫 클럽을 만들어보세요!
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  onMore,
  theme,
}: {
  title: string;
  onMore: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <Pressable onPress={onMore} hitSlop={8}>
        <Text style={[styles.more, { color: theme.textSecondary }]}>전체보기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  hello: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 2 },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginTop: Spacing.two },
  more: { fontSize: 13, fontWeight: '600', marginTop: Spacing.two },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody: { fontSize: 13, marginTop: 2 },
  quickRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  quickBtn: {
    flex: 1,
    height: 56,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickTextPrimary: { fontSize: 15, fontWeight: '700', color: '#fff' },
  quickText: { fontSize: 15, fontWeight: '700' },
  placeholder: { fontSize: 14, lineHeight: 20 },
});
