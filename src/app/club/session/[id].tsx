import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppAlert as Alert } from '@/lib/feedback';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { americanoStandings, generateAmericano, sitOutCount } from '@/lib/americano';
import { submitMatchToDupr } from '@/lib/dupr';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubSession, ClubSessionMatch, PartnerProfile } from '@/lib/types';

type Attendee = { user_id: string; status: 'in' | 'out'; profile: PartnerProfile | null };

const STATUS_LABEL: Record<string, string> = {
  voting: '투표 중',
  matched: '대진 완료',
  ongoing: '진행 중',
  finished: '종료',
  canceled: '취소',
};

// 대진 오픈 시각: 정기모임 당일 00:01
function drawOpenAt(sessionDate: string): number {
  const d = new Date(`${sessionDate}T00:01:00`);
  return d.getTime();
}

export default function ClubSessionDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: auth } = useAuth();
  const uid = auth?.user.id;

  const [sess, setSess] = useState<ClubSession | null>(null);
  const [players, setPlayers] = useState<Attendee[]>([]);
  const [matches, setMatches] = useState<ClubSessionMatch[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, PartnerProfile>>(new Map());
  const [candidates, setCandidates] = useState<PartnerProfile[]>([]); // 아직 명단에 없는 승인 클럽원
  const [isManager, setIsManager] = useState(false);
  const [isMember, setIsMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    const { data: s } = await supabase.from('club_sessions').select('*').eq('id', id).maybeSingle();
    if (!s) {
      setSess(null);
      setLoading(false);
      return;
    }
    const session = s as ClubSession;
    const [{ data: pl }, { data: ms }, { data: club }, { data: mem }, { data: approved }] = await Promise.all([
      supabase.from('club_session_players').select('user_id, status, profiles(id, nickname, skill_level, avatar_url, region)').eq('session_id', id).order('joined_at', { ascending: true }),
      supabase.from('club_session_matches').select('*').eq('session_id', id).order('round_no', { ascending: true }).order('court_no', { ascending: true }),
      supabase.from('clubs').select('owner_id').eq('id', session.club_id).maybeSingle(),
      uid ? supabase.from('club_members').select('role, status').eq('club_id', session.club_id).eq('user_id', uid).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('club_members').select('user_id, profiles(id, nickname, skill_level, avatar_url, region)').eq('club_id', session.club_id).eq('status', 'approved'),
    ]);

    const attendees: Attendee[] = ((pl as unknown as { user_id: string; status: 'in' | 'out'; profiles: PartnerProfile | null }[]) ?? []).map((r) => ({
      user_id: r.user_id,
      status: r.status,
      profile: r.profiles,
    }));
    const map = new Map<string, PartnerProfile>();
    attendees.forEach((a) => a.profile && map.set(a.user_id, a.profile));
    const approvedRows = (approved as unknown as { user_id: string; profiles: PartnerProfile | null }[]) ?? [];
    approvedRows.forEach((r) => r.profiles && map.set(r.user_id, r.profiles));

    const owner = (club as { owner_id: string } | null)?.owner_id;
    const manager = owner === uid || ((mem as { role?: string; status?: string } | null)?.role === 'officer' && (mem as { status?: string } | null)?.status === 'approved');
    const member = !!mem && (mem as { status?: string }).status === 'approved';

    const attendeeIds = new Set(attendees.map((a) => a.user_id));
    setSess(session);
    setPlayers(attendees);
    setMatches((ms as ClubSessionMatch[] | null) ?? []);
    setProfileMap(map);
    setCandidates(approvedRows.filter((r) => !attendeeIds.has(r.user_id)).map((r) => r.profiles).filter(Boolean) as PartnerProfile[]);
    setIsManager(!!manager);
    setIsMember(!!member);
    setLoading(false);
  }, [id, uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useLayoutEffect(() => {
    navigation.setOptions({ title: sess?.title || '정기모임' });
  }, [navigation, sess]);

  const attending = useMemo(() => players.filter((p) => p.status === 'in'), [players]);
  const notAttending = useMemo(() => players.filter((p) => p.status === 'out'), [players]);
  const myVote = players.find((p) => p.user_id === uid)?.status ?? null;
  const votingOpen = !!sess && sess.status === 'voting' && (!sess.vote_deadline || new Date(sess.vote_deadline).getTime() > nowMs);
  const drawOpen = !!sess && nowMs >= drawOpenAt(sess.session_date);
  const standings = useMemo(() => americanoStandings(matches), [matches]);
  const rounds = useMemo(() => {
    const set = new Map<number, ClubSessionMatch[]>();
    matches.forEach((m) => { (set.get(m.round_no) ?? set.set(m.round_no, []).get(m.round_no)!).push(m); });
    return Array.from(set.entries()).sort((a, b) => a[0] - b[0]);
  }, [matches]);

  // ── 참석 투표(본인) ─────────────────────────────────────────────
  async function vote(status: 'in' | 'out') {
    if (!uid || !id) return;
    if (!votingOpen) {
      Alert.alert('투표 마감', '투표가 마감됐어요. 명단 변경은 임원에게 문의하세요.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('club_session_players').upsert({ session_id: id, user_id: uid, status }, { onConflict: 'session_id,user_id' });
    setBusy(false);
    if (error) { Alert.alert('투표 실패', error.message); return; }
    load();
  }

  // ── 임원: 명단 조정 ─────────────────────────────────────────────
  async function addMember(userId: string) {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from('club_session_players').upsert({ session_id: id, user_id: userId, status: 'in' }, { onConflict: 'session_id,user_id' });
    setBusy(false);
    if (error) { Alert.alert('추가 실패', error.message); return; }
    load();
  }
  async function removeMember(userId: string) {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase.from('club_session_players').delete().eq('session_id', id).eq('user_id', userId);
    setBusy(false);
    if (error) { Alert.alert('제외 실패', error.message); return; }
    load();
  }

  // ── 대진 자동 생성(아메리카노) ───────────────────────────────────
  async function generate(roundCount: number) {
    if (!id || !sess) return;
    const ids = attending.map((a) => a.user_id);
    if (ids.length < 4) { Alert.alert('인원 부족', '대진을 만들려면 참석자가 최소 4명이어야 해요.'); return; }
    setBusy(true);
    const draw = generateAmericano(ids, sess.court_count, roundCount);
    // 기존 대진 삭제 후 재삽입
    await supabase.from('club_session_matches').delete().eq('session_id', id);
    const rows = draw.map((m) => ({
      session_id: id,
      round_no: m.round,
      court_no: m.court,
      team1_player1: m.team1[0],
      team1_player2: m.team1[1],
      team2_player1: m.team2[0],
      team2_player2: m.team2[1],
    }));
    const { error } = await supabase.from('club_session_matches').insert(rows);
    if (!error) await supabase.from('club_sessions').update({ status: 'matched' }).eq('id', id);
    setBusy(false);
    if (error) { Alert.alert('대진 생성 실패', error.message); return; }
    load();
  }

  function confirmGenerate() {
    if (!drawOpen) {
      Alert.alert('대진 오픈 전', `대진은 모임 당일(${sess?.session_date.replaceAll('-', '.')}) 0시부터 만들 수 있어요.`);
      return;
    }
    const n = attending.length;
    const suggest = Math.min(Math.max(4, n - 1), 12);
    const options = [Math.max(4, suggest - 2), suggest, suggest + 2].filter((v, i, a) => a.indexOf(v) === i);
    const duprDone = matches.filter((m) => m.dupr_status === 'submitted').length;
    const warn = matches.length
      ? `\n(기존 대진·점수는 지워져요)${duprDone ? `\n⚠️ 이미 DUPR에 등록된 ${duprDone}경기는 DUPR엔 남고 앱에선 사라져요.` : ''}`
      : '';
    Alert.alert(
      matches.length ? '대진 다시 생성' : '대진 생성',
      `참석 ${n}명 · 코트 ${sess?.court_count}면. 라운드 수를 고르세요.${warn}`,
      [
        ...options.map((r) => ({ text: `${r}라운드`, onPress: () => generate(r) })),
        { text: '닫기', style: 'cancel' as const },
      ],
    );
  }

  // 매치 참여 선수 또는 임원인가 (경기 시작·결과 입력 권한)
  const canPlay = useCallback(
    (m: ClubSessionMatch) => isManager || (!!uid && [m.team1_player1, m.team1_player2, m.team2_player1, m.team2_player2].includes(uid)),
    [isManager, uid],
  );

  // 경기 시작 전 모드 선택(DUPR/일반)
  function confirmStart(m: ClubSessionMatch) {
    if (!canPlay(m)) { Alert.alert('권한 없음', '경기에 참여한 선수 또는 임원만 시작할 수 있어요.'); return; }
    Alert.alert(
      '경기 시작',
      '이 경기를 어떤 모드로 진행할까요?\n· DUPR 모드: 결과가 공식 레이팅에 반영\n· 일반 모드: 친선(레이팅 미반영)',
      [
        { text: 'DUPR 모드', onPress: () => startMatch(m, true) },
        { text: '일반 모드', onPress: () => startMatch(m, false) },
        { text: '취소', style: 'cancel' },
      ],
    );
  }

  // ── 경기 시작(참여 플레이어/임원): scheduled → ongoing ──────────────
  async function startMatch(m: ClubSessionMatch, duprMode: boolean) {
    if (!canPlay(m)) return;
    setBusy(true);
    const { error } = await supabase.from('club_session_matches').update({ status: 'ongoing', dupr_mode: duprMode }).eq('id', m.id);
    // 첫 경기가 시작되면 세션도 진행 중으로
    if (!error && sess?.status === 'matched') await supabase.from('club_sessions').update({ status: 'ongoing' }).eq('id', sess.id);
    setBusy(false);
    if (error) { Alert.alert('시작 실패', error.message); return; }
    load();
  }

  // ── DUPR 일괄 등록(관리자): 완료됐고 아직 미등록인 경기 전부 ─────────
  async function registerAllToDupr() {
    if (!isManager) return;
    const targets = matches.filter((m) => m.status === 'done' && m.dupr_mode && m.dupr_status !== 'submitted');
    if (targets.length === 0) { Alert.alert('등록할 경기 없음', 'DUPR 모드로 완료된 미등록 경기가 없어요.'); return; }
    setBusy(true);
    let ok = 0;
    let notConnected = 0;
    let failed = 0;
    for (const m of targets) {
      const isDoubles = !!m.team1_player2 || !!m.team2_player2;
      const res = await submitMatchToDupr({
        source: 'club_session',
        match_id: m.id,
        format: isDoubles ? 'doubles' : 'singles',
        teamA: { p1: m.team1_player1, p2: m.team1_player2 ?? undefined },
        teamB: { p1: m.team2_player1, p2: m.team2_player2 ?? undefined },
        games: [{ a: m.team1_score, b: m.team2_score }],
        match_date: sess?.session_date,
      });
      if (res.ok) ok += 1;
      else if (res.error === 'players_not_connected') notConnected += 1;
      else failed += 1;
    }
    setBusy(false);
    const parts = [`${ok}경기 등록 완료`];
    if (notConnected) parts.push(`${notConnected}경기는 DUPR 미연결 선수 포함`);
    if (failed) parts.push(`${failed}경기 실패`);
    Alert.alert('DUPR 등록', parts.join('\n'));
    load();
  }

  // ── 결과 입력(참여 플레이어/임원) ────────────────────────────────
  function enterScore(m: ClubSessionMatch) {
    if (!canPlay(m)) { Alert.alert('권한 없음', '경기에 참여한 선수 또는 임원만 결과를 입력할 수 있어요.'); return; }
    router.push({ pathname: '/club/session/score', params: { matchId: m.id, target: String(sess?.point_target ?? 16) } });
  }

  const nameOf = (pid: string | null) => (pid ? profileMap.get(pid)?.nickname ?? '?' : '');

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }
  if (!sess) {
    return <View style={styles.center}><Text style={styles.dim}>정기모임을 찾을 수 없어요.</Text></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 헤더 */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <Text style={styles.hTitle}>{sess.title || '정기모임'}</Text>
            <Badge label={STATUS_LABEL[sess.status] ?? sess.status} color="#16C784" bg="rgba(22,199,132,0.14)" />
          </View>
          <View style={styles.metaRow}><Ionicons name="calendar-outline" size={15} color="#AAB4C0" /><Text style={styles.metaTxt}>{formatMeetupTime(sess.start_at ?? `${sess.session_date}T10:00:00`)}</Text></View>
          {sess.location ? <View style={styles.metaRow}><Ionicons name="location-outline" size={15} color="#AAB4C0" /><Text style={styles.metaTxt}>{sess.location}</Text></View> : null}
          <View style={styles.metaRow}><Ionicons name="tennisball-outline" size={15} color="#AAB4C0" /><Text style={styles.metaTxt}>코트 {sess.court_count}면 · {sess.point_target}점 · 참석 {attending.length}명</Text></View>
          {sess.vote_deadline ? (
            <View style={styles.metaRow}>
              <Ionicons name={votingOpen ? 'time-outline' : 'lock-closed-outline'} size={15} color={votingOpen ? '#16C784' : '#707B87'} />
              <Text style={[styles.metaTxt, { color: votingOpen ? '#16C784' : '#707B87' }]}>{votingOpen ? `투표 마감 ${formatMeetupTime(sess.vote_deadline)}` : '투표 마감됨'}</Text>
            </View>
          ) : null}
        </View>

        {/* 내 참석 투표 */}
        {isMember ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>내 참석</Text>
            <View style={styles.voteRow}>
              <Pressable onPress={() => vote('in')} disabled={busy} style={[styles.voteBtn, myVote === 'in' && styles.voteInOn]}>
                <Ionicons name="checkmark-circle" size={18} color={myVote === 'in' ? '#07100D' : '#16C784'} />
                <Text style={[styles.voteTxt, myVote === 'in' && styles.voteTxtOn]}>참석</Text>
              </Pressable>
              <Pressable onPress={() => vote('out')} disabled={busy} style={[styles.voteBtn, myVote === 'out' && styles.voteOutOn]}>
                <Ionicons name="close-circle" size={18} color={myVote === 'out' ? '#fff' : '#AAB4C0'} />
                <Text style={[styles.voteTxt, myVote === 'out' && { color: '#fff' }]}>불참</Text>
              </Pressable>
            </View>
            {!votingOpen ? <Text style={styles.dimSmall}>투표가 마감됐어요.</Text> : null}
          </View>
        ) : null}

        {/* 참석 현황 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>참석 현황</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusPillBig, styles.statInBg]}>
              <Ionicons name="checkmark-circle" size={15} color="#16C784" />
              <Text style={styles.statInTxt}>참석 {attending.length}</Text>
            </View>
            <View style={[styles.statusPillBig, styles.statOutBg]}>
              <Ionicons name="close-circle" size={15} color="#F26D6D" />
              <Text style={styles.statOutTxt}>불참 {notAttending.length}</Text>
            </View>
            <View style={[styles.statusPillBig, styles.statNoneBg]}>
              <Ionicons name="ellipse-outline" size={15} color="#AAB4C0" />
              <Text style={styles.statNoneTxt}>미투표 {candidates.length}</Text>
            </View>
          </View>

          <View style={{ gap: 8, marginTop: 12 }}>
            {attending.map((a) => (
              <View key={a.user_id} style={styles.mRow}>
                <Avatar nickname={a.profile?.nickname ?? '?'} uri={a.profile?.avatar_url} size={36} />
                <Text style={styles.mName}>{a.profile?.nickname ?? '알 수 없음'}</Text>
                <View style={styles.attendTag}><Text style={styles.attendTagTxt}>참석</Text></View>
                {isManager ? (
                  <Pressable onPress={() => removeMember(a.user_id)} style={styles.removeBtn}>
                    <Ionicons name="close" size={16} color="#AAB4C0" />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {notAttending.map((a) => (
              <View key={a.user_id} style={styles.mRow}>
                <Avatar nickname={a.profile?.nickname ?? '?'} uri={a.profile?.avatar_url} size={36} />
                <Text style={[styles.mName, styles.mNameOut]}>{a.profile?.nickname ?? '알 수 없음'}</Text>
                <View style={styles.absentTag}><Text style={styles.absentTagTxt}>불참</Text></View>
              </View>
            ))}
            {attending.length === 0 && notAttending.length === 0 ? <Text style={styles.dimSmall}>아직 투표한 사람이 없어요.</Text> : null}
          </View>

          {/* 임원: 명단에 없는 클럽원 추가 */}
          {isManager && candidates.length > 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={styles.subLabel}>클럽원 추가</Text>
              <View style={styles.chipWrap}>
                {candidates.map((c) => (
                  <Pressable key={c.id} onPress={() => addMember(c.id)} style={styles.addChip}>
                    <Ionicons name="add" size={14} color="#16C784" />
                    <Text style={styles.addChipTxt}>{c.nickname}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* 대진 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>대진</Text>
            {isManager ? (
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => router.push({ pathname: '/club/session/match-edit', params: { sessionId: sess.id } })}
                  disabled={busy}
                  style={styles.addMatchBtn}>
                  <Ionicons name="add" size={15} color="#16C784" />
                  <Text style={styles.addMatchTxt}>매치 추가</Text>
                </Pressable>
                <Pressable onPress={confirmGenerate} disabled={busy} style={styles.genBtn}>
                  <Ionicons name="shuffle" size={15} color="#07100D" />
                  <Text style={styles.genTxt}>{matches.length ? '다시 생성' : '자동 생성'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {isManager && !drawOpen ? (
            <View style={styles.lockedBox}>
              <Ionicons name="time-outline" size={18} color="#AAB4C0" />
              <Text style={styles.dim}>대진은 모임 당일({sess.session_date.replaceAll('-', '.')}) 0시부터 생성돼요.</Text>
            </View>
          ) : matches.length === 0 ? (
            <View style={styles.lockedBox}>
              <Ionicons name="shuffle-outline" size={18} color="#AAB4C0" />
              <Text style={styles.dim}>아직 대진이 없어요.</Text>
            </View>
          ) : (
            <View style={{ gap: 14, marginTop: 10 }}>
              {rounds.map(([roundNo, rms]) => (
                <View key={roundNo} style={{ gap: 8 }}>
                  <Text style={styles.roundLabel}>{roundNo}라운드</Text>
                  {rms.map((m) => {
                    const done = m.status === 'done';
                    const ongoing = m.status === 'ongoing';
                    const t1win = done && m.team1_score > m.team2_score;
                    const t2win = done && m.team2_score > m.team1_score;
                    const mine = canPlay(m);
                    return (
                      <View key={m.id} style={styles.matchCard}>
                        <View style={styles.matchHead}>
                          <Text style={styles.courtTag}>{m.court_no}코트</Text>
                          <View style={styles.matchHeadRight}>
                            {m.status !== 'scheduled' ? (
                              <View style={[styles.modeChip, m.dupr_mode ? styles.modeDupr : styles.modeCasual]}>
                                <Text style={[styles.modeChipTxt, m.dupr_mode ? styles.modeDuprTxt : styles.modeCasualTxt]}>{m.dupr_mode ? 'DUPR' : '일반'}</Text>
                              </View>
                            ) : null}
                            <View style={[styles.statusPill, done ? styles.pillDone : ongoing ? styles.pillLive : styles.pillWait]}>
                              {ongoing ? <View style={styles.liveDot} /> : null}
                              <Text style={[styles.statusPillTxt, done ? styles.pillDoneTxt : ongoing ? styles.pillLiveTxt : styles.pillWaitTxt]}>
                                {done ? '완료' : ongoing ? '진행 중' : '대기'}
                              </Text>
                            </View>
                            {isManager ? (
                              <Pressable onPress={() => router.push({ pathname: '/club/session/match-edit', params: { sessionId: sess.id, matchId: m.id } })} hitSlop={8}>
                                <Ionicons name="create-outline" size={16} color="#707B87" />
                              </Pressable>
                            ) : null}
                          </View>
                        </View>
                        <View style={styles.matchTeams}>
                          <Text style={[styles.teamTxt, t1win && styles.win]} numberOfLines={1}>{nameOf(m.team1_player1)} · {nameOf(m.team1_player2)}</Text>
                          <Text style={styles.score}>{done ? `${m.team1_score} : ${m.team2_score}` : 'vs'}</Text>
                          <Text style={[styles.teamTxt, t2win && styles.win, { textAlign: 'right' }]} numberOfLines={1}>{nameOf(m.team2_player1)} · {nameOf(m.team2_player2)}</Text>
                        </View>
                        {done && m.dupr_status === 'submitted' ? (
                          <View style={styles.duprTag}>
                            <Ionicons name="checkmark-circle" size={13} color="#16C784" />
                            <Text style={styles.duprTagTxt}>DUPR 반영됨</Text>
                          </View>
                        ) : null}
                        {mine && !done ? (
                          ongoing ? (
                            <Pressable onPress={() => enterScore(m)} disabled={busy} style={styles.resultBtn}>
                              <Ionicons name="create-outline" size={15} color="#07100D" />
                              <Text style={styles.resultBtnTxt}>결과 입력</Text>
                            </Pressable>
                          ) : (
                            <Pressable onPress={() => confirmStart(m)} disabled={busy} style={styles.startBtn}>
                              <Ionicons name="play" size={15} color="#07100D" />
                              <Text style={styles.startBtnTxt}>경기 시작</Text>
                            </Pressable>
                          )
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
              {sitOutCount(attending.length, sess.court_count) > 0 ? (
                <Text style={styles.dimSmall}>라운드마다 {sitOutCount(attending.length, sess.court_count)}명은 대기하며 순번이 돌아가요.</Text>
              ) : null}
              {isManager && matches.some((m) => m.status === 'done' && m.dupr_mode && m.dupr_status !== 'submitted') ? (
                <Pressable onPress={registerAllToDupr} disabled={busy} style={styles.duprBtn}>
                  {busy ? (
                    <ActivityIndicator size="small" color="#07100D" />
                  ) : (
                    <>
                      <Ionicons name="cloud-upload-outline" size={16} color="#07100D" />
                      <Text style={styles.duprBtnTxt}>
                        DUPR 일괄 등록 ({matches.filter((m) => m.status === 'done' && m.dupr_mode && m.dupr_status !== 'submitted').length}경기)
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {/* 순위 */}
        {standings.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>순위</Text>
            <View style={{ gap: 6, marginTop: 8 }}>
              {standings.map((s, i) => (
                <View key={s.userId} style={styles.standRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Avatar nickname={profileMap.get(s.userId)?.nickname ?? '?'} uri={profileMap.get(s.userId)?.avatar_url} size={30} />
                  <Text style={styles.standName}>{profileMap.get(s.userId)?.nickname ?? '?'}</Text>
                  <Text style={styles.standStat}>{s.wins}승 · {s.played}판</Text>
                  <Text style={styles.standPts}>{s.points}점</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  dim: { color: '#AAB4C0', fontSize: 14, flex: 1 },
  dimSmall: { color: '#707B87', fontSize: 12, fontWeight: '600' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  headerCard: { borderRadius: 20, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three, gap: 8 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  hTitle: { flex: 1, color: '#F8FAFC', fontSize: 19, fontWeight: '900' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt: { color: '#AAB4C0', fontSize: 13, fontWeight: '600' },
  section: { marginTop: Spacing.one },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  subLabel: { color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
  voteRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  voteBtn: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  voteInOn: { backgroundColor: '#16C784', borderColor: '#16C784' },
  voteOutOn: { backgroundColor: '#3A2530', borderColor: '#7A3B4E' },
  voteTxt: { color: '#AAB4C0', fontSize: 15, fontWeight: '800' },
  voteTxtOn: { color: '#07100D' },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mName: { flex: 1, color: '#F8FAFC', fontSize: 15, fontWeight: '700' },
  mNameOut: { color: '#AAB4C0' },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statusPillBig: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 40, borderRadius: 14, borderCurve: 'continuous' },
  statInBg: { backgroundColor: 'rgba(22,199,132,0.12)' },
  statInTxt: { color: '#16C784', fontSize: 14, fontWeight: '900' },
  statOutBg: { backgroundColor: 'rgba(242,109,109,0.12)' },
  statOutTxt: { color: '#F26D6D', fontSize: 14, fontWeight: '900' },
  statNoneBg: { backgroundColor: 'rgba(255,255,255,0.06)' },
  statNoneTxt: { color: '#AAB4C0', fontSize: 14, fontWeight: '900' },
  attendTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(22,199,132,0.14)' },
  attendTagTxt: { color: '#16C784', fontSize: 11, fontWeight: '800' },
  absentTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(242,109,109,0.14)' },
  absentTagTxt: { color: '#F26D6D', fontSize: 11, fontWeight: '800' },
  removeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#151D25' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(22,199,132,0.12)', borderWidth: 1, borderColor: 'rgba(22,199,132,0.25)' },
  addChipTxt: { color: '#16C784', fontSize: 13, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addMatchBtn: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 12, backgroundColor: 'rgba(22,199,132,0.12)', borderWidth: 1, borderColor: 'rgba(22,199,132,0.25)' },
  addMatchTxt: { color: '#16C784', fontSize: 13, fontWeight: '800' },
  genBtn: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#16C784', borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 12 },
  genTxt: { color: '#07100D', fontSize: 13, fontWeight: '900' },
  matchHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  modeDupr: { backgroundColor: 'rgba(22,199,132,0.16)' },
  modeCasual: { backgroundColor: 'rgba(255,255,255,0.07)' },
  modeChipTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.3 },
  modeDuprTxt: { color: '#16C784' },
  modeCasualTxt: { color: '#AAB4C0' },
  lockedBox: { marginTop: 10, minHeight: 60, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Spacing.three },
  roundLabel: { color: '#16C784', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  matchCard: { borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: Spacing.three, paddingVertical: 12, gap: 10 },
  matchHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  courtTag: { color: '#707B87', fontSize: 11, fontWeight: '800' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillWait: { backgroundColor: 'rgba(255,255,255,0.06)' },
  pillLive: { backgroundColor: 'rgba(22,199,132,0.16)' },
  pillDone: { backgroundColor: 'rgba(122,131,141,0.14)' },
  statusPillTxt: { fontSize: 11, fontWeight: '900' },
  pillWaitTxt: { color: '#AAB4C0' },
  pillLiveTxt: { color: '#16C784' },
  pillDoneTxt: { color: '#707B87' },
  liveDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: '#16C784' },
  startBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#16C784', borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 8 },
  startBtnTxt: { color: '#07100D', fontSize: 13, fontWeight: '900' },
  resultBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#9BE137', borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14, paddingVertical: 8 },
  resultBtnTxt: { color: '#07100D', fontSize: 13, fontWeight: '900' },
  duprTag: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  duprTagTxt: { color: '#16C784', fontSize: 11, fontWeight: '800' },
  duprBtn: { marginTop: 4, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16C784', borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 16 },
  duprBtnTxt: { color: '#07100D', fontSize: 14, fontWeight: '900' },
  matchTeams: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamTxt: { flex: 1, color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  win: { color: '#16C784' },
  score: { color: '#F8FAFC', fontSize: 14, fontWeight: '900', minWidth: 46, textAlign: 'center' },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rank: { width: 22, textAlign: 'center', color: '#16C784', fontSize: 15, fontWeight: '900' },
  standName: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  standStat: { color: '#707B87', fontSize: 12, fontWeight: '700' },
  standPts: { color: '#16C784', fontSize: 15, fontWeight: '900', minWidth: 48, textAlign: 'right' },
});
