import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { useLoading } from '@/contexts/loading';
import { groupMembers, standings } from '@/lib/bracket';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { cancelTournamentEntry, createTournamentEntryPayment, isTossConfigured } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { TOURNAMENT_FORMAT_LABELS } from '@/lib/types';
import type {
  EntryStatus,
  PartnerProfile,
  TournamentCourt,
  TournamentEntryWithProfile,
  TournamentMatch,
  TournamentWithCounts,
} from '@/lib/types';

const ENTRY_LABEL: Record<EntryStatus, string> = {
  pending: '승인 대기중',
  approved: '참가 확정',
  rejected: '거절됨',
  withdrawn: '철회됨',
  waitlist: '대기열',
};

export default function TournamentDetail() {
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const router = useRouter();
  const { show, hide } = useLoading();
  const uid = session?.user.id;

  const [t, setT] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<TournamentEntryWithProfile[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [courts, setCourts] = useState<TournamentCourt[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<'info' | 'players' | 'prelim' | 'final' | 'register' | 'bracket'>('info');
  const [groupTab, setGroupTab] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [coverIdx, setCoverIdx] = useState(0); // 대회 사진 갤러리: 크게 볼 사진 인덱스
  const [nowMs, setNowMs] = useState(0); // 로드 시점 현재시각 (조추첨 공개/당일 판단용)
  const [teamRev, setTeamRev] = useState(0); // 단체전 오더 저장 시 대진뷰 새로고침 트리거

  // 복식 파트너 검색/선택
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<PartnerProfile[]>([]);
  const [partnerSel, setPartnerSel] = useState<PartnerProfile | null>(null);
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
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setMatches((ms as TournamentMatch[]) ?? []);
    setCourts((cs as TournamentCourt[]) ?? []);
    setNowMs(Date.now());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: t?.title ?? '대회' });
  }, [navigation, t?.title]);

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

  // 출전 신고: 대회 당일에만 가능
  const isEventDay = !!t && nowMs > 0 && new Date(t.start_at).toDateString() === new Date(nowMs).toDateString();
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
  // 대기열: 내 순번 / 정원이 찼는지
  const myWaitlistRank = entries.filter((e) => e.status === 'waitlist').findIndex((e) => e.user_id === uid) + 1;
  const slotsFull =
    !!t && entries.filter((e) => e.status === 'pending' || e.status === 'approved').length >= t.max_participants;

  // 대진이 있고 공개됐으면 정보/예선/본선 탭으로 분리 (미공개 시 선수에겐 정보 탭만)
  const drawGenerated = matches.length > 0;
  const hasBracket = drawGenerated && drawRevealed;
  const tabItems: { key: 'info' | 'players' | 'prelim' | 'final'; label: string }[] = [
    { key: 'info', label: '정보' },
    { key: 'players', label: `참가자 ${approved.length}` },
    // KDK 는 조별 풀리그 개인순위가 결과라 '순위' 로 표기 (본선 없음)
    ...(groupMatchesAll.length > 0 ? [{ key: 'prelim' as const, label: t?.format === 'kdk' ? '순위' : '예선' }] : []),
    ...(koMatches.length > 0 ? [{ key: 'final' as const, label: '본선' }] : []),
  ];
  // 단체전은 정보/참가/대진 탭으로 분리
  const teamTabItems: { key: 'info' | 'register' | 'bracket'; label: string }[] = [
    { key: 'info', label: '정보' },
    { key: 'register', label: '참가' },
    { key: 'bracket', label: '대진' },
  ];
  const showTabBar = true; // 개인전도 [정보/참가자/(순위·예선/본선)] 탭 상시 표시 — 정보 탭 과밀 해소

  // 파트너 이름으로 회원 검색 (동명이인 대비 → 목록에서 선택). 300ms 디바운스.
  useEffect(() => {
    const q = partnerQuery.trim();
    if (partnerSel || q.length < 1) {
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
  }, [partnerQuery, partnerSel, uid, entries]);

  // 참가 신청 전 확인 알럿
  function confirmApply() {
    // DUPR+ 전용 대회는 PREMIUM_L1 + VERIFIED_L1 보유자만 참가 (0084)
    if (t?.dupr_premium && !(profile?.dupr_status === 'verified' && profile?.dupr_premium && profile?.dupr_verified_l1)) {
      if (profile?.dupr_status !== 'verified') {
        Alert.alert(
          'DUPR+ 전용 대회예요',
          '이 대회는 DUPR+ 회원(PREMIUM + VERIFIED)만 참가할 수 있어요. 먼저 DUPR 계정을 연결해 주세요.',
          [
            { text: '나중에', style: 'cancel' },
            { text: 'DUPR 연결하기', onPress: () => router.push('/dupr-connect' as never) },
          ],
        );
      } else {
        Alert.alert('DUPR+ 자격 필요', 'DUPR+ 전용 대회는 PREMIUM 구독과 VERIFIED 자격이 모두 필요해요. DUPR 앱에서 구독·인증 상태를 확인해 주세요.');
      }
      return;
    }
    // DUPR 인증 대회는 연결(verified) + BASIC_L1(활성 회원)만 참가
    if (t?.dupr_certified && !(profile?.dupr_status === 'verified' && profile?.dupr_basic)) {
      if (profile?.dupr_status === 'verified' && !profile?.dupr_basic) {
        Alert.alert('DUPR 자격 필요', 'DUPR 계정이 활성(BASIC) 상태가 아니에요. DUPR 앱에서 계정 상태를 확인한 뒤 다시 시도해 주세요.');
        return;
      }
      Alert.alert(
        'DUPR 인증이 필요해요',
        'DUPR 인증 대회는 DUPR 계정을 연결한 선수만 참가할 수 있어요. 경기 결과가 DUPR 공식 레이팅에 반영됩니다.\n\n지금 바로 연결할까요? (DUPR 계정이 없으면 가입도 가능해요)',
        [
          { text: '나중에', style: 'cancel' },
          { text: 'DUPR 연결하기', onPress: () => router.push('/dupr-connect' as never) },
        ],
      );
      return;
    }
    const fee = t?.fee ?? 0;
    // 유료 대회인데 결제 설정이 없으면 신청을 막는다 (결제 없이 슬롯만 잡는 것 방지)
    if (fee > 0 && !slotsFull && !isTossConfigured) {
      Alert.alert('결제 준비 중', '참가비 결제 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    const partnerLine = isDoubles
      ? partnerSel
        ? `\n파트너: ${partnerSel.nickname}`
        : '\n파트너 미정 — 신청 후에도 등록할 수 있어요'
      : '';
    const feeLine = fee > 0 ? `\n참가비 ${fee.toLocaleString()}원 · 결제 완료 시 참가 확정` : '';
    Alert.alert(
      slotsFull ? '대기 신청' : '참가 신청',
      `${t?.title ?? '대회'}${partnerLine}${feeLine}\n${
        slotsFull
          ? `정원이 차서 대기열로 신청됩니다.${fee > 0 ? ' 자리가 나면 알림을 보내드리고, 24시간 안에 결제하면 확정돼요.' : ''}`
          : fee > 0
            ? '신청 후 바로 결제 화면으로 이동합니다.'
            : '이 대회에 참가 신청할까요? (신청 즉시 확정)'
      }`,
      [
        { text: '닫기', style: 'cancel' },
        { text: slotsFull ? '대기 신청' : fee > 0 ? '신청하고 결제' : '신청', onPress: apply },
      ],
    );
  }

  async function apply() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase.from('tournament_entries').insert({
      tournament_id: id,
      user_id: uid,
      partner_id: isDoubles ? partnerSel?.id ?? null : null,
      partner_name: isDoubles ? partnerSel?.nickname ?? null : null,
    });
    setActing(false);
    if (error) {
      Alert.alert('신청 실패', error.message);
      return;
    }
    // 유료 대회 & 정원 내(= 결제 대기 상태로 들어감)면 바로 결제로 이어간다
    if ((t?.fee ?? 0) > 0) {
      const { data: myRow } = await supabase
        .from('tournament_entries')
        .select('status')
        .eq('tournament_id', id)
        .eq('user_id', uid)
        .maybeSingle();
      if (myRow?.status === 'pending') {
        await load();
        startFeePayment();
        return;
      }
    }
    await show();
    await load();
    hide();
  }

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
    setPartnerSel(null);
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

  async function checkIn() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('tournament_entries')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('tournament_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('출전 신고 실패', error.message);
      return;
    }
    load();
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
      <View style={styles.headerArea}>
        <View style={styles.badgeRow}>
          <Badge label={TOURNAMENT_FORMAT_LABELS[t.format]} color="#2D6BD6" bg="rgba(56,132,255,0.14)" />
          <Badge label={t.discipline === 'doubles' ? '복식' : '단식'} color="#F5A623" bg="rgba(245,166,35,0.16)" />
          {t.dupr_certified ? <Badge label="DUPR 인증" color="#2D6BD6" bg="rgba(45,107,214,0.12)" /> : null}
          {t.dupr_premium ? <Badge label="DUPR+ 전용" color="#8B5CF6" bg="rgba(139,92,246,0.14)" /> : null}
          {t.status === 'registration' ? (
            <Badge label="접수중" />
          ) : (
            <Badge
              label={t.status === 'ongoing' ? '진행중' : t.status === 'finished' ? '종료' : '취소됨'}
              color="#60646C"
              bg="rgba(136,135,128,0.14)"
            />
          )}
        </View>
        <Text style={styles.title}>{t.title}</Text>
      </View>

      {showTabBar && (
        <View style={styles.tabBar}>
          {(isTeam ? teamTabItems : tabItems).map((it) => {
            const active = tab === it.key;
            return (
              <Pressable key={it.key} onPress={() => setTab(it.key)} style={styles.tabItem}>
                <Text style={[styles.tabText, { color: active ? '#16C784' : '#AAB4C0' }]}>{it.label}</Text>
                <View style={[styles.tabUnderline, { backgroundColor: active ? '#16C784' : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {tab !== 'info' && (approved.length > 0 || hasBracket) && (
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
        {tab === 'info' && (
          <>
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
            <View style={styles.infoCard}>
              <Info icon="time-outline" text={formatMeetupTime(t.start_at)} />
              {t.registration_deadline ? (
                <Info icon="hourglass-outline" text={`접수 마감 ${formatMeetupTime(t.registration_deadline)}`} />
              ) : null}
              <Info icon="location-outline" text={`${t.venue || '장소 미정'}${t.region ? ` · ${t.region}` : ''}`} />
              <Info icon="ribbon-outline" text={`실력 ${skillRangeLabel(t.skill_min, t.skill_max)}`} />
              <Info icon="people-outline" text={`정원 ${t.approved_count + t.pending_count}/${t.max_participants}${isDoubles ? '팀' : '명'}`} />
              <Info icon="cash-outline" text={t.fee > 0 ? `참가비 ${t.fee.toLocaleString()}원` : '참가비 무료'} />
            </View>

            {/* 내 현황 — 참가자 본인의 상태·조·전적·다음 경기를 한눈에 (0092 UX) */}
            {myEntry && !isTeam && (
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
                  ) : myEntry.status === 'waitlist' ? (
                    <View style={[styles.myBadge, { backgroundColor: 'rgba(96,165,250,0.16)' }]}>
                      <Text style={[styles.myBadgeTxt, { color: '#60A5FA' }]}>대기 {myWaitlistRank}번</Text>
                    </View>
                  ) : (
                    <View style={[styles.myBadge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                      <Text style={[styles.myBadgeTxt, { color: '#AAB4C0' }]}>{ENTRY_LABEL[myEntry.status]}</Text>
                    </View>
                  )}
                </View>

                {myEntry.status === 'pending' && t.fee > 0 && myEntry.payment_deadline ? (
                  <Text style={styles.myHint}>{formatMeetupTime(myEntry.payment_deadline)}까지 결제하면 참가가 확정돼요.</Text>
                ) : myEntry.status === 'waitlist' ? (
                  <Text style={styles.myHint}>자리가 나면 푸시로 알려드려요{t.fee > 0 ? ' (24시간 안에 결제 시 확정)' : ''}.</Text>
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
                        onPress={() => setTab(myNextMatch.phase === 'knockout' ? 'final' : 'prelim')}
                        style={styles.myNextRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.myStatLabel}>다음 경기</Text>
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
            )}

            {/* 복식 파트너 — 신청 전엔 선택(선택 사항), 신청 후엔 대진 생성 전까지 등록·변경·해제 (0090) */}
            {!isTeam && isDoubles && !iAmPartner && ((canRegister && !myEntry) || (!!myEntry && myEntry.status !== 'rejected' && !drawGenerated)) && (
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
                ) : !myEntry && partnerSel ? (
                  <View style={styles.partnerChip}>
                    <Avatar nickname={partnerSel.nickname} uri={partnerSel.avatar_url} size={36} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pName}>{partnerSel.nickname}</Text>
                      <Text style={styles.pMeta}>
                        {partnerSel.region || '지역 미설정'} · {partnerSel.skill_level.toFixed(1)} {skillLabel(partnerSel.skill_level)}
                      </Text>
                    </View>
                    <Text
                      onPress={() => {
                        setPartnerSel(null);
                        setPartnerQuery('');
                      }}
                      style={styles.partnerClear}>
                      변경
                    </Text>
                  </View>
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
                            onPress={() => (myEntry ? updatePartner(p) : setPartnerSel(p))}
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
            {drawGenerated && !drawRevealed && drawRevealAt && (
              <View style={styles.revealBox}>
                <Ionicons name="lock-closed-outline" size={20} color="#AAB4C0" />
                <Text style={styles.revealText}>조추첨은 {formatMeetupTime(drawRevealAt.toISOString())}에 공개돼요</Text>
              </View>
            )}

          </>
        )}

        {/* 참가자 탭 */}
        {!isTeam && tab === 'players' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              참가자 {q ? `${approvedShown.length}/${approved.length}` : approved.length}{isDoubles ? '팀' : '명'}
            </Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {approved.length === 0 ? (
                <Text style={styles.mutedText}>아직 확정된 참가자가 없어요.</Text>
              ) : approvedShown.length === 0 ? (
                <Text style={styles.mutedText}>검색 결과가 없어요.</Text>
              ) : (
                approvedShown.map((e) => (
                  <View key={e.user_id} style={styles.pRow}>
                    <Avatar nickname={e.profiles?.nickname ?? '?'} uri={e.profiles?.avatar_url} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pName}>
                        {e.profiles?.nickname ?? '알 수 없음'}
                        {isDoubles && (e.partner?.nickname ?? e.partner_name)
                          ? ` / ${e.partner?.nickname ?? e.partner_name}`
                          : ''}
                      </Text>
                      <Text style={styles.pMeta}>{e.profiles?.region || '지역 미설정'}</Text>
                    </View>
                    {e.profiles ? (
                      <Text style={styles.pSkill}>
                        {e.profiles.skill_level.toFixed(1)} {skillLabel(e.profiles.skill_level)}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        {/* 단체전: 참가 탭 */}
        {isTeam && tab === 'register' && <TeamRegister tournament={t} uid={uid} onChange={() => setTeamRev((v) => v + 1)} />}
        {/* 단체전: 대진 탭 */}
        {isTeam && tab === 'bracket' && <TeamBracketView tournamentId={t.id} refreshKey={teamRev} />}

        {/* 예선 (조별리그) */}
        {hasBracket && tab === 'prelim' && (
          <View style={styles.section}>
            {groupNos.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.groupTabRow}>
                {(['all', ...groupNos] as (number | 'all')[]).map((g) => {
                  const active = groupTab === g;
                  return (
                    <Pressable
                      key={String(g)}
                      onPress={() => setGroupTab(g)}
                      style={[styles.groupPill, active ? styles.groupPillActive : styles.groupPillIdle]}>
                      <Text style={[styles.groupPillText, { color: active ? '#fff' : '#AAB4C0' }]}>
                        {g === 'all' ? '전체' : `${g}조`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {(q ? groupNos : groupTab === 'all' ? groupNos : groupNos.filter((g) => g === groupTab)).map((gno) => {
              const gms = groupMatchesAll.filter((m) => (m.group_no ?? 1) === gno);
              const table = standings(groupMembers(gms), gms);
              const shownGms = q ? gms.filter(matchHit) : gms;
              if (q && shownGms.length === 0) return null;
              return (
                <View key={`g${gno}`} style={{ marginTop: 14 }}>
                  <Text style={styles.subLabel}>{gno}조 순위</Text>
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
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {shownGms.map((m) => (
                      <MatchRow key={m.id} m={m} nameOf={nameOf} uid={uid} courtLabel={courtLabelOf(m.court_id)} avatarOf={avatarOf} />
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* 본선 (토너먼트) */}
        {hasBracket && tab === 'final' && (
          <View style={styles.section}>
            {q ? <Text style={[styles.pMeta, { marginBottom: 6 }]}>검색어와 일치하는 선수를 강조 표시해요.</Text> : null}
            <BracketTree matches={koMatches} nameOf={nameOf} uid={uid} highlightQuery={q} avatarOf={avatarOf} />
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
            {/* 출전 신고 (승인 + 대회 당일) */}
            {myEntry.status === 'approved' &&
              isEventDay &&
              (checkedIn ? (
                <View style={styles.statusRow}>
                  <Ionicons name="checkmark-done-circle" size={18} color="#16C784" />
                  <Text style={[styles.statusText, { color: '#16C784' }]}>출전 신고 완료</Text>
                </View>
              ) : (
                <Button title="출전 신고" onPress={checkIn} loading={acting} />
              ))}
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
          <View style={{ gap: 8 }}>
            {isDoubles && !partnerSel ? (
              <View style={styles.statusRow}>
                <Ionicons name="people-outline" size={16} color="#AAB4C0" />
                <Text style={[styles.pMeta, { marginTop: 0 }]}>파트너 없이 신청하고 나중에 등록해도 돼요.</Text>
              </View>
            ) : null}
            <Button title={slotsFull ? '대기 신청하기' : '참가 신청하기'} onPress={confirmApply} loading={acting} />
          </View>
        ) : (
          <Button title="접수가 마감되었어요" variant="secondary" disabled onPress={() => {}} />
        )}
      </View>
      )}
    </SafeAreaView>
  );
}

function Info({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#16C784" />
      <Text style={styles.infoText}>{text}</Text>
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
}: {
  m: TournamentMatch;
  nameOf: (id: string | null) => string;
  uid: string | undefined;
  highlight?: boolean;
  courtLabel?: string;
  avatarOf?: (id: string | null) => { uri: string | null; nickname: string } | null;
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
        {courtLabel ? (
          <View style={styles.matchCourt}>
            <Text style={styles.matchCourtText}>🏟 {courtLabel}</Text>
          </View>
        ) : null}
        {!done && <Text style={styles.matchTag}>예정</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  notFound: { color: '#AAB4C0', fontSize: 15 },
  mutedText: { color: '#AAB4C0', fontSize: 14 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  headerArea: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.three, gap: 10 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.09)', paddingHorizontal: Spacing.four },
  tabItem: { marginRight: 22, paddingTop: 8, alignItems: 'center' },
  tabText: { fontSize: 15, fontWeight: '700' },
  tabUnderline: { height: 2.5, alignSelf: 'stretch', marginTop: 8, borderRadius: 2 },
  badgeRow: { flexDirection: 'row', gap: 6 },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5 },
  gallery: { marginBottom: Spacing.three, gap: 8 },
  cover: { width: '100%', height: 200, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#151D25' },
  thumbRow: { gap: 8, paddingVertical: 2 },
  thumb: { width: 64, height: 64, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#151D25', opacity: 0.6 },
  thumbActive: { opacity: 1, borderWidth: 2, borderColor: '#16C784' },
  infoCard: {
    backgroundColor: '#10161D',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', color: '#F8FAFC', flex: 1 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  desc: { fontSize: 15, lineHeight: 22, color: '#AAB4C0', marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  pMeta: { fontSize: 13, color: '#AAB4C0', marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', backgroundColor: '#070A0D' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  statusText: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  payDeadline: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', color: '#FBBF24' },
  // 내 현황 카드 (0092 UX)
  myCard: {
    marginTop: 12, padding: Spacing.three, borderRadius: 20, borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.06)', borderWidth: 1, borderColor: 'rgba(22,199,132,0.35)', gap: 10,
  },
  myHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  myTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  myBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  myBadgeTxt: { fontSize: 12, fontWeight: '900' },
  myHint: { color: '#AAB4C0', fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  myStatsRow: { flexDirection: 'row', gap: 8 },
  myStatBox: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', gap: 2,
  },
  myStatLabel: { color: '#707B87', fontSize: 11, fontWeight: '800' },
  myStatValue: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
  myNextRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.two, borderRadius: 14,
    borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  myNextName: { color: '#F8FAFC', fontSize: 15, fontWeight: '900', marginTop: 2 },
  partnerCard: {
    marginTop: Spacing.two,
    backgroundColor: 'rgba(22,199,132,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.28)',
    borderRadius: 16,
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
    borderRadius: 12,
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
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  courtWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  courtChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 999, paddingLeft: 12, paddingRight: 8, paddingVertical: 6 },
  courtName: { fontSize: 14, fontWeight: '700', color: '#F8FAFC' },
  courtTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  courtTagText: { fontSize: 12, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15, color: '#F8FAFC', paddingVertical: 0 },
  groupTabRow: { gap: 8, paddingBottom: 4 },
  groupPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  groupPillActive: { backgroundColor: '#16C784' },
  groupPillIdle: { backgroundColor: '#151D25' },
  groupPillText: { fontSize: 14, fontWeight: '700' },
  revealBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: 14, marginTop: Spacing.two },
  revealText: { fontSize: 15, fontWeight: '600', color: '#F8FAFC', flex: 1 },
  subLabel: { fontSize: 14, fontWeight: '700', color: '#AAB4C0', marginTop: 2 },
  subLabelPrimary: { fontSize: 14, fontWeight: '800', color: '#16C784', marginTop: 2 },
  tableCard: { backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 12, marginTop: 6, overflow: 'hidden' },
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
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  matchSide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  matchNameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  matchName: { flex: 1, fontSize: 14, color: '#F8FAFC' },
  matchScore: { fontSize: 15, fontWeight: '800', minWidth: 18, textAlign: 'right' },
  matchTag: { fontSize: 12, fontWeight: '600', color: '#AAB4C0' },
  matchCourt: { backgroundColor: '#151D25', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  matchCourtText: { fontSize: 11, fontWeight: '700', color: '#AAB4C0' },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 12,
    padding: 8,
  },
});
