import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { MeetupCard } from '@/components/meetup-card';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatMeetupTime, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts, MeetupWithCounts, TournamentWithCounts } from '@/lib/types';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const uid = session?.user.id;

  const [nextMeetup, setNextMeetup] = useState<MeetupWithCounts | null>(null);
  const [nextTournament, setNextTournament] = useState<TournamentWithCounts | null>(null);
  const [recommended, setRecommended] = useState<MeetupWithCounts[]>([]);
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const mySkill = profile?.skill_level ?? 3.5;
  const myRegion = profile?.region ?? '';

  const load = useCallback(async () => {
    const nowIso = new Date().toISOString();

    // 내가 참여 중인 다음 모임
    let next: MeetupWithCounts | null = null;
    let nextT: TournamentWithCounts | null = null;
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

      // 내가 신청한 다음 대회
      const { data: ents } = await supabase
        .from('tournament_entries')
        .select('tournament_id')
        .eq('user_id', uid)
        .neq('status', 'rejected');
      const tids = (ents ?? []).map((e) => e.tournament_id);
      if (tids.length > 0) {
        const { data } = await supabase
          .from('tournaments_with_counts')
          .select('*')
          .in('id', tids)
          .gte('start_at', nowIso)
          .neq('status', 'cancelled')
          .order('start_at', { ascending: true })
          .limit(1);
        nextT = data?.[0] ?? null;
      }
    }
    setNextMeetup(next);
    setNextTournament(nextT);

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

  const hasSchedule = !!nextMeetup || !!nextTournament;

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
          <Pressable onPress={() => router.push('/(tabs)/profile')}>
            <Avatar nickname={profile?.nickname ?? '피넛'} uri={profile?.avatar_url} size={44} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: theme.text }]} numberOfLines={1}>
              안녕하세요, {profile?.nickname ?? '피넛'}님
            </Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]} numberOfLines={1}>
              {myRegion || '지역 미설정'} · 실력 {mySkill.toFixed(1)} {skillLabel(mySkill)}
            </Text>
          </View>
          <Pressable hitSlop={10} onPress={() => router.push('/(tabs)/profile')}>
            <Ionicons name="notifications-outline" size={24} color={theme.text} />
          </Pressable>
        </View>

        {/* 2. 3대 진입 */}
        <View style={styles.pillarRow}>
          <Pillar
            icon="trophy"
            label="대회"
            desc="신청 · 대진표"
            tint="rgba(18,185,129,0.12)"
            color={theme.primary}
            onPress={() => router.push('/(tabs)/tournaments')}
            theme={theme}
          />
          <Pillar
            icon="flash"
            label="번개모임"
            desc="지금 칠 사람"
            tint="rgba(245,166,35,0.15)"
            color={theme.accent}
            onPress={() => router.push('/(tabs)/matches')}
            theme={theme}
          />
        </View>
        <Pressable
          onPress={() => Alert.alert('코트 예약', '곧 오픈될 기능이에요. 조금만 기다려 주세요!')}
          style={[styles.courtTile, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="location-outline" size={26} color={theme.tabIconDefault} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.courtTitle, { color: theme.text }]}>코트 예약</Text>
            <Text style={[styles.courtDesc, { color: theme.textSecondary }]}>가까운 코트 찾고 예약</Text>
          </View>
          <View style={[styles.soon, { backgroundColor: 'rgba(245,166,35,0.2)' }]}>
            <Text style={[styles.soonText, { color: theme.accent }]}>곧 오픈</Text>
          </View>
        </Pressable>

        {/* 3. 다가오는 내 일정 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>다가오는 내 일정</Text>
        {hasSchedule ? (
          <View style={[styles.listCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {nextTournament && (
              <ScheduleRow
                icon="trophy"
                tint="rgba(18,185,129,0.12)"
                color={theme.primary}
                title={nextTournament.title}
                subtitle={`${formatMeetupTime(nextTournament.start_at)} · ${nextTournament.venue || '장소 미정'}`}
                onPress={() => router.push(`/tournament/${nextTournament.id}`)}
                theme={theme}
                border={!!nextMeetup}
              />
            )}
            {nextMeetup && (
              <ScheduleRow
                icon="flash"
                tint="rgba(245,166,35,0.15)"
                color={theme.accent}
                title={nextMeetup.title}
                subtitle={`${formatMeetupTime(nextMeetup.start_time)} · ${nextMeetup.location_name}`}
                onPress={() => router.push(`/meetup/${nextMeetup.id}`)}
                theme={theme}
              />
            )}
          </View>
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/matches')}
            style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="calendar-outline" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>예정된 일정이 없어요</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                번개 모임이나 대회에 참가해보세요
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Pressable>
        )}

        {/* 4. 근처 추천 모임 */}
        <SectionHeader title="근처 추천 모임" onMore={() => router.push('/(tabs)/matches')} theme={theme} />
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

function Pillar({
  icon,
  label,
  desc,
  tint,
  color,
  onPress,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  desc: string;
  tint: string;
  color: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.pillar, { backgroundColor: tint, opacity: pressed ? 0.85 : 1 }]}>
      <Ionicons name={icon} size={26} color={color} />
      <Text style={[styles.pillarLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.pillarDesc, { color: theme.textSecondary }]}>{desc}</Text>
    </Pressable>
  );
}

function ScheduleRow({
  icon,
  tint,
  color,
  title,
  subtitle,
  onPress,
  theme,
  border = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  border?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.schedRow, border && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
      <View style={[styles.schedIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.schedTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.schedSub, { color: theme.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.tabIconDefault} />
    </Pressable>
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
  hello: { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 13, marginTop: 2 },
  pillarRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  pillar: { flex: 1, borderRadius: 16, padding: Spacing.three, gap: 6, minHeight: 96, justifyContent: 'center' },
  pillarLabel: { fontSize: 16, fontWeight: '800' },
  pillarDesc: { fontSize: 12, fontWeight: '500' },
  courtTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: Spacing.three,
  },
  courtTitle: { fontSize: 16, fontWeight: '700' },
  courtDesc: { fontSize: 12, marginTop: 2 },
  soon: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  soonText: { fontSize: 11, fontWeight: '800' },
  listCard: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  schedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.three },
  schedIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  schedTitle: { fontSize: 15, fontWeight: '700' },
  schedSub: { fontSize: 12, marginTop: 2 },
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
  placeholder: { fontSize: 14, lineHeight: 20 },
});
