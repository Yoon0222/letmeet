import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { MeetupCard } from '@/components/meetup-card';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { formatMeetupTime, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts, MeetupWithCounts } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');
const SCHED_CARD_W = 210;

type UpcomingItem = { key: string; type: 'tournament' | 'meetup' | 'court'; title: string; subtitle: string; at: number; route: string };

function schedVisual(type: UpcomingItem['type'], theme: ReturnType<typeof useTheme>) {
  if (type === 'tournament') return { icon: 'trophy' as const, label: '대회', tint: 'rgba(18,185,129,0.12)', color: theme.primary };
  if (type === 'meetup') return { icon: 'flash' as const, label: '번개모임', tint: 'rgba(245,166,35,0.15)', color: theme.accent };
  return { icon: 'location' as const, label: '코트 예약', tint: 'rgba(45,127,249,0.14)', color: '#2D7FF9' }; // court
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile } = useAuth();
  const uid = session?.user.id;

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [recommended, setRecommended] = useState<MeetupWithCounts[]>([]);
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const mySkill = profile?.skill_level ?? 3.5;
  const myRegion = profile?.region ?? '';

  const load = useCallback(async () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // 다가오는 내 일정 = 대회 + 번개모임 + 코트예약 통합(시간순)
    const items: UpcomingItem[] = [];
    if (uid) {
      // 참여 중인 다가오는 모임
      const { data: parts } = await supabase.from('meetup_participants').select('meetup_id').eq('user_id', uid);
      const ids = (parts ?? []).map((p) => p.meetup_id);
      if (ids.length > 0) {
        const { data } = await supabase
          .from('meetups_with_counts')
          .select('*')
          .in('id', ids)
          .eq('status', 'open')
          .gte('start_time', nowIso)
          .order('start_time', { ascending: true })
          .limit(5);
        (data ?? []).forEach((m) =>
          items.push({ key: `m${m.id}`, type: 'meetup', title: m.title, subtitle: `${formatMeetupTime(m.start_time)} · ${m.location_name}`, at: new Date(m.start_time).getTime(), route: `/meetup/${m.id}` }),
        );
      }

      // 신청/파트너 등록된 다가오는 대회
      const { data: ents } = await supabase
        .from('tournament_entries')
        .select('tournament_id')
        .or(`user_id.eq.${uid},partner_id.eq.${uid}`)
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
          .limit(5);
        (data ?? []).forEach((t) =>
          items.push({ key: `t${t.id}`, type: 'tournament', title: t.title, subtitle: `${formatMeetupTime(t.start_at)} · ${t.venue || '장소 미정'}`, at: new Date(t.start_at).getTime(), route: `/tournament/${t.id}` }),
        );
      }

      // 다가오는 코트 예약 (코트+날짜 그룹)
      const { data: resvData } = await supabase
        .from('court_reservations')
        .select('court_id, slot_date, hour, courts(name)')
        .eq('user_id', uid)
        .eq('status', 'reserved')
        .gte('slot_date', todayStr);
      const resv = (resvData ?? []) as unknown as { court_id: string; slot_date: string; hour: number; courts: { name: string } | null }[];
      const groups = new Map<string, { courtId: string; name: string; date: string; hours: number[] }>();
      resv.forEach((r) => {
        const k = `${r.court_id}|${r.slot_date}`;
        const g = groups.get(k) ?? { courtId: r.court_id, name: r.courts?.name ?? '코트', date: r.slot_date, hours: [] };
        g.hours.push(r.hour);
        groups.set(k, g);
      });
      const curH = now.getHours();
      groups.forEach((g) => {
        g.hours.sort((a, b) => a - b);
        const maxH = g.hours[g.hours.length - 1];
        if (g.date === todayStr && maxH < curH) return; // 오늘 이미 지난 예약 제외
        const [y, mo, d] = g.date.split('-').map(Number);
        const hourText = g.hours.length > 1 ? `${g.hours[0]}~${maxH + 1}시` : `${g.hours[0]}시`;
        items.push({ key: `c${g.courtId}${g.date}`, type: 'court', title: g.name, subtitle: `${mo}월 ${d}일 · ${hourText}`, at: new Date(y, mo - 1, d, g.hours[0]).getTime(), route: `/court/${g.courtId}` });
      });
    }
    items.sort((a, b) => a.at - b.at);
    setUpcoming(items.slice(0, 4));

    // 근처 추천 모임 = 내 지역(시/도) 기준 다가오는 오픈 모임
    const regionPrefix = myRegion.trim().split(/\s+/)[0]; // 예: '서울 강남구' → '서울'
    let recQuery = supabase
      .from('meetups_with_counts')
      .select('*')
      .eq('status', 'open')
      .gte('start_time', nowIso)
      .order('start_time', { ascending: true })
      .limit(10);
    if (regionPrefix) recQuery = recQuery.ilike('region', `${regionPrefix}%`); // 지역 미설정이면 전체
    const { data: recs } = await recQuery;
    // 이미 '내 일정'에 뜨는 모임은 추천에서 제외
    const upcomingMeetupIds = new Set(items.filter((i) => i.type === 'meetup').map((i) => i.key.slice(1)));
    setRecommended((recs ?? []).filter((m) => !upcomingMeetupIds.has(m.id)).slice(0, 3));

    // 추천 클럽: 회원 많은순 → 동일 시 최근순. 클럽 3개 이상이면 회원 10명↑만 노출. 최대 3개
    const { data: cs, count: clubCount } = await supabase
      .from('clubs_with_counts')
      .select('*', { count: 'exact' })
      .order('member_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);
    let clubList = cs ?? [];
    if ((clubCount ?? clubList.length) >= 3) clubList = clubList.filter((c) => c.member_count >= 10);
    setClubs(clubList.slice(0, 3));

    setRefreshing(false);
  }, [uid, myRegion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hasSchedule = upcoming.length > 0;

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
          onPress={() => router.push('/court')}
          style={[styles.courtTile, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name="location-outline" size={26} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.courtTitle, { color: theme.text }]}>코트 예약</Text>
            <Text style={[styles.courtDesc, { color: theme.textSecondary }]}>가까운 코트 찾고 예약</Text>
          </View>
          <Pressable
            onPress={() => router.push('/court/reservations')}
            hitSlop={6}
            style={[styles.myResvBtn, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="calendar-outline" size={14} color={theme.primary} />
            <Text style={[styles.myResvText, { color: theme.text }]}>내 예약</Text>
          </Pressable>
        </Pressable>

        {/* 3. 다가오는 내 일정 */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>다가오는 내 일정</Text>
        {hasSchedule ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.carouselWrap}
            contentContainerStyle={styles.carousel}
            snapToInterval={SCHED_CARD_W + Spacing.three}
            decelerationRate="fast">
            {upcoming.map((item) => {
              const v = schedVisual(item.type, theme);
              return (
                <Pressable
                  key={item.key}
                  onPress={() => router.push(item.route as never)}
                  style={({ pressed }) => [styles.schedCard, { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 }]}>
                  <View style={styles.schedCardTop}>
                    <View style={[styles.schedCardIcon, { backgroundColor: v.tint }]}>
                      <Ionicons name={v.icon} size={16} color={v.color} />
                    </View>
                    <Text style={[styles.schedCardType, { color: v.color }]}>{v.label}</Text>
                  </View>
                  <Text style={[styles.schedCardTitle, { color: theme.text }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={[styles.schedCardSub, { color: theme.textSecondary }]} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Pressable
            onPress={() => router.push('/(tabs)/matches')}
            style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name="calendar-outline" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>예정된 일정이 없어요</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                코트 예약, 번개 모임, 대회에 참여해보세요
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
  myResvBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  myResvText: { fontSize: 13, fontWeight: '700' },
  soon: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  soonText: { fontSize: 11, fontWeight: '800' },
  carouselWrap: { marginHorizontal: -Spacing.four },
  carousel: { gap: Spacing.three, paddingHorizontal: Spacing.four },
  schedCard: { width: SCHED_CARD_W, borderWidth: 1, borderRadius: 16, padding: Spacing.three, gap: 6 },
  schedCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  schedCardIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  schedCardType: { fontSize: 12, fontWeight: '700' },
  schedCardTitle: { fontSize: 15, fontWeight: '700' },
  schedCardSub: { fontSize: 12, lineHeight: 17 },
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
