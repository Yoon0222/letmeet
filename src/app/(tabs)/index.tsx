import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { MeetupCard } from '@/components/meetup-card';
import { AppCard } from '@/components/ui/app-card';
import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { formatMeetupTime, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts, MeetupWithCounts } from '@/lib/types';

const pad = (n: number) => String(n).padStart(2, '0');

type UpcomingItem = { key: string; type: 'tournament' | 'meetup' | 'court'; title: string; subtitle: string; at: number; route: string };

export default function HomeScreen() {
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
    const items: UpcomingItem[] = [];

    if (uid) {
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

    items.sort((a, b) => a.at - b.at);
    setUpcoming(items.slice(0, 4));

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

    const { data: cs } = await supabase
      .from('clubs_with_counts')
      .select('*')
      .order('member_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3);
    // 회원 많은 순(동수면 최근순)으로 최대 3개 노출 — 이전엔 3개↑일 때 10명↑만 노출해 작은 클럽이 사라져 혼란 → 완화
    setClubs((cs ?? []).slice(0, 3));
    setRefreshing(false);
  }, [uid, myRegion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const hero = upcoming[0];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
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

        <AppCard disabled style={styles.hero}>
          <Text style={styles.heroEyebrow}>오늘 참가 가능한 경기</Text>
          <Text style={styles.heroTitle}>{hero?.title ?? '새로운 번개 모임을 찾아보세요'}</Text>
          <Text style={styles.heroSub}>{hero?.subtitle ?? '근처 코트에서 열리는 경기를 추천해드릴게요.'}</Text>
          <Pressable onPress={() => router.push(hero ? (hero.route as never) : '/(tabs)/matches')} style={styles.heroCta}>
            <Text style={styles.heroCtaText}>{hero ? '일정 보기' : '모임 찾기'}</Text>
            <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
          </Pressable>
        </AppCard>

        <View style={styles.quickRow}>
          <QuickAction icon="flash-outline" label="번개모임" onPress={() => router.push('/(tabs)/matches')} />
          <QuickAction icon="location-outline" label="코트예약" onPress={() => router.push('/court')} />
          <QuickAction icon="trophy-outline" label="대회" onPress={() => router.push('/(tabs)/tournaments')} />
        </View>

        <SectionHeader title="다가오는 내 일정" onMore={() => router.push('/court/reservations')} />
        {upcoming.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {upcoming.map((item) => (
              <AppCard key={item.key} onPress={() => router.push(item.route as never)} style={styles.scheduleCard}>
                <View style={styles.scheduleIcon}>
                  <Ionicons name={item.type === 'tournament' ? 'trophy-outline' : item.type === 'court' ? 'location-outline' : 'flash-outline'} size={18} color="#16C784" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduleTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.scheduleSub} numberOfLines={1}>{item.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
              </AppCard>
            ))}
          </View>
        ) : (
          <Text style={styles.placeholder}>예정된 일정이 없어요. 코트 예약, 번개 모임, 대회에 참여해보세요.</Text>
        )}

        <SectionHeader title="근처 추천 모임" onMore={() => router.push('/(tabs)/matches')} />
        {recommended.length > 0 ? (
          <View style={{ gap: Spacing.three }}>
            {recommended.map((m) => (
              <MeetupCard key={m.id} meetup={m} onPress={() => router.push(`/meetup/${m.id}`)} />
            ))}
          </View>
        ) : (
          <Text style={styles.placeholder}>아직 추천할 모임이 없어요. 첫 모임을 만들어보세요.</Text>
        )}

        <SectionHeader title="추천 클럽" onMore={() => router.push('/(tabs)/clubs')} />
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

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.quick}>
      <Ionicons name={icon} size={24} color="#16C784" />
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

function SectionHeader({ title, onMore }: { title: string; onMore: () => void }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={onMore} hitSlop={8}>
        <Text style={styles.more}>전체보기</Text>
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
  hero: { padding: 24, gap: 8, backgroundColor: '#111827', borderColor: '#111827' },
  heroEyebrow: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  heroSub: { fontSize: 16, lineHeight: 22, color: '#D1D5DB' },
  heroCta: { marginTop: 8, alignSelf: 'flex-start', height: 44, paddingHorizontal: 16, borderRadius: 16, backgroundColor: '#16C784', flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroCtaText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  quickRow: { flexDirection: 'row', gap: Spacing.three },
  quick: { flex: 1, minHeight: 88, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', gap: 8 },
  quickText: { fontSize: 13, fontWeight: '700', color: '#111827' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  sectionTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  more: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  scheduleCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scheduleIcon: { width: 40, height: 40, borderRadius: 16, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  scheduleTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scheduleSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  placeholder: { fontSize: 16, lineHeight: 22, color: '#6B7280' },
});
