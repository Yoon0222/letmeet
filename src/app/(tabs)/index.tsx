import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { CourtCard } from '@/components/court-card';
import { EventPopup } from '@/components/event-popup';
import { MeetupCard } from '@/components/meetup-card';
import { TournamentCard } from '@/components/tournament-card';
import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { formatMeetupTime, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts, Court, MeetupWithCounts, TournamentWithCounts } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

type UpcomingItem = { key: string; type: 'tournament' | 'meetup' | 'court'; title: string; subtitle: string; at: number; route: string; dday: number };

// 일정 종류별 아이콘·색(연한 배경 + 진한 아이콘)
const TYPE_META: Record<UpcomingItem['type'], { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  tournament: { icon: 'trophy-outline', color: '#D97706', bg: '#FEF3C7' },
  meetup: { icon: 'flash-outline', color: '#16C784', bg: '#DCFCE7' },
  court: { icon: 'location-outline', color: '#0284C7', bg: '#E0F2FE' },
};
const ddayLabel = (d: number) => (d <= 0 ? '오늘' : d === 1 ? '내일' : `D-${d}`);

export default function HomeScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const uid = session?.user.id;

  const [upcoming, setUpcoming] = useState<UpcomingItem[]>([]);
  const [recommended, setRecommended] = useState<MeetupWithCounts[]>([]);
  const [openTournaments, setOpenTournaments] = useState<TournamentWithCounts[]>([]);
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const mySkill = profile?.skill_level ?? 3.5;
  const myRegion = profile?.region ?? '';

  const load = useCallback(async () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const items: Omit<UpcomingItem, 'dday'>[] = [];

    if (uid) {
      const { data: parts } = await supabase
        .from('meetup_participants')
        .select('meetup_id')
        .eq('user_id', uid)
        .eq('status', 'approved'); // 승인된(확정) 참가만 일정에 표시
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
        if (g.date === todayStr && maxH < curH) return;
        const [y, mo, d] = g.date.split('-').map(Number);
        const hourText = g.hours.length > 1 ? `${g.hours[0]}~${maxH + 1}시` : `${g.hours[0]}시`;
        items.push({ key: `c${g.courtId}${g.date}`, type: 'court', title: g.name, subtitle: `${mo}월 ${d}일 · ${hourText}`, at: new Date(y, mo - 1, d, g.hours[0]).getTime(), route: `/court/${g.courtId}` });
      });
    }

    // D-day 계산 (오늘 자정 기준 남은 일수)
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const withDday: UpcomingItem[] = items.map((it) => {
      const d = new Date(it.at);
      const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return { ...it, dday: Math.max(0, Math.round((mid - startOfToday) / 86400000)) };
    });
    withDday.sort((a, b) => a.at - b.at);
    setUpcoming(withDday.slice(0, 4));

    const regionPrefix = myRegion.trim().split(/\s+/)[0];
    let recQuery = supabase
      .from('meetups_with_counts')
      .select('*')
      .eq('status', 'open')
      .gte('start_time', nowIso)
      .order('start_time', { ascending: true })
      .limit(10);
    if (regionPrefix) recQuery = recQuery.ilike('region', `${regionPrefix}%`);
    const { data: recs } = await recQuery;
    const upcomingMeetupIds = new Set(items.filter((i) => i.type === 'meetup').map((i) => i.key.slice(1)));
    setRecommended((recs ?? []).filter((m) => !upcomingMeetupIds.has(m.id)).slice(0, 3));

    // 모집 중(접수중) 대회 — 지역 필터 없이 전국에서 가까운 날짜순.
    // (대회는 빈도가 낮고 원정도 가는 이벤트라 지역 제한을 두면 늘 비어버림)
    const { data: tours } = await supabase
      .from('tournaments_with_counts')
      .select('*')
      .eq('status', 'registration')
      .gte('start_at', nowIso)
      .order('start_at', { ascending: true })
      .limit(6);
    // 이미 "다가오는 내 일정"에 뜨는 내가 신청한 대회는 제외
    const upcomingTournamentIds = new Set(items.filter((i) => i.type === 'tournament').map((i) => i.key.slice(1)));
    setOpenTournaments((tours ?? []).filter((t) => !upcomingTournamentIds.has(t.id)).slice(0, 3));

    const { data: cs } = await supabase
      .from('clubs_with_counts')
      .select('*')
      .order('member_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3);
    // 회원 많은 순(동수면 최근순)으로 최대 3개 노출 — 이전엔 3개↑일 때 10명↑만 노출해 작은 클럽이 사라져 혼란 → 완화
    setClubs((cs ?? []).slice(0, 3));

    // 코트 예약 — 지역 있으면 우선, 없으면 전체에서 몇 개
    let courtQuery = supabase.from('courts').select('*').order('region', { ascending: true }).limit(6);
    if (regionPrefix) courtQuery = courtQuery.ilike('region', `${regionPrefix}%`);
    const { data: courtRows } = await courtQuery;
    // 지역 필터로 비면 전체에서 채운다
    let courtList = courtRows ?? [];
    if (courtList.length === 0) {
      const { data: anyCourts } = await supabase.from('courts').select('*').order('region', { ascending: true }).limit(3);
      courtList = anyCourts ?? [];
    }
    setCourts(courtList.slice(0, 3));
    setRefreshing(false);
  }, [uid, myRegion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <EventPopup />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor="#16C784"
          />
        }>
        <View style={styles.header}>
          <Pressable onPress={() => router.push('/(tabs)/profile')}>
            <Avatar nickname={profile?.nickname ?? '피넛'} uri={profile?.avatar_url} size={48} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello} numberOfLines={1}>안녕하세요, {profile?.nickname ?? '피넛'}님</Text>
            <Text style={styles.sub} numberOfLines={1}>{myRegion || '지역 미설정'} · 실력 {mySkill.toFixed(1)} {skillLabel(mySkill)}</Text>
          </View>
          <Pressable hitSlop={10} onPress={() => router.push('/(tabs)/profile')} style={styles.iconBtn}>
            <Ionicons name="notifications-outline" size={22} color="#111827" />
          </Pressable>
        </View>

        <SectionHeader title="다가오는 내 일정" onMore={() => router.push('/court/reservations')} icon="calendar-outline" color="#3E63DD" bg="#E6ECFF" />
        {upcoming.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {upcoming.map((item) => {
              const meta = TYPE_META[item.type];
              const today = item.dday <= 0;
              return (
                <AppCard key={item.key} onPress={() => router.push(item.route as never)} style={styles.scheduleCard}>
                  <View style={[styles.scheduleIcon, { backgroundColor: meta.bg }]}>
                    <Ionicons name={meta.icon} size={18} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.scheduleSub} numberOfLines={1}>{item.subtitle}</Text>
                  </View>
                  <View style={[styles.ddayBadge, today && styles.ddayToday]}>
                    <Text style={[styles.ddayText, today && styles.ddayTodayText]}>{ddayLabel(item.dday)}</Text>
                  </View>
                </AppCard>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={28} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>예정된 일정이 없어요</Text>
            <Text style={styles.emptyBody}>코트 예약·번개 모임·대회에 참여하면 여기에 표시돼요.</Text>
          </View>
        )}

        {/* 코트 예약 — 둘러보고 예약하는 진입점 */}
        <SectionHeader title="코트 예약" onMore={() => router.push('/court' as never)} icon="location-outline" color="#0284C7" bg="#E0F2FE" />
        {courts.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {courts.map((c) => (
              <CourtCard key={c.id} court={c} onPress={() => router.push(`/court/${c.id}` as never)} />
            ))}
          </View>
        ) : (
          <Text style={styles.placeholder}>예약 가능한 코트를 준비 중이에요.</Text>
        )}

        {/* 모집 중인 대회 — 있을 때만 노출(비면 섹션 자체 숨김) */}
        {openTournaments.length > 0 && (
          <>
            <SectionHeader title="대회" onMore={() => router.push('/(tabs)/tournaments')} icon="trophy-outline" color="#D97706" bg="#FEF3C7" />
            <View style={{ gap: Spacing.three }}>
              {openTournaments.map((t) => (
                <TournamentCard key={t.id} tournament={t} onPress={() => router.push(`/tournament/${t.id}`)} />
              ))}
            </View>
          </>
        )}

        <SectionHeader title="근처 추천 모임" onMore={() => router.push('/(tabs)/matches')} icon="flash-outline" color="#16C784" bg="#DCFCE7" />
        {recommended.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {recommended.map((m) => (
              <MeetupCard key={m.id} meetup={m} onPress={() => router.push(`/meetup/${m.id}`)} />
            ))}
          </View>
        ) : (
          <Text style={styles.placeholder}>아직 추천할 모임이 없어요. 첫 모임을 만들어보세요.</Text>
        )}

        <SectionHeader title="추천 클럽" onMore={() => router.push('/(tabs)/clubs')} icon="people-outline" color="#6366F1" bg="#EAEBFF" />
        {clubs.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {clubs.map((c) => (
              <ClubCard key={c.id} club={c} onPress={() => router.push(`/club/${c.id}`)} />
            ))}
          </View>
        ) : (
          <Text style={styles.placeholder}>아직 클럽이 없어요. 새 클럽을 만들고 멤버를 모아보세요.</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({
  title,
  onMore,
  icon,
  color,
  bg,
}: {
  title: string;
  onMore: () => void;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={styles.sectionTitleRow}>
        <View style={[styles.sectionIcon, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Pressable onPress={onMore} hitSlop={8} style={styles.moreBtn}>
        <Text style={styles.more}>더 보기</Text>
        <Ionicons name="arrow-forward" size={14} color="#6B7280" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 80 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  hello: { fontSize: 20, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  iconBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  sectionIcon: { width: 30, height: 30, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#111827', flexShrink: 1 },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  more: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scheduleIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  scheduleTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scheduleSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  ddayBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F1F5F9', minWidth: 46, alignItems: 'center' },
  ddayText: { fontSize: 13, fontWeight: '800', color: '#64748B' },
  ddayToday: { backgroundColor: '#16C784' },
  ddayTodayText: { color: '#FFFFFF' },
  emptyCard: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: Spacing.three, borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', backgroundColor: '#FFFFFF' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptyBody: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  placeholder: { fontSize: 16, lineHeight: 22, color: '#6B7280' },
});
