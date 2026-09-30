import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { ClubSession, ClubSessionSchedule, PartnerProfile } from '@/lib/types';
import { useClubAccess } from '@/lib/use-club-access';

type PlayerRow = { session_id: string; user_id: string; status: 'in' | 'out'; profiles: PartnerProfile | null };
type MatchRow = { session_id: string; status: 'scheduled' | 'ongoing' | 'done' };
const STATUS: Record<string, string> = { voting: '투표 중', matched: '대진 완료', ongoing: '진행 중', finished: '종료', canceled: '취소' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}
function timeLabel(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '시간 미정';
}
function deadlineLabel(deadline: string | null, nowMs: number) {
  if (!deadline) return '투표 진행 중';
  const diff = new Date(deadline).getTime() - nowMs;
  if (diff <= 0) return '투표 마감';
  const days = Math.ceil(diff / 86400000);
  return days <= 1 ? '오늘 투표 마감' : `투표 마감 D-${days}`;
}

export default function ClubSessions() {
  const router = useRouter();
  const navigation = useNavigation();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { uid, isPremiumUsable, canManage, isOwner, isApprovedMember, loading: accessLoading } = useClubAccess(clubId);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [schedule, setSchedule] = useState<ClubSessionSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!clubId) return;
    await supabase.rpc('generate_due_club_sessions', { p_club_id: clubId });
    const [{ data: sessionRows }, { data: scheduleRows }] = await Promise.all([
      supabase.from('club_sessions').select('*').eq('club_id', clubId).order('session_date', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('club_session_schedules').select('*').eq('club_id', clubId).eq('active', true).order('created_at', { ascending: true }).limit(1),
    ]);
    const nextSessions = (sessionRows as ClubSession[] | null) ?? [];
    const ids = nextSessions.map((item) => item.id);
    if (ids.length) {
      const [{ data: playerRows }, { data: matchRows }] = await Promise.all([
        supabase.from('club_session_players').select('session_id, user_id, status, profiles(id, nickname, skill_level, avatar_url, region)').in('session_id', ids).order('joined_at', { ascending: true }),
        supabase.from('club_session_matches').select('session_id, status').in('session_id', ids),
      ]);
      setPlayers((playerRows as unknown as PlayerRow[] | null) ?? []);
      setMatches((matchRows as MatchRow[] | null) ?? []);
    } else {
      setPlayers([]);
      setMatches([]);
    }
    setSessions(nextSessions);
    setSchedule(((scheduleRows as ClubSessionSchedule[] | null) ?? [])[0] ?? null);
    setLoading(false);
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useLayoutEffect(() => {
    navigation.setOptions({
      title: '정기모임',
      headerRight: isPremiumUsable && canManage ? () => (
        <Pressable accessibilityRole="button" accessibilityLabel="정기모임 개설" hitSlop={8} onPress={() => router.push({ pathname: '/club/session-create', params: { clubId } })} style={styles.headerButton}>
          <Ionicons name="add" size={27} color="#F8FAFC" />
        </Pressable>
      ) : undefined,
    });
  }, [canManage, clubId, isPremiumUsable, navigation, router]);

  const today = todayStr();
  const isPast = useCallback((item: ClubSession) => item.session_date < today || item.status === 'finished' || item.status === 'canceled', [today]);
  const upcoming = useMemo(() => sessions.filter((item) => !isPast(item)).sort((a, b) => a.session_date.localeCompare(b.session_date)), [isPast, sessions]);
  const past = useMemo(() => sessions.filter(isPast).sort((a, b) => b.session_date.localeCompare(a.session_date)), [isPast, sessions]);
  const featured = upcoming[0] ?? null;
  const featuredPlayers = featured ? players.filter((item) => item.session_id === featured.id) : [];
  const attending = featuredPlayers.filter((item) => item.status === 'in');
  const notAttending = featuredPlayers.filter((item) => item.status === 'out');
  const myVote = featuredPlayers.find((item) => item.user_id === uid)?.status ?? null;
  const votingOpen = !!featured && featured.status === 'voting' && (!featured.vote_deadline || new Date(featured.vote_deadline).getTime() > nowMs);

  async function vote(status: 'in' | 'out') {
    if (!uid || !featured || (!isApprovedMember && !isOwner)) return;
    if (!votingOpen) { Alert.alert('투표 마감', '투표가 마감됐어요. 명단 변경은 운영진에게 문의하세요.'); return; }
    setBusy(true);
    const { error } = await supabase.from('club_session_players').upsert({ session_id: featured.id, user_id: uid, status }, { onConflict: 'session_id,user_id' });
    setBusy(false);
    if (error) { Alert.alert('투표 실패', error.message); return; }
    load();
  }

  if (loading || accessLoading) return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  if (!isPremiumUsable) return (
    <View style={styles.center}>
      <Ionicons name="lock-closed-outline" size={38} color="#707B87" />
      <Text style={styles.lockTitle}>프리미엄 클럽 전용 기능이에요</Text>
      <Text style={styles.lockBody}>참석 투표부터 자동 대진과 경기 기록까지 한곳에서 운영할 수 있어요.</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {featured ? (
          <View style={styles.featuredCard}>
            <Pressable onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: featured.id } })} style={styles.featuredTop}>
              <View style={styles.featuredInfo}>
                <InfoLine icon="calendar-outline" text={dateLabel(featured.session_date)} large />
                <InfoLine icon="time-outline" text={timeLabel(featured.start_at)} />
                <InfoLine icon="location" text={featured.location || '장소 미정'} />
              </View>
              <View style={styles.statusArea}><View style={styles.statusChip}><Text style={styles.statusText}>{STATUS[featured.status]}</Text></View><Text style={styles.deadline}>{deadlineLabel(featured.vote_deadline, nowMs)}</Text></View>
            </Pressable>
            <View style={styles.attendanceRow}>
              <View style={styles.avatarStack}>
                {attending.slice(0, 4).map((item, index) => <View key={item.user_id} style={[styles.avatarSlot, { marginLeft: index ? -9 : 0, zIndex: 5 - index }]}><Avatar nickname={item.profiles?.nickname} uri={item.profiles?.avatar_url} size={34} /></View>)}
                {attending.length > 4 ? <View style={styles.avatarMore}><Text style={styles.avatarMoreText}>+{attending.length - 4}</Text></View> : null}
              </View>
              <Text style={styles.attendanceText}>참석 {attending.length}명 · 불참 {notAttending.length}명</Text>
              <View style={styles.courtInfo}><Ionicons name="grid-outline" size={17} color="#AAB4C0" /><Text style={styles.courtText}>코트 {featured.court_count}면</Text></View>
            </View>
            {isApprovedMember || isOwner ? <View style={styles.voteRow}>
              <Pressable disabled={busy} onPress={() => vote('in')} style={[styles.voteButton, myVote === 'in' && styles.voteButtonActive]}><Ionicons name="checkmark-circle" size={20} color={myVote === 'in' ? '#07100D' : '#AAB4C0'} /><Text style={[styles.voteText, myVote === 'in' && styles.voteTextActive]}>참석할게요</Text></Pressable>
              <Pressable disabled={busy} onPress={() => vote('out')} style={[styles.voteButton, styles.voteButtonOut, myVote === 'out' && styles.voteButtonOutActive]}><Ionicons name="close" size={21} color="#F8FAFC" /><Text style={styles.voteText}>불참</Text></Pressable>
            </View> : null}
          </View>
        ) : <View style={styles.emptyBox}><Ionicons name="calendar-outline" size={24} color="#707B87" /><View style={{ flex: 1 }}><Text style={styles.emptyTitle}>예정된 정기모임이 없어요</Text><Text style={styles.emptyText}>새 모임이 열리면 여기에서 참석 여부를 선택할 수 있어요.</Text></View></View>}

        {isOwner ? <Pressable onPress={() => router.push({ pathname: '/club/session-schedule', params: { clubId } })} style={styles.repeatCard}>
          <Ionicons name="repeat" size={20} color={schedule ? '#F8FAFC' : '#16C784'} />
          <Text style={styles.repeatTitle}>{schedule ? `매주 ${WEEKDAYS[schedule.weekday]}요일 ${schedule.start_time.slice(0, 5)}` : '반복 일정 설정'}</Text>
          {schedule ? <View style={styles.repeatManage}><Ionicons name="settings-outline" size={18} color="#AAB4C0" /><Text style={styles.repeatManageText}>반복 일정 관리</Text></View> : null}<Ionicons name="chevron-forward" size={16} color="#707B87" />
        </Pressable> : null}

        <View style={styles.section}><Text style={styles.sectionTitle}>예정된 모임</Text>
          {upcoming.slice(featured ? 1 : 0).length ? upcoming.slice(featured ? 1 : 0).map((item) => <SessionCard key={item.id} session={item} onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: item.id } })} />) : <Text style={styles.sectionEmpty}>추가로 예정된 모임이 없어요.</Text>}
        </View>
        {past.length ? <View style={styles.section}><Text style={styles.sectionTitle}>지난 모임</Text>{past.slice(0, 4).map((item) => <PastSessionCard key={item.id} session={item} joined={players.filter((p) => p.session_id === item.id && p.status === 'in').length} done={matches.filter((m) => m.session_id === item.id && m.status === 'done').length} onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: item.id } })} />)}</View> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoLine({ icon, text, large }: { icon: keyof typeof Ionicons.glyphMap; text: string; large?: boolean }) {
  return <View style={styles.infoLine}><Ionicons name={icon} size={large ? 20 : 18} color="#DCE3EA" /><Text style={[styles.infoText, large && styles.infoTextLarge]}>{text}</Text></View>;
}
function SessionCard({ session, onPress }: { session: ClubSession; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.listCard}><View style={styles.listIcon}><Ionicons name="calendar-outline" size={19} color="#DCE3EA" /></View><View style={{ flex: 1 }}><Text style={styles.listTitle}>{dateLabel(session.session_date)} · {timeLabel(session.start_at)}</Text><Text style={styles.listMeta}>{session.location || '장소 미정'}</Text></View><View style={styles.secondaryChip}><Text style={styles.secondaryChipText}>{STATUS[session.status]}</Text></View><Ionicons name="chevron-forward" size={17} color="#707B87" /></Pressable>;
}
function PastSessionCard({ session, joined, done, onPress }: { session: ClubSession; joined: number; done: number; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.listCard}><View style={styles.listIcon}><Ionicons name="calendar-outline" size={19} color="#DCE3EA" /></View><View style={{ flex: 1 }}><Text style={styles.listTitle}>{dateLabel(session.session_date)}</Text><Text style={styles.listMeta}>참가 {joined}명 · {done}경기 완료</Text></View><Text style={styles.resultLink}>결과 보기</Text><Ionicons name="chevron-forward" size={17} color="#707B87" /></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: Spacing.four, backgroundColor: '#070A0D' },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  lockTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '900', marginTop: 5 }, lockBody: { color: '#AAB4C0', fontSize: 13, lineHeight: 19, fontWeight: '600', textAlign: 'center' },
  featuredCard: { gap: 15, padding: Spacing.three, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  featuredTop: { flexDirection: 'row', gap: 12 }, featuredInfo: { flex: 1, gap: 9 }, infoLine: { flexDirection: 'row', alignItems: 'center', gap: 10 }, infoText: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' }, infoTextLarge: { fontSize: 20, fontWeight: '900' },
  statusArea: { alignItems: 'flex-end', gap: 10 }, statusChip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 17, backgroundColor: 'rgba(22,199,132,0.14)', borderWidth: 1, borderColor: '#16C784' }, statusText: { color: '#16C784', fontSize: 13, fontWeight: '900' }, deadline: { color: '#AAB4C0', fontSize: 12, fontWeight: '800' },
  attendanceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)' }, avatarStack: { minWidth: 36, flexDirection: 'row', alignItems: 'center' }, avatarSlot: { width: 34 }, avatarMore: { width: 34, height: 34, marginLeft: -9, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#182129', borderWidth: 2, borderColor: '#AAB4C0' }, avatarMoreText: { color: '#F8FAFC', fontSize: 10, fontWeight: '900' }, attendanceText: { flex: 1, color: '#F8FAFC', fontSize: 12, fontWeight: '800' }, courtInfo: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.09)' }, courtText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  voteRow: { flexDirection: 'row', gap: 8 }, voteButton: { minHeight: 50, flex: 1.7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#151D25', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, voteButtonActive: { backgroundColor: '#16C784', borderColor: '#16C784' }, voteButtonOut: { flex: 1 }, voteButtonOutActive: { backgroundColor: '#27313B', borderColor: '#AAB4C0' }, voteText: { color: '#F8FAFC', fontSize: 14, fontWeight: '900' }, voteTextActive: { color: '#07100D' },
  repeatCard: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.three, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, repeatTitle: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '900' }, repeatManage: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.09)' }, repeatManageText: { color: '#AAB4C0', fontSize: 12, fontWeight: '700' },
  section: { gap: 10, marginTop: Spacing.two }, sectionTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' }, sectionEmpty: { color: '#707B87', fontSize: 13, fontWeight: '600', paddingVertical: 8 },
  emptyBox: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 12, padding: Spacing.three, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, emptyTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' }, emptyText: { color: '#AAB4C0', fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 4 },
  listCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, listIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151D25' }, listTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '900' }, listMeta: { color: '#AAB4C0', fontSize: 12, fontWeight: '600', marginTop: 5 }, secondaryChip: { minHeight: 28, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 14, backgroundColor: '#182129', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }, secondaryChipText: { color: '#AAB4C0', fontSize: 11, fontWeight: '800' }, resultLink: { color: '#16C784', fontSize: 12, fontWeight: '900' },
});
