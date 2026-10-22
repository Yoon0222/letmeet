import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BracketTree } from '@/components/bracket-tree';
import { TeamBracketView } from '@/components/team-bracket-view';
import { TeamRegister } from '@/components/team-register';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { groupMembers, standings } from '@/lib/bracket';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { cancelTournamentEntry, createTournamentEntryPayment } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { TOURNAMENT_FORMAT_LABELS } from '@/lib/types';
import type {
  EntryStatus,
  MatchPhase,
  PartnerProfile,
  TournamentCourt,
  TournamentEntryWithProfile,
  TournamentMatch,
  TournamentStatus,
  TournamentWithCounts,
} from '@/lib/types';

const ENTRY_LABEL: Record<EntryStatus, string> = {
  pending: '승인 대기중',
  approved: '참가 확정',
  rejected: '거절됨',
  withdrawn: '철회됨',
  waitlist: '대기열',
};

// 대회 상세 탭: 대회정보 · 참가자 · 조편성 · 경기진행 (단체전은 조편성 없이 3개)
type DetailTab = 'info' | 'players' | 'groups' | 'progress';
// 경기진행 탭에서 '다음 경기'·'끝난 경기'를 처음에 몇 개까지 보여 줄지
const PROGRESS_PREVIEW = 8;

export default function TournamentDetail() {
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const uid = session?.user.id;

  const [t, setT] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<TournamentEntryWithProfile[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [courts, setCourts] = useState<TournamentCourt[]>([]);
  const [clubNamesByUser, setClubNamesByUser] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<DetailTab>('info');
  const [progressPhase, setProgressPhase] = useState<MatchPhase | null>(null); // 경기진행 탭의 예선·본선 (null = 자동)
  const scrollRef = useRef<ScrollView>(null);
  const [groupTab, setGroupTab] = useState<number | null>(null);
  const [groupScrollHasMore, setGroupScrollHasMore] = useState(true);
  const initializedGroupTournamentRef = useRef<string | null>(null);
  const initializedDetailTabRef = useRef<string | null>(null);
  const [search, setSearch] = useState('');
  const [coverIdx, setCoverIdx] = useState(0); // 대회 사진 갤러리: 크게 볼 사진 인덱스
  const [nowMs, setNowMs] = useState(0); // 로드 시점 현재시각 (조추첨 공개/당일 판단용)
  const [teamRev, setTeamRev] = useState(0); // 단체전 오더 저장 시 대진뷰 새로고침 트리거

  // 복식 파트너 검색/선택
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<PartnerProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [editingPartner, setEditingPartner] = useState(false); // 신청 후 파트너 변경 모드 (0090)

  const load = useCallback(async () => {
    if (!id) return;
    // 결제 기한(24h)이 지난 미결제 신청 정리 → 대기열 자동 승격 (0089, 실패해도 무시)
    await supabase.rpc('expire_unpaid_tournament_entries', { p_tournament_id: id });
    const [{ data: tour }, { data: ents }, { data: ms }, { data: cs }] = await Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tournament_entries')
        .select(
          '*, profiles:profiles!tournament_entries_user_id_fkey(id, nickname, skill_level, avatar_url, region), partner:profiles!tournament_entries_partner_id_fkey(id, nickname, skill_level, avatar_url, region)',
        )
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('tournament_matches')
        .select('*')
        .eq('tournament_id', id)
        .order('slot', { ascending: true }),
      supabase.from('tournament_courts').select('*').eq('tournament_id', id).order('sort', { ascending: true }),
    ]);
    const entryRows = (ents as unknown as TournamentEntryWithProfile[]) ?? [];
    setT(tour ?? null);
    if (tour && initializedDetailTabRef.current !== id) {
      initializedDetailTabRef.current = id;
      // 대회 날(진행 중)에는 경기진행부터 보여 준다
      setTab(tour.status === 'ongoing' ? 'progress' : 'info');
    }
    setEntries(entryRows);
    setMatches((ms as TournamentMatch[]) ?? []);
    setCourts((cs as TournamentCourt[]) ?? []);

    const participantIds = [...new Set(entryRows.flatMap((entry) => [entry.user_id, entry.partner_id]).filter((value): value is string => !!value))];
    if (participantIds.length > 0) {
      const { data: memberships } = await supabase
        .from('club_members')
        .select('user_id, club_id')
        .eq('status', 'approved')
        .in('user_id', participantIds);
      const membershipRows = memberships ?? [];
      const clubIds = [...new Set(membershipRows.map((membership) => membership.club_id))];
      const { data: clubRows } = clubIds.length > 0
        ? await supabase.from('clubs').select('id, name').in('id', clubIds)
        : { data: [] };
      const clubNameById = new Map((clubRows ?? []).map((club) => [club.id, club.name]));
      const nextClubNames: Record<string, string[]> = {};
      membershipRows.forEach((membership) => {
        const clubName = clubNameById.get(membership.club_id);
        if (!clubName) return;
        nextClubNames[membership.user_id] = [...(nextClubNames[membership.user_id] ?? []), clubName];
      });
      setClubNamesByUser(nextClubNames);
    } else {
      setClubNamesByUser({});
    }
    setNowMs(Date.now());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: '', headerTitle: '' });
  }, [navigation]);

  const myEntry = entries.find((e) => e.user_id === uid);
  // 내가 다른 사람의 파트너로 이미 등록돼 있는지 (중복 신청 방지)
  const iAmPartner = entries.find((e) => e.partner_id === uid);
  const approved = entries.filter((e) => e.status === 'approved');
  // 조추첨(대진 생성) 후에는 신규 신청도 막는다 (0091)
  const canRegister = t?.status === 'registration' && matches.length === 0;
  const isDoubles = t?.discipline === 'doubles';
  const isTeam = t?.format === 'team'; // 단체전: 개인 신청 대신 팀 신청 UI
  const isOrganizer = !!t && t.organizer_id === uid;

  // 조추첨 공개: 시합 전날 오후 7시부터 선수에게 공개 (운영자는 항상)
  const drawRevealAt = t
    ? (() => {
        const d = new Date(t.start_at);
        d.setDate(d.getDate() - 1);
        d.setHours(19, 0, 0, 0);
        return d;
      })()
    : null;
  // 대회가 이미 진행·종료됐으면 시각과 무관하게 공개 (전날 19시 규칙은 접수 단계에만 의미)
  const drawRevealed =
    isOrganizer ||
    t?.status === 'ongoing' ||
    t?.status === 'finished' ||
    (!!drawRevealAt && nowMs >= drawRevealAt.getTime());

  // 출전 확인은 운영자가 처리하고 참가자는 결과만 확인한다.
  const checkedIn = !!myEntry?.checked_in_at;

  // 참가자 id → 표시 이름(복식은 파트너 포함)
  const nameOf = useCallback(
    (entryId: string | null): string => {
      if (!entryId) return '부전승';
      const e = entries.find((x) => x.user_id === entryId);
      if (!e) return '미정';
      const nick = e.profiles?.nickname ?? '?';
      const partner = e.partner?.nickname ?? e.partner_name;
      return isDoubles && partner ? `${nick} / ${partner}` : nick;
    },
    [entries, isDoubles],
  );

  // 대진 데이터 분해
  const groupMatchesAll = matches.filter((m) => m.phase === 'group');
  const koMatches = matches
    .filter((m) => m.phase === 'knockout')
    .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot);
  const groupNos = [...new Set(groupMatchesAll.map((m) => m.group_no ?? 1))].sort((a, b) => a - b);
  const myMatches = matches.filter((m) => m.entry1_id === uid || m.entry2_id === uid);

  // 내 현황 요약 — 조·전적·순위·다음 경기를 한눈에 (정보 탭 상단 카드)
  const myGroupNo = groupMatchesAll.find((m) => m.entry1_id === uid || m.entry2_id === uid)?.group_no ?? null;
  const orderedGroupTabs = myGroupNo
    ? [myGroupNo, ...groupNos.filter((g) => g !== myGroupNo)]
    : groupNos;

  useEffect(() => {
    const firstGroup = myGroupNo ?? groupNos[0] ?? null;
    if (!id || !firstGroup || initializedGroupTournamentRef.current === id) return;
    initializedGroupTournamentRef.current = id;
    setGroupTab(firstGroup);
  }, [groupNos, id, myGroupNo]);

  const myDoneMatches = myMatches.filter((m) => m.status === 'done' && m.entry1_id && m.entry2_id);
  const myWins = myDoneMatches.filter((m) => m.winner_id === uid).length;
  const myNextMatch =
    myMatches
      .filter((m) => m.status !== 'done' && m.entry1_id && m.entry2_id)
      .sort((a, b) => (a.phase === b.phase ? 0 : a.phase === 'group' ? -1 : 1))[0] ?? null;
  const myRank = (() => {
    if (!myGroupNo || !uid) return null;
    const gms = groupMatchesAll.filter((m) => (m.group_no ?? 1) === myGroupNo);
    const idx = standings(groupMembers(gms), gms).findIndex((s) => s.id === uid);
    return idx >= 0 ? idx + 1 : null;
  })();

  // 경기에 배정된 코트 라벨 (예: "3 · 실내")
  const courtLabelOf = useCallback(
    (cid: string | null): string | undefined => {
      if (!cid) return undefined;
      const c = courts.find((x) => x.id === cid);
      return c ? `${c.name} · ${c.indoor ? '실내' : '실외'}` : undefined;
    },
    [courts],
  );

  // 참가자 프로필 사진 (경기 이름 옆 표시용)
  const avatarOf = useCallback(
    (entryId: string | null): { uri: string | null; nickname: string } | null => {
      if (!entryId) return null;
      const e = entries.find((x) => x.user_id === entryId);
      if (!e?.profiles) return null;
      return { uri: e.profiles.avatar_url, nickname: e.profiles.nickname };
    },
    [entries],
  );

  // 이름 검색
  const q = search.trim().toLowerCase();
  const matchHit = (m: TournamentMatch) =>
    !q || nameOf(m.entry1_id).toLowerCase().includes(q) || nameOf(m.entry2_id).toLowerCase().includes(q);
  const approvedShown = approved.filter(
    (e) =>
      !q ||
      (e.profiles?.nickname ?? '').toLowerCase().includes(q) ||
      (e.partner?.nickname ?? e.partner_name ?? '').toLowerCase().includes(q),
  );
  const clubLabelOf = (userId: string | null | undefined) =>
    (userId ? clubNamesByUser[userId] : undefined)?.join(' · ') || '없음';
  // 대기열: 내 순번 / 정원이 찼는지
  const myWaitlistRank = entries.filter((e) => e.status === 'waitlist').findIndex((e) => e.user_id === uid) + 1;
  const slotsFull =
    !!t && entries.filter((e) => e.status === 'pending' || e.status === 'approved').length >= t.max_participants;

  const drawGenerated = matches.length > 0;
  const hasBracket = drawGenerated && drawRevealed;
  // 탭은 늘 같은 자리에 둔다. 대진 전에는 조편성·경기진행 탭에 안내만 보인다.
  const tabItems: { key: DetailTab; label: string }[] = isTeam
    ? [
        { key: 'info', label: '대회정보' },
        { key: 'players', label: `참가팀 ${t?.approved_count ?? 0}` },
        { key: 'progress', label: '경기진행' },
      ]
    : [
        { key: 'info', label: '대회정보' },
        { key: 'players', label: `${isDoubles ? '참가팀' : '참가자'} ${approved.length}` },
        // KDK 는 조별 풀리그 개인순위가 결과라 '순위' 로 표기 (본선 없음)
        { key: 'groups', label: t?.format === 'kdk' ? '순위' : '조편성' },
        { key: 'progress', label: '경기진행' },
      ];
  const changeTab = (next: DetailTab) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  // 경기진행 탭: 예선·본선을 나눠 지금 코트에서 · 다음 경기 · 끝난 경기(예선) / 본선 대진표(본선)
  //   예선·본선을 고르지 않았으면 본선에 양쪽 선수가 정해진 경기가 생긴 뒤부터 본선을 먼저 보여 준다
  const knockoutStarted = koMatches.some((m) => m.entry1_id && m.entry2_id);
  const showPhaseSwitch = groupMatchesAll.length > 0 && koMatches.length > 0;
  const phaseShown: MatchPhase = showPhaseSwitch
    ? progressPhase ?? (knockoutStarted ? 'knockout' : 'group')
    : koMatches.length > 0 ? 'knockout' : 'group';
  const groupDoneCount = groupMatchesAll.filter((m) => m.status === 'done').length;
  const koDoneCount = koMatches.filter((m) => m.status === 'done').length;
  const playOrder = (a: TournamentMatch, b: TournamentMatch) => (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot;
  const courtOrder = new Map(courts.map((c, i) => [c.id, i]));
  // 양쪽 선수가 정해진 경기만 — 부전승·빈 자리 제외
  const playable = matches.filter((m) => m.phase === phaseShown && m.entry1_id && m.entry2_id && matchHit(m));
  const onCourt = (m: TournamentMatch) => !!m.court_id && m.court_confirmed;
  const liveShown = playable
    .filter((m) => m.status !== 'done' && onCourt(m))
    .sort((a, b) => (courtOrder.get(a.court_id ?? '') ?? 0) - (courtOrder.get(b.court_id ?? '') ?? 0));
  const upcomingShown = playable.filter((m) => m.status !== 'done' && !onCourt(m)).sort(playOrder);
  const doneShown = playable.filter((m) => m.status === 'done').sort(playOrder).reverse();

  // 조추첨 공개 전(선수) 안내 — 대회정보·조편성·경기진행 탭에서 함께 쓴다
  const revealNotice =
    drawGenerated && !drawRevealed && drawRevealAt ? (
      <Notice icon="lock-closed-outline" text={`조추첨은 ${formatMeetupTime(drawRevealAt.toISOString())}에 공개돼요`} />
    ) : null;

  // 파트너 이름으로 회원 검색 (동명이인 대비 → 목록에서 선택). 300ms 디바운스.
  useEffect(() => {
    const q = partnerQuery.trim();
    if (q.length < 1) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPartnerResults([]);
      return;
    }
    setSearching(true);
    // 이미 이 대회에 참가 중인 사람(신청자·파트너)은 파트너로 못 고르게 제외
    const taken = new Set(
      entries.flatMap((e) => [e.user_id, e.partner_id]).filter(Boolean) as string[],
    );
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, skill_level, avatar_url, region')
        .ilike('nickname', `%${q}%`)
        .neq('id', uid ?? '')
        .limit(16);
      const list = ((data as PartnerProfile[]) ?? []).filter((p) => !taken.has(p.id)).slice(0, 8);
      setPartnerResults(list);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [partnerQuery, uid, entries]);

  // 참가비 결제 시작 — 주문 생성 후 결제 화면으로 (0089)
  async function startFeePayment() {
    if (!uid || !id || !t || t.fee <= 0) return;
    setActing(true);
    const res = await createTournamentEntryPayment({ tournamentId: id, title: t.title, fee: t.fee, uid });
    setActing(false);
    if (!res.ok) {
      Alert.alert(
        '결제 준비 실패',
        res.reason === 'config' ? '결제 설정이 아직 준비되지 않았어요.' : res.message ?? '잠시 후 다시 시도해주세요.',
      );
      return;
    }
    router.push({
      pathname: '/payment/court',
      params: {
        kind: 'tournament',
        tournamentId: id,
        paymentId: res.paymentId,
        orderId: res.orderId,
        orderName: res.orderName,
        amount: String(res.amount),
      },
    } as never);
  }

  // 신청 후 파트너 등록/변경/해제 (0090) — 대진 생성 전까지. 중복은 DB 트리거가 검사.
  async function updatePartner(p: PartnerProfile | null) {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('tournament_entries')
      .update({ partner_id: p?.id ?? null, partner_name: p?.nickname ?? null })
      .eq('tournament_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('파트너 변경 실패', error.message);
      return;
    }
    setEditingPartner(false);
    setPartnerQuery('');
    load();
  }

  function confirmCancel() {
    const paid = !!myEntry?.paid_at;
    const body = paid
      ? '대회 참가 신청을 취소할까요?\n결제한 참가비는 전액 환불됩니다. (대회 시작 후에는 취소 불가)'
      : '대회 참가 신청을 취소할까요?';
    Alert.alert('참가 취소', body, [
      { text: '닫기', style: 'cancel' },
      {
        text: '신청 취소',
        style: 'destructive',
        onPress: async () => {
          if (!uid || !id) return;
          setActing(true);
          if ((t?.fee ?? 0) > 0) {
            // 유료 대회: 서버가 환불(결제됨)·주문 정리(미결제) 후 행 삭제 → 대기열 자동 승격
            const res = await cancelTournamentEntry(id);
            setActing(false);
            if (!res.ok) {
              Alert.alert('취소 실패', res.error);
              return;
            }
            if (res.refunded) Alert.alert('취소 완료', `참가비 ${res.amount.toLocaleString()}원이 환불 처리됐어요.`);
          } else {
            await supabase.from('tournament_entries').delete().eq('tournament_id', id).eq('user_id', uid);
            setActing(false);
          }
          load();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }
  if (!t) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>대회를 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.tabBar}>
        {tabItems.map((it) => {
          const active = tab === it.key;
          return (
            <Pressable key={it.key} onPress={() => changeTab(it.key)} style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              <View style={[styles.tabPill, active && styles.tabPillActive]}>
                <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>{it.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab === 'info' ? (
          <>
            <View style={styles.headerArea}>
              <View style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.badgeRow}>
                    <Badge label={TOURNAMENT_FORMAT_LABELS[t.format]} color="#67A4FF" bg="rgba(56,132,255,0.14)" />
                    <Badge label={t.discipline === 'doubles' ? '복식' : '단식'} color="#F5B942" bg="rgba(245,166,35,0.16)" />
                    {t.dupr_certified ? <Badge label="DUPR 인증" color="#67A4FF" bg="rgba(45,107,214,0.12)" /> : null}
                    {t.dupr_premium ? <Badge label="DUPR+ 전용" color="#A98BFF" bg="rgba(139,92,246,0.14)" /> : null}
                  </View>
                  <StatusPill status={t.status} />
                </View>
                <Text style={styles.title} numberOfLines={3}>{t.title}</Text>
                <View style={styles.heroMetaList}>
                  <Info icon="calendar-outline" text={formatMeetupTime(t.start_at)} compact />
                  <Info icon="location-outline" text={`${t.venue || '장소 미정'}${t.region ? ` · ${t.region}` : ''}`} compact />
                </View>
              </View>
            </View>
            {t.images?.length ? (
              <View style={styles.gallery}>
                <Image source={{ uri: t.images[coverIdx] ?? t.images[0] }} style={styles.cover} />
                {t.images.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                    {t.images.map((uri, i) => (
                      <Pressable key={`${uri}-${i}`} onPress={() => setCoverIdx(i)}>
                        <Image source={{ uri }} style={[styles.thumb, i === coverIdx && styles.thumbActive]} />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </View>
            ) : null}
            <View style={styles.infoGrid}>
              <InfoTile icon="ribbon-outline" label="참가 실력" value={skillRangeLabel(t.skill_min, t.skill_max)} />
              <InfoTile
                icon="people-outline"
                label="참가 현황"
                value={`${t.approved_count + t.pending_count}/${t.max_participants}${t.format === 'team' || isDoubles ? '팀' : '명'}`}
              />
              <InfoTile icon="cash-outline" label="참가비" value={t.fee > 0 ? `${t.fee.toLocaleString()}원` : '무료'} />
              <InfoTile
                icon="hourglass-outline"
                label="접수 마감"
                value={t.registration_deadline ? formatMeetupTime(t.registration_deadline) : '별도 공지'}
              />
            </View>

            {/* 내 현황 — 참가자 본인의 상태·조·전적·다음 경기를 한눈에 (0092 UX) */}
            {myEntry && !isTeam && (
              myEntry.status === 'waitlist' ? (
                <View style={styles.waitlistCard}>
                  <View style={styles.waitlistHead}>
                    <Text style={styles.waitlistEyebrow}>내 참가 상태</Text>
                    <View style={styles.waitlistBadge}>
                      <Text style={styles.waitlistBadgeText}>대기 중</Text>
                    </View>
                  </View>

                  <Text style={styles.waitlistRank}>
                    현재 대기 <Text style={styles.waitlistRankAccent}>{myWaitlistRank}번</Text>
                  </Text>
                  <Text style={styles.waitlistAhead}>
                    앞에 <Text style={styles.waitlistAheadAccent}>{Math.max(0, myWaitlistRank - 1)}명</Text>이 기다리고 있어요
                  </Text>
                  <Text style={styles.waitlistHint}>
                    자리가 생기면 순서대로 자동 승인돼요{t.fee > 0 ? ' · 승인 후 24시간 안에 결제해 주세요' : ''}
                  </Text>

                  <View style={styles.waitlistFooter}>
                    <View style={styles.waitlistNotice}>
                      <Ionicons name="notifications-outline" size={19} color="#AAB4C0" />
                      <Text style={styles.waitlistNoticeText}>순번이 바뀌면 알려드릴게요</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="대기 규칙 보기"
                      onPress={() =>
                        Alert.alert(
                          '대기 규칙',
                          `참가가 취소되면 대기 순서대로 자동 승인돼요.${t.fee > 0 ? '\n승인 알림을 받은 뒤 24시간 안에 결제해야 참가가 확정돼요.' : ''}`,
                        )
                      }
                      style={({ pressed }) => [styles.waitlistRuleButton, pressed && styles.waitlistRuleButtonPressed]}>
                      <Text style={styles.waitlistRuleText}>대기 규칙</Text>
                      <Ionicons name="chevron-forward" size={16} color="#16C784" />
                    </Pressable>
                  </View>
                </View>
              ) : (
              <View style={styles.myCard}>
                <View style={styles.myHead}>
                  <Text style={styles.myTitle}>내 현황</Text>
                  {myEntry.status === 'approved' ? (
                    <View style={[styles.myBadge, { backgroundColor: 'rgba(22,199,132,0.16)' }]}>
                      <Text style={[styles.myBadgeTxt, { color: '#16C784' }]}>참가 확정{myEntry.paid_at ? ' · 결제 완료' : ''}</Text>
                    </View>
                  ) : myEntry.status === 'pending' && t.fee > 0 ? (
                    <View style={[styles.myBadge, { backgroundColor: 'rgba(251,191,36,0.16)' }]}>
                      <Text style={[styles.myBadgeTxt, { color: '#FBBF24' }]}>결제 대기</Text>
                    </View>
                  ) : (
                    <View style={[styles.myBadge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                      <Text style={[styles.myBadgeTxt, { color: '#AAB4C0' }]}>{ENTRY_LABEL[myEntry.status]}</Text>
                    </View>
                  )}
                </View>

                {myEntry.status === 'pending' && t.fee > 0 && myEntry.payment_deadline ? (
                  <Text style={styles.myHint}>{formatMeetupTime(myEntry.payment_deadline)}까지 결제하면 참가가 확정돼요.</Text>
                ) : myEntry.status === 'approved' && !drawGenerated ? (
                  <Text style={styles.myHint}>대진 발표를 기다리고 있어요. 대진이 나오면 여기에 내 경기가 표시돼요.</Text>
                ) : null}

                {myEntry.status === 'approved' && drawGenerated && drawRevealed ? (
                  <>
                    <View style={styles.myStatsRow}>
                      {myGroupNo ? (
                        <View style={styles.myStatBox}>
                          <Text style={styles.myStatLabel}>내 조</Text>
                          <Text style={styles.myStatValue}>{myGroupNo}조</Text>
                        </View>
                      ) : null}
                      <View style={styles.myStatBox}>
                        <Text style={styles.myStatLabel}>전적</Text>
                        <Text style={styles.myStatValue}>{myWins}승 {myDoneMatches.length - myWins}패</Text>
                      </View>
                      {myRank ? (
                        <View style={styles.myStatBox}>
                          <Text style={styles.myStatLabel}>조 순위</Text>
                          <Text style={styles.myStatValue}>{myRank}위</Text>
                        </View>
                      ) : null}
                    </View>
                    {myNextMatch ? (
                      <Pressable
                        onPress={() => changeTab('progress')}
                        style={styles.myNextRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.myStatLabel}>{onCourt(myNextMatch) ? '지금 내 경기' : '다음 경기'}</Text>
                          <Text style={styles.myNextName} numberOfLines={1}>
                            vs {nameOf(myNextMatch.entry1_id === uid ? myNextMatch.entry2_id : myNextMatch.entry1_id)}
                          </Text>
                        </View>
                        {courtLabelOf(myNextMatch.court_id) ? (
                          <View style={[styles.myBadge, { backgroundColor: 'rgba(22,199,132,0.16)', flexShrink: 0 }]}>
                            <Text numberOfLines={1} style={[styles.myBadgeTxt, { color: '#16C784' }]}>
                              🏟 {courtLabelOf(myNextMatch.court_id)}{myNextMatch.court_confirmed ? '' : ' · 예정'}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.myHint}>코트 대기</Text>
                        )}
                        <Ionicons name="chevron-forward" size={16} color="#707B87" />
                      </Pressable>
                    ) : (
                      <Text style={styles.myHint}>남은 내 경기가 없어요. 수고하셨어요!</Text>
                    )}
                  </>
                ) : null}
              </View>
              )
            )}

            {/* 신청 후 복식 파트너 등록·변경·해제 (0090) */}
            {!isTeam && isDoubles && !iAmPartner && !!myEntry && myEntry.status !== 'rejected' && !drawGenerated && (
              <View style={styles.partnerCard}>
                <View style={styles.partnerHead}>
                  <Ionicons name="people-circle" size={20} color="#16C784" />
                  <Text style={styles.sectionTitle}>{myEntry ? '내 파트너 (복식)' : '파트너 선택 (복식)'}</Text>
                </View>
                <Text style={styles.partnerSub}>
                  {myEntry
                    ? '대진 생성 전까지 파트너를 등록·변경할 수 있어요.'
                    : '함께 출전할 회원을 검색해 선택하세요. 파트너 없이 신청하고 나중에 등록해도 돼요.'}
                </Text>

                {myEntry && !editingPartner ? (
                  myEntry.partner || myEntry.partner_name ? (
                    <View style={styles.partnerChip}>
                      <Avatar nickname={myEntry.partner?.nickname ?? myEntry.partner_name ?? '?'} uri={myEntry.partner?.avatar_url} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pName}>{myEntry.partner?.nickname ?? myEntry.partner_name}</Text>
                        {myEntry.partner ? (
                          <Text style={styles.pMeta}>
                            {myEntry.partner.region || '지역 미설정'} · {myEntry.partner.skill_level.toFixed(1)} {skillLabel(myEntry.partner.skill_level)}
                          </Text>
                        ) : null}
                      </View>
                      <Text onPress={() => setEditingPartner(true)} style={styles.partnerClear}>변경</Text>
                      <Text
                        onPress={() =>
                          Alert.alert('파트너 해제', '파트너를 해제할까요?', [
                            { text: '닫기', style: 'cancel' },
                            { text: '해제', style: 'destructive', onPress: () => updatePartner(null) },
                          ])
                        }
                        style={[styles.partnerClear, { color: '#F26D6D' }]}>
                        해제
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.partnerNotice}>
                        <Ionicons name="alert-circle-outline" size={16} color="#FBBF24" />
                        <Text style={[styles.pMeta, { flex: 1, color: '#FBBF24' }]}>파트너 미정 — 대진 생성 전까지 등록해 주세요.</Text>
                      </View>
                      <Button title="파트너 등록" variant="outline" onPress={() => setEditingPartner(true)} />
                    </>
                  )
                ) : (
                  <>
                    <TextField
                      label="파트너 이름으로 검색"
                      value={partnerQuery}
                      onChangeText={setPartnerQuery}
                      placeholder="닉네임 입력 후 목록에서 선택"
                      autoCapitalize="none"
                    />
                    {searching ? (
                      <Text style={[styles.pMeta, { marginTop: 6 }]}>검색 중…</Text>
                    ) : partnerQuery.trim().length > 0 && partnerResults.length === 0 ? (
                      <View style={styles.partnerNotice}>
                        <Ionicons name="alert-circle-outline" size={16} color="#AAB4C0" />
                        <Text style={[styles.pMeta, { flex: 1 }]}>
                          가입되지 않은 회원이에요. 앱에 가입된 회원만 파트너로 지정할 수 있어요.
                        </Text>
                      </View>
                    ) : (
                      <View style={{ marginTop: 6, gap: 6 }}>
                        {partnerResults.map((p) => (
                          <Pressable
                            key={p.id}
                            onPress={() => updatePartner(p)}
                            style={styles.partnerRow}>
                            <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.pName}>{p.nickname}</Text>
                              <Text style={styles.pMeta}>
                                {p.region || '지역 미설정'} · {p.skill_level.toFixed(1)} {skillLabel(p.skill_level)}
                              </Text>
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {myEntry ? (
                      <Text
                        onPress={() => {
                          setEditingPartner(false);
                          setPartnerQuery('');
                        }}
                        style={[styles.partnerClear, { alignSelf: 'flex-end', marginTop: 8 }]}>
                        닫기
                      </Text>
                    ) : null}
                  </>
                )}
              </View>
            )}

            {t.description ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>소개</Text>
                <Text style={styles.desc}>{t.description}</Text>
              </View>
            ) : null}

            {courts.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>코트 {courts.length}면</Text>
                <View style={styles.courtWrap}>
                  {courts.map((c) => (
                    <View key={c.id} style={styles.courtChip}>
                      <Text style={styles.courtName}>{c.name}</Text>
                      <View style={[styles.courtTag, { backgroundColor: c.indoor ? 'rgba(56,132,255,0.14)' : 'rgba(245,166,35,0.16)' }]}>
                        <Text style={[styles.courtTagText, { color: c.indoor ? '#2D6BD6' : '#F5A623' }]}>
                          {c.indoor ? '실내' : '실외'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 조추첨 미공개 (선수) */}
            {revealNotice}

            {/* 단체전: 팀 신청·내 팀은 참가팀 탭에서 */}
            {isTeam && t.status === 'registration' ? (
              <Pressable onPress={() => changeTab('players')} style={styles.teamLink} accessibilityRole="button">
                <Ionicons name="people-outline" size={18} color="#16C784" />
                <Text style={styles.teamLinkText}>팀 참가 신청과 내 팀은 &apos;참가팀&apos; 탭에서 볼 수 있어요</Text>
                <Ionicons name="chevron-forward" size={16} color="#16C784" />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={styles.compactTournamentBar}>
            <View style={styles.compactTournamentCopy}>
              <Text style={styles.compactTournamentLabel}>
                {TOURNAMENT_FORMAT_LABELS[t.format]}{isTeam ? '' : ` · ${isDoubles ? '복식' : '단식'}`}
              </Text>
              <Text style={styles.compactTournamentTitle} numberOfLines={1}>{t.title}</Text>
            </View>
            <StatusPill status={t.status} />
          </View>
        )}

        {!isTeam && (tab === 'players' ? approved.length > 0 : tab !== 'info' && hasBracket) && (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color="#AAB4C0" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="이름으로 검색"
              placeholderTextColor="#707B87"
              autoCapitalize="none"
              style={styles.searchInput}
            />
            {search.length > 0 && (
              <Ionicons name="close-circle" size={18} color="#707B87" onPress={() => setSearch('')} />
            )}
          </View>
        )}

        {/* 참가자 탭 */}
        {!isTeam && tab === 'players' && (
          <View style={styles.section}>
            <View style={styles.playerSectionHead}>
              <View>
                <Text style={styles.sectionTitle}>{isDoubles ? '참가 팀' : '참가 선수'}</Text>
                <Text style={styles.playerSectionSub}>{isDoubles ? '팀명과 소속 클럽을 확인하세요' : '선수와 소속 클럽을 확인하세요'}</Text>
              </View>
              <View style={styles.playerCountBadge}>
                <Text style={styles.playerCountText}>
                  {q ? `${approvedShown.length}/${approved.length}` : approved.length}{isDoubles ? '팀' : '명'}
                </Text>
              </View>
            </View>
            {approved.length === 0 ? (
              <Text style={[styles.mutedText, styles.playerEmpty]}>아직 확정된 참가자가 없어요.</Text>
            ) : approvedShown.length === 0 ? (
              <Text style={[styles.mutedText, styles.playerEmpty]}>검색 결과가 없어요.</Text>
            ) : (
              <View style={styles.playerList}>
                {approvedShown.map((e, index) => (
                  <View key={e.user_id} style={[styles.playerTeamCard, isDoubles && styles.playerTeamCardDoubles]}>
                    <View style={styles.playerTeamNumberColumn}>
                      <Text style={styles.playerIndex}>{String(index + 1).padStart(2, '0')}</Text>
                    </View>
                    <View style={styles.playerTeamMembers}>
                      <View style={styles.playerMemberRow}>
                        <Avatar nickname={e.profiles?.nickname ?? '?'} uri={e.profiles?.avatar_url} size={38} />
                        <View style={styles.playerCopy}>
                          <Text style={styles.playerTeamName} numberOfLines={1}>{e.profiles?.nickname ?? '알 수 없음'}</Text>
                          <Text style={styles.playerClubName} numberOfLines={1}>{clubLabelOf(e.user_id)}</Text>
                        </View>
                      </View>
                      {isDoubles ? (
                        <>
                          <View style={styles.playerMemberDivider} />
                          <View style={styles.playerMemberRow}>
                            <Avatar
                              nickname={e.partner?.nickname ?? e.partner_name ?? '?'}
                              uri={e.partner?.avatar_url}
                              size={38}
                            />
                            <View style={styles.playerCopy}>
                              <Text style={styles.playerTeamName} numberOfLines={1}>
                                {e.partner?.nickname ?? e.partner_name ?? '파트너 미정'}
                              </Text>
                              <Text style={styles.playerClubName} numberOfLines={1}>{clubLabelOf(e.partner_id)}</Text>
                            </View>
                          </View>
                        </>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* 단체전: 참가팀 탭 */}
        {isTeam && tab === 'players' && <TeamRegister tournament={t} uid={uid} onChange={() => setTeamRev((v) => v + 1)} />}
        {/* 단체전: 경기진행 탭 (예선·본선 대진) */}
        {isTeam && tab === 'progress' && (
          <TeamBracketView
            tournamentId={t.id}
            uid={uid}
            refreshKey={teamRev}
            onChange={() => setTeamRev((value) => value + 1)}
          />
        )}

        {/* 조편성 (조별리그 · KDK 순위) — 대진 전에는 안내만 */}
        {!isTeam && tab === 'groups' && !hasBracket && (
          revealNotice ?? (
            <Notice
              icon="grid-outline"
              text={t.format === 'kdk' ? '순위는 대진이 나오면 여기에 표시돼요.' : '조편성은 대진이 나오면 여기에 표시돼요.'}
            />
          )
        )}
        {!isTeam && tab === 'groups' && hasBracket && groupMatchesAll.length === 0 && (
          <Notice icon="grid-outline" text="조별 경기가 없는 대회예요." />
        )}
        {hasBracket && tab === 'groups' && groupMatchesAll.length > 0 && (
          <View style={styles.section}>
            <View style={styles.groupSectionHead}>
              <Text style={styles.groupSectionTitle}>조별 현황</Text>
              {groupNos.length > 2 ? (
                <View style={styles.groupScrollHint}>
                  <Text style={styles.groupScrollHintText}>{groupNos.length}개 조 · 옆으로 보기</Text>
                  <Ionicons name="arrow-forward" size={14} color="#16C784" />
                </View>
              ) : null}
            </View>
            <View style={styles.groupCarouselWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.groupCardRow}
                snapToInterval={150}
                decelerationRate="fast"
                scrollEventThrottle={16}
                onScroll={({ nativeEvent }) => {
                  const { contentOffset, contentSize, layoutMeasurement } = nativeEvent;
                  setGroupScrollHasMore(contentOffset.x + layoutMeasurement.width < contentSize.width - 8);
                }}>
                {orderedGroupTabs.map((g) => {
                  const active = groupTab === g;
                  const groupMatches = groupMatchesAll.filter((m) => (m.group_no ?? 1) === g);
                  const teamCount = groupMembers(groupMatches).length;
                  const doneCount = groupMatches.filter((m) => m.status === 'done').length;
                  return (
                    <Pressable
                      key={String(g)}
                      onPress={() => setGroupTab(g)}
                      style={({ pressed }) => [styles.groupCard, active && styles.groupCardActive, pressed && styles.groupCardPressed]}>
                      <Text style={[styles.groupCardTitle, active && styles.groupCardTitleActive]}>{g}조</Text>
                      <Text style={styles.groupCardTeams}>{teamCount}{isDoubles ? '팀' : '명'}</Text>
                      <Text style={styles.groupCardProgress}>{doneCount}/{groupMatches.length} 경기</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {groupNos.length > 2 && groupScrollHasMore ? (
                <View pointerEvents="none" style={styles.groupMoreIndicator}>
                  <Ionicons name="chevron-forward" size={20} color="#F8FAFC" />
                </View>
              ) : null}
            </View>

            {groupTab ? (() => {
              const gms = groupMatchesAll.filter((m) => (m.group_no ?? 1) === groupTab);
              const table = standings(groupMembers(gms), gms);
              const shownGms = q ? gms.filter(matchHit) : gms;
              return (
                <View style={styles.selectedGroupContent}>
                  <Text style={styles.subLabel}>{groupTab}조 순위</Text>
                  <View style={styles.tableCard}>
                    {table.map((s, i) => (
                      <View key={s.id} style={[styles.standRow, i > 0 && styles.standRowDivider]}>
                        <Text style={styles.standRank}>{i + 1}</Text>
                        <Text style={styles.standName} numberOfLines={1}>{nameOf(s.id)}</Text>
                        <Text style={styles.standStat}>{s.wins}승</Text>
                        <Text style={styles.standStatMuted}>{s.diff > 0 ? `+${s.diff}` : s.diff}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.groupMatchList}>
                    {shownGms.length > 0 ? shownGms.map((m) => (
                      <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} live={m.status !== 'done' && onCourt(m)} />
                    )) : <Text style={styles.mutedText}>일치하는 경기가 없어요.</Text>}
                  </View>
                </View>
              );
            })() : null}
          </View>
        )}

        {/* 경기진행 — 내 다음 경기 · 코트에서 진행 중 · 다음 경기 · 본선 대진표 · 끝난 경기 */}
        {!isTeam && tab === 'progress' && !hasBracket && (
          revealNotice ?? <Notice icon="tennisball-outline" text="대진이 나오면 경기 순서와 코트가 여기에 표시돼요." />
        )}
        {hasBracket && tab === 'progress' && (
          <View style={styles.progressWrap}>
            {myEntry?.status === 'approved' && myNextMatch ? (
              <View style={styles.myNextRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.myStatLabel}>{onCourt(myNextMatch) ? '지금 내 경기' : '내 다음 경기'} · {matchCaption(myNextMatch)}</Text>
                  <Text style={styles.myNextName} numberOfLines={1}>
                    vs {nameOf(myNextMatch.entry1_id === uid ? myNextMatch.entry2_id : myNextMatch.entry1_id)}
                  </Text>
                </View>
                {courtLabelOf(myNextMatch.court_id) ? (
                  <View style={[styles.myBadge, { backgroundColor: 'rgba(22,199,132,0.16)', flexShrink: 0 }]}>
                    <Text numberOfLines={1} style={[styles.myBadgeTxt, { color: '#16C784' }]}>
                      🏟 {courtLabelOf(myNextMatch.court_id)}{myNextMatch.court_confirmed ? '' : ' · 예정'}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.myHint}>코트 대기</Text>
                )}
              </View>
            ) : null}

            {showPhaseSwitch ? (
              <View style={styles.phaseTabs}>
                {(
                  [
                    { key: 'group', label: '예선', icon: 'grid-outline', meta: `${groupDoneCount}/${groupMatchesAll.length}경기` },
                    {
                      key: 'knockout',
                      label: '본선',
                      icon: 'git-network-outline',
                      meta: knockoutStarted ? `${koDoneCount}/${koMatches.length}경기` : '대진 미정',
                    },
                  ] as const
                ).map((p) => {
                  const on = phaseShown === p.key;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => setProgressPhase(p.key)}
                      style={[styles.phaseTab, on && styles.phaseTabOn]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}>
                      <Ionicons name={p.icon} size={17} color={on ? '#16C784' : '#707B87'} />
                      <View>
                        <Text style={[styles.phaseTabText, on && styles.phaseTabTextOn]}>{p.label}</Text>
                        <Text style={styles.phaseTabMeta}>{p.meta}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {phaseShown === 'knockout' && !knockoutStarted ? (
              // 본선 선수가 아직 안 정해졌으면 빈 목록 대신 안내 한 줄 + 대진표
              <Notice icon="git-network-outline" text="본선 대진은 예선이 끝나면 정해져요." />
            ) : (
              <>
                <MatchSection
                  key={`live-${phaseShown}`}
                  title="지금 코트에서"
                  items={liveShown}
                  empty={q ? '일치하는 경기가 없어요.' : '코트에서 진행 중인 경기가 없어요.'}
                  renderItem={(m) => (
                    <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} caption={matchCaption(m)} live />
                  )}
                />
                <MatchSection
                  key={`next-${phaseShown}`}
                  title="다음 경기"
                  items={upcomingShown}
                  limit={PROGRESS_PREVIEW}
                  empty={q ? '일치하는 경기가 없어요.' : '남은 경기가 없어요.'}
                  renderItem={(m) => (
                    <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} caption={matchCaption(m)} />
                  )}
                />
              </>
            )}

            {/* 본선은 대진표에 결과까지 나오니 끝난 경기 목록 대신 대진표 */}
            {phaseShown === 'knockout' ? (
              <View>
                <Text style={styles.sectionTitle}>본선 대진표</Text>
                {q ? <Text style={[styles.pMeta, { marginTop: 4 }]}>검색어와 일치하는 선수를 강조 표시해요.</Text> : null}
                <View style={styles.progressBracket}>
                  <BracketTree matches={koMatches} nameOf={nameOf} uid={uid} highlightQuery={q} avatarOf={avatarOf} />
                </View>
              </View>
            ) : (
              <MatchSection
                title="끝난 경기"
                items={doneShown}
                limit={PROGRESS_PREVIEW}
                empty={q ? '일치하는 경기가 없어요.' : '아직 끝난 경기가 없어요.'}
                renderItem={(m) => (
                  <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} caption={matchCaption(m)} />
                )}
              />
            )}
          </View>
        )}

      </ScrollView>

      {!isTeam && (
      <View style={styles.actionBar}>
        {myEntry ? (
          <View style={{ gap: 8 }}>
            <View style={styles.statusRow}>
              <Ionicons
                name={myEntry.status === 'approved' ? 'checkmark-circle' : myEntry.status === 'pending' && (t?.fee ?? 0) > 0 ? 'card' : 'time'}
                size={18}
                color={myEntry.status === 'approved' ? '#16C784' : myEntry.status === 'pending' && (t?.fee ?? 0) > 0 ? '#FBBF24' : '#AAB4C0'}
              />
              <Text style={styles.statusText}>
                {myEntry.status === 'waitlist'
                  ? `대기 ${myWaitlistRank}번`
                  : myEntry.status === 'pending' && (t?.fee ?? 0) > 0
                    ? '결제 대기'
                    : myEntry.status === 'approved' && myEntry.paid_at
                      ? '참가 확정 · 결제 완료'
                      : ENTRY_LABEL[myEntry.status]}
              </Text>
            </View>
            {/* 유료 대회 결제 대기: 마감 안내 + 결제 버튼 (0089) */}
            {myEntry.status === 'pending' && (t?.fee ?? 0) > 0 && !myEntry.paid_at ? (
              <>
                {myEntry.payment_deadline ? (
                  <Text style={styles.payDeadline}>
                    {formatMeetupTime(myEntry.payment_deadline)}까지 결제해야 참가가 확정돼요. 기한이 지나면 자동 취소됩니다.
                  </Text>
                ) : null}
                <Button title={`참가비 결제하기 · ${(t?.fee ?? 0).toLocaleString()}원`} onPress={startFeePayment} loading={acting} />
              </>
            ) : null}
            {myEntry.status === 'approved' && checkedIn ? (
              <View style={styles.statusRow}>
                <Ionicons name="checkmark-done-circle" size={18} color="#16C784" />
                <Text style={[styles.statusText, { color: '#16C784' }]}>운영자 출전 확인 완료</Text>
              </View>
            ) : null}
            {myEntry.status !== 'rejected' &&
              (myEntry.status === 'approved' && drawGenerated ? (
                // 조추첨 후에는 선수 스스로 취소 불가 — 대진이 깨지므로 운영자만 처리 (0091)
                <View style={styles.statusRow}>
                  <Ionicons name="lock-closed-outline" size={15} color="#AAB4C0" />
                  <Text style={[styles.pMeta, { flex: 1, marginTop: 0 }]}>
                    대진 확정 후에는 참가 취소가 불가해요. 불참은 운영자에게 문의해 주세요.
                  </Text>
                </View>
              ) : (
                <Button title={myEntry.status === 'waitlist' ? '대기 취소' : '참가 신청 취소'} variant="outline" onPress={confirmCancel} loading={acting} />
              ))}
          </View>
        ) : iAmPartner ? (
          <View style={styles.statusRow}>
            <Ionicons name="people" size={18} color="#16C784" />
            <Text style={styles.statusText}>{iAmPartner.profiles?.nickname ?? '상대'}님의 파트너로 참가 신청됨</Text>
          </View>
        ) : canRegister ? (
          <Button
            title={slotsFull ? '대기 신청하기' : '참가 신청하기'}
            icon="arrow-forward"
            onPress={() => router.push(`/tournament/apply/${id}` as never)}
          />
        ) : (
          <Button title="접수가 마감되었어요" variant="secondary" disabled onPress={() => {}} />
        )}
      </View>
      )}
    </SafeAreaView>
  );
}

function Info({ icon, text, compact = false }: { icon: keyof typeof Ionicons.glyphMap; text: string; compact?: boolean }) {
  return (
    <View style={[styles.infoRow, compact && styles.infoRowCompact]}>
      <Ionicons name={icon} size={compact ? 16 : 18} color="#16C784" />
      <Text style={[styles.infoText, compact && styles.infoTextCompact]}>{text}</Text>
    </View>
  );
}

function InfoTile({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoTile}>
      <View style={styles.infoTileIcon}>
        <Ionicons name={icon} size={18} color="#16C784" />
      </View>
      <View style={styles.infoTileCopy}>
        <Text style={styles.infoTileLabel}>{label}</Text>
        <Text style={styles.infoTileValue} numberOfLines={2}>{value}</Text>
      </View>
    </View>
  );
}

// 대회 상태 배지 — 접수중만 강조
function StatusPill({ status }: { status: TournamentStatus }) {
  const muted = status !== 'registration';
  return (
    <View style={[styles.heroStatus, muted && styles.heroStatusMuted]}>
      <View style={[styles.heroStatusDot, muted && styles.heroStatusDotMuted]} />
      <Text style={[styles.heroStatusText, muted && styles.heroStatusTextMuted]}>
        {status === 'registration' ? '접수중' : status === 'ongoing' ? '진행중' : status === 'finished' ? '종료' : '취소됨'}
      </Text>
    </View>
  );
}

// 탭이 아직 비어 있을 때의 안내 상자
function Notice({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.revealBox}>
      <Ionicons name={icon} size={20} color="#AAB4C0" />
      <Text style={styles.revealText}>{text}</Text>
    </View>
  );
}

// 경기 위치 표시: 예선은 'n조', 본선은 라운드 이름
function matchCaption(m: TournamentMatch) {
  return m.phase === 'group' ? `${m.group_no ?? 1}조` : m.round_name ?? '본선';
}

// 경기진행 탭의 경기 묶음: 제목·개수, 길면 앞부분만 보여 주고 '더 보기'
function MatchSection({
  title,
  items,
  empty,
  renderItem,
  limit,
}: {
  title: string;
  items: TournamentMatch[];
  empty: string;
  renderItem: (m: TournamentMatch) => ReactNode;
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const folded = !!limit && items.length > limit;
  const shown = folded && !expanded ? items.slice(0, limit) : items;
  return (
    <View>
      <View style={styles.progressHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.progressCount}>{items.length}</Text>
      </View>
      {items.length > 0 ? (
        <View style={styles.progressList}>
          {shown.map(renderItem)}
          {folded ? (
            <Pressable onPress={() => setExpanded((v) => !v)} style={styles.moreButton} accessibilityRole="button">
              <Text style={styles.moreText}>{expanded ? '접기' : `${items.length - (limit ?? 0)}경기 더 보기`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={[styles.mutedText, styles.progressEmpty]}>{empty}</Text>
      )}
    </View>
  );
}

// 경기 한 건: 양쪽 이름 + 점수(완료 시), 승자 강조, 내 경기 하이라이트
function MatchRow({
  m,
  nameOf,
  uid,
  highlight = false,
  courtLabel,
  avatarOf,
  caption,
  live = false,
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  uid: string | undefined;
  highlight?: boolean;
  courtLabel?: string;
  avatarOf?: (id: string | null) => { uri: string | null; nickname: string } | null;
  caption?: string; // 'n조' · 라운드 이름 (경기진행 탭)
  live?: boolean; // 코트에서 진행 중
}) {
  const done = m.status === 'done';
  const w1 = done && !!m.winner_id && m.winner_id === m.entry1_id;
  const w2 = done && !!m.winner_id && m.winner_id === m.entry2_id;
  const mine = highlight || m.entry1_id === uid || m.entry2_id === uid;
  return (
    <View style={[styles.matchRow, { borderColor: mine ? '#16C784' : 'rgba(255,255,255,0.09)' }]}>
      <View style={{ flex: 1, gap: 4 }}>
        {[
          { id: m.entry1_id, score: m.score1, win: w1 },
          { id: m.entry2_id, score: m.score2, win: w2 },
        ].map((side, i) => {
          const av = avatarOf?.(side.id);
          return (
            <View key={i} style={styles.matchSide}>
              <View style={styles.matchNameWrap}>
                {av ? <Avatar nickname={av.nickname} uri={av.uri} size={22} /> : null}
                <Text style={[styles.matchName, { fontWeight: side.win ? '800' : '500' }]} numberOfLines={1}>
                  {nameOf(side.id)}
                </Text>
              </View>
              <Text style={[styles.matchScore, { color: side.win ? '#16C784' : '#AAB4C0' }]}>
                {done ? side.score ?? 0 : '·'}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {caption ? <Text style={styles.matchCaption}>{caption}</Text> : null}
        {courtLabel ? (
          <View style={styles.matchCourt}>
            <Text style={styles.matchCourtText}>🏟 {courtLabel}</Text>
          </View>
        ) : null}
        {!done && <Text style={[styles.matchTag, live && styles.matchTagLive]}>{live ? '경기 중' : '예정'}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  notFound: { color: '#AAB4C0', fontSize: 15 },
  mutedText: { color: '#AAB4C0', fontSize: 14 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, gap: Spacing.three, paddingBottom: Spacing.four },
  headerArea: {
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  heroCard: {
    gap: 12,
  },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  heroStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(22,199,132,0.1)',
  },
  heroStatusMuted: { opacity: 0.7 },
  heroStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16C784' },
  heroStatusDotMuted: { backgroundColor: '#AAB4C0' },
  heroStatusText: { color: '#16C784', fontSize: 12, fontWeight: '800' },
  heroStatusTextMuted: { color: '#AAB4C0' },
  heroMetaList: { gap: 8, paddingTop: 2 },
  tabBar: {
    flexDirection: 'row',
    height: 49,
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.09)',
  },
  tabItem: { flex: 1 },
  tabPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabPillActive: { borderBottomColor: '#16C784' },
  tabText: { color: '#7F8B98', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#F8FAFC', fontWeight: '900' },
  compactTournamentBar: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
  compactTournamentCopy: { flex: 1, minWidth: 0 },
  compactTournamentLabel: { color: '#16C784', fontSize: 10, fontWeight: '900' },
  compactTournamentTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '900', marginTop: 2 },
  teamLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.two,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.35)',
    backgroundColor: 'rgba(22,199,132,0.08)',
  },
  teamLinkText: { flex: 1, color: '#F8FAFC', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  progressWrap: { gap: Spacing.four, marginTop: Spacing.one },
  // 경기진행 예선·본선 전환 (단체전 대진 화면과 같은 모양)
  phaseTabs: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  phaseTab: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderCurve: 'continuous',
  },
  phaseTabOn: { backgroundColor: 'rgba(22,199,132,0.13)' },
  phaseTabText: { color: '#AAB4C0', fontSize: 14, fontWeight: '900' },
  phaseTabTextOn: { color: '#F8FAFC' },
  phaseTabMeta: { color: '#707B87', fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  progressHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressCount: { color: '#16C784', fontSize: 15, fontWeight: '900' },
  progressList: { gap: 7, marginTop: 8 },
  progressEmpty: { marginTop: 8 },
  progressBracket: { marginTop: 8 },
  moreButton: { alignItems: 'center', paddingVertical: 10 },
  moreText: { color: '#16C784', fontSize: 13, fontWeight: '800' },
  badgeRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 23, lineHeight: 31, fontWeight: '900', color: '#F8FAFC' },
  gallery: { marginBottom: Spacing.three, gap: 8 },
  cover: { width: '100%', height: 200, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#151D25' },
  thumbRow: { gap: 8, paddingVertical: 2 },
  thumb: { width: 64, height: 64, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#151D25', opacity: 0.6 },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: '#16C784' },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  infoTile: {
    width: '50%',
    minHeight: 76,
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  infoTileIcon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  infoTileCopy: { gap: 2 },
  infoTileLabel: { color: '#7F8B98', fontSize: 11.5, fontWeight: '700' },
  infoTileValue: { color: '#F8FAFC', fontSize: 13.5, lineHeight: 18, fontWeight: '800' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', color: '#F8FAFC', flex: 1 },
  infoRowCompact: { gap: 8 },
  infoTextCompact: { color: '#AAB4C0', fontSize: 13.5, lineHeight: 19 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  desc: { fontSize: 15, lineHeight: 22, color: '#AAB4C0', marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  pMeta: { fontSize: 13, color: '#AAB4C0', marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  playerSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  playerSectionSub: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: '#7F8B98' },
  playerCountBadge: { minWidth: 54, height: 30, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: 'rgba(22,199,132,0.12)' },
  playerCountText: { fontSize: 13, fontWeight: '900', color: '#16C784' },
  playerList: { marginTop: 14, gap: 10 },
  playerTeamCard: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.11)',
  },
  playerTeamCardDoubles: { minHeight: 122 }, // 복식은 두 줄(신청자 + 파트너)
  playerTeamNumberColumn: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.11)',
  },
  playerIndex: { fontSize: 17, fontWeight: '900', color: '#AAB4C0', textAlign: 'center', fontVariant: ['tabular-nums'] },
  playerTeamMembers: { flex: 1, paddingLeft: 12 },
  playerMemberRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10 },
  playerMemberDivider: { height: 1, marginVertical: 3, marginLeft: 48, backgroundColor: 'rgba(255,255,255,0.09)' },
  playerCopy: { flex: 1, minWidth: 0 },
  playerTeamName: { fontSize: 14.5, lineHeight: 20, fontWeight: '800', color: '#F8FAFC' },
  playerClubName: { marginTop: 2, fontSize: 12.5, lineHeight: 17, color: '#AAB4C0' },
  playerEmpty: { marginTop: 18 },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', backgroundColor: '#070A0D' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  statusText: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  payDeadline: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: '#FBBF24' },
  waitlistCard: {
    marginTop: 12,
    padding: Spacing.three,
    borderRadius: 8,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.38)',
    gap: 8,
  },
  waitlistHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  waitlistEyebrow: { color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
  waitlistBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#16C784',
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  waitlistBadgeText: { color: '#16C784', fontSize: 12, fontWeight: '900' },
  waitlistRank: { color: '#F8FAFC', fontSize: 25, lineHeight: 34, fontWeight: '900', fontVariant: ['tabular-nums'] },
  waitlistRankAccent: { color: '#16C784' },
  waitlistAhead: { color: '#F8FAFC', fontSize: 15, lineHeight: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  waitlistAheadAccent: { color: '#16C784' },
  waitlistHint: { color: '#AAB4C0', fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  waitlistFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
    paddingTop: 12,
    marginTop: 6,
  },
  waitlistNotice: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  waitlistNoticeText: { flex: 1, color: '#AAB4C0', fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  waitlistRuleButton: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, paddingLeft: 8 },
  waitlistRuleButtonPressed: { opacity: 0.65 },
  waitlistRuleText: { color: '#16C784', fontSize: 13, fontWeight: '800' },
  // 내 현황 카드 (0092 UX)
  myCard: {
    marginTop: 12, padding: Spacing.three, borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.06)', borderWidth: 1, borderColor: 'rgba(22,199,132,0.35)', gap: 10,
  },
  myHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  myBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  myBadgeTxt: { fontSize: 12, fontWeight: '900' },
  myHint: { color: '#AAB4C0', fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  myStatsRow: { flexDirection: 'row', gap: 8 },
  myStatBox: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', gap: 2,
  },
  myStatLabel: { color: '#707B87', fontSize: 11, fontWeight: '800' },
  myStatValue: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
  myNextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.two, borderRadius: 8,
    borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  myNextName: { color: '#F8FAFC', fontSize: 15, fontWeight: '900', marginTop: 2 },
  partnerCard: {
    marginTop: Spacing.two,
    backgroundColor: 'rgba(22,199,132,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.28)',
    borderRadius: 8,
    borderCurve: 'continuous',
    padding: Spacing.three,
  },
  partnerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partnerSub: { fontSize: 13, color: '#AAB4C0', marginTop: 4, marginBottom: 8, lineHeight: 19 },
  partnerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: '#16C784',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  partnerClear: { fontSize: 14, fontWeight: '700', color: '#16C784', paddingHorizontal: 6, paddingVertical: 4 },
  partnerNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  courtWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  courtChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 6 },
  courtName: { fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  courtTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  courtTagText: { fontSize: 12, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 8, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: '#F8FAFC', paddingVertical: 0 },
  groupSectionTitle: { fontSize: 18, lineHeight: 24, fontWeight: '900', color: '#F8FAFC' },
  groupSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  groupScrollHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  groupScrollHintText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#16C784' },
  groupCarouselWrap: { position: 'relative' },
  groupCardRow: { gap: 8, paddingTop: 10, paddingRight: 18, paddingBottom: 4 },
  groupCard: {
    width: 142,
    height: 92,
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  groupCardActive: { borderColor: '#16C784', borderWidth: 2, backgroundColor: 'rgba(22,199,132,0.07)' },
  groupCardPressed: { opacity: 0.72 },
  groupCardTitle: { fontSize: 17, lineHeight: 21, fontWeight: '900', color: '#F8FAFC' },
  groupCardTitleActive: { color: '#16C784' },
  groupCardTeams: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#F8FAFC' },
  groupCardProgress: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#AAB4C0' },
  groupMoreIndicator: {
    position: 'absolute',
    right: 4,
    top: 38,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#27313B',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  groupMatchList: { gap: 7, marginTop: 8 },
  selectedGroupContent: { marginTop: 14 },
  revealBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 8, padding: 14, marginTop: Spacing.two },
  revealText: { fontSize: 15, fontWeight: '600', color: '#F8FAFC', flex: 1 },
  subLabel: { fontSize: 14, fontWeight: '700', color: '#AAB4C0', marginTop: 2 },
  subLabelPrimary: { fontSize: 14, fontWeight: '800', color: '#16C784', marginTop: 2 },
  tableCard: { backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 8, marginTop: 6, overflow: 'hidden' },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, gap: 8 },
  standRowDivider: { borderTopColor: 'rgba(255,255,255,0.09)', borderTopWidth: 1 },
  standRank: { width: 18, fontSize: 13, fontWeight: '700', color: '#AAB4C0', textAlign: 'center' },
  standName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#F8FAFC' },
  standStat: { width: 44, fontSize: 13, fontWeight: '600', color: '#F8FAFC', textAlign: 'right' },
  standStatMuted: { width: 44, fontSize: 13, fontWeight: '600', color: '#AAB4C0', textAlign: 'right' },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  matchSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  matchNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchName: { flex: 1, fontSize: 14, color: '#F8FAFC' },
  matchScore: { fontSize: 15, fontWeight: '800', minWidth: 18, textAlign: 'right' },
  matchTag: { fontSize: 12, fontWeight: '600', color: '#AAB4C0' },
  matchTagLive: { color: '#16C784', fontWeight: '800' },
  matchCaption: { fontSize: 11, fontWeight: '800', color: '#16C784' },
  matchCourt: { backgroundColor: '#151D25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  matchCourtText: { fontSize: 11, fontWeight: '700', color: '#AAB4C0' },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 8,
    padding: 8,
  },
});
