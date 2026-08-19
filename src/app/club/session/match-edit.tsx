import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { ClubSession, ClubSessionMatch, PartnerProfile } from '@/lib/types';

type SlotKey = 't1p1' | 't1p2' | 't2p1' | 't2p2';
const SLOTS: { key: SlotKey; label: string; team: 1 | 2 }[] = [
  { key: 't1p1', label: 'A팀 선수 1', team: 1 },
  { key: 't1p2', label: 'A팀 선수 2', team: 1 },
  { key: 't2p1', label: 'B팀 선수 1', team: 2 },
  { key: 't2p2', label: 'B팀 선수 2', team: 2 },
];

export default function MatchEdit() {
  const router = useRouter();
  const { sessionId, matchId } = useLocalSearchParams<{ sessionId: string; matchId?: string }>();
  const editing = !!matchId;

  const [session, setSession] = useState<ClubSession | null>(null);
  const [attendees, setAttendees] = useState<PartnerProfile[]>([]);
  const [round, setRound] = useState(1);
  const [court, setCourt] = useState(1);
  const [slots, setSlots] = useState<Record<SlotKey, string | null>>({ t1p1: null, t1p2: null, t2p1: null, t2p2: null });
  const [active, setActive] = useState<SlotKey>('t1p1');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      const { data: s } = await supabase.from('club_sessions').select('*').eq('id', sessionId).maybeSingle();
      const { data: pl } = await supabase
        .from('club_session_players')
        .select('user_id, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('session_id', sessionId)
        .eq('status', 'in');
      const list = ((pl as unknown as { profiles: PartnerProfile | null }[]) ?? []).map((r) => r.profiles).filter(Boolean) as PartnerProfile[];
      setSession(s as ClubSession | null);
      setAttendees(list);

      if (matchId) {
        const { data: m } = await supabase.from('club_session_matches').select('*').eq('id', matchId).maybeSingle();
        const match = m as ClubSessionMatch | null;
        if (match) {
          setRound(match.round_no);
          setCourt(match.court_no);
          setSlots({ t1p1: match.team1_player1, t1p2: match.team1_player2, t2p1: match.team2_player1, t2p2: match.team2_player2 });
        }
      } else {
        // 새 매치: 다음 라운드 기본값
        const { data: rows } = await supabase.from('club_session_matches').select('round_no').eq('session_id', sessionId).order('round_no', { ascending: false }).limit(1);
        const maxRound = (rows as { round_no: number }[] | null)?.[0]?.round_no ?? 0;
        setRound(Math.max(1, maxRound));
      }
      setLoading(false);
    })();
  }, [sessionId, matchId]);

  const profileMap = useMemo(() => new Map(attendees.map((a) => [a.id, a])), [attendees]);
  const usedIds = useMemo(() => new Set(Object.values(slots).filter(Boolean) as string[]), [slots]);

  function assign(pid: string) {
    setSlots((prev) => {
      const next = { ...prev };
      // 이미 다른 슬롯에 있으면 제거(중복 방지)
      (Object.keys(next) as SlotKey[]).forEach((k) => { if (next[k] === pid) next[k] = null; });
      next[active] = pid;
      return next;
    });
    // 다음 빈 슬롯으로 이동
    const order: SlotKey[] = ['t1p1', 't1p2', 't2p1', 't2p2'];
    const nextEmpty = order.find((k) => k !== active && !slots[k]);
    if (nextEmpty) setActive(nextEmpty);
  }
  function clearSlot(k: SlotKey) {
    setSlots((prev) => ({ ...prev, [k]: null }));
    setActive(k);
  }

  async function save() {
    if (!sessionId || !session) return;
    if (!slots.t1p1 || !slots.t2p1) { Alert.alert('선수 확인', '각 팀에 최소 1명(A팀 선수 1, B팀 선수 1)은 배정해야 해요.'); return; }
    setSaving(true);
    const payload = {
      round_no: round,
      court_no: court,
      team1_player1: slots.t1p1,
      team1_player2: slots.t1p2,
      team2_player1: slots.t2p1,
      team2_player2: slots.t2p2,
    };
    const { error } = editing
      ? await supabase.from('club_session_matches').update(payload).eq('id', matchId!)
      : await supabase.from('club_session_matches').insert({ session_id: sessionId, ...payload });
    // 수동으로 매치를 만들면 세션이 최소 'matched' 상태가 되게
    if (!error && !editing && session.status === 'voting') await supabase.from('club_sessions').update({ status: 'matched' }).eq('id', sessionId);
    setSaving(false);
    if (error) { Alert.alert('저장 실패', error.message); return; }
    router.back();
  }

  function confirmDelete() {
    if (!editing) return;
    Alert.alert('매치 삭제', '이 경기를 삭제할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('club_session_matches').delete().eq('id', matchId!);
          if (error) { Alert.alert('삭제 실패', error.message); return; }
          router.back();
        },
      },
    ]);
  }

  if (loading) return <View style={styles.center}><Text style={styles.dim}>불러오는 중…</Text></View>;
  if (!session) return <View style={styles.center}><Text style={styles.dim}>정기모임을 찾을 수 없어요.</Text></View>;

  const nameOf = (pid: string | null) => (pid ? profileMap.get(pid)?.nickname ?? '?' : '비어있음');

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <View style={styles.row}>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>라운드</Text>
          <Stepper value={`${round}R`} onMinus={() => setRound((v) => Math.max(1, v - 1))} onPlus={() => setRound((v) => Math.min(50, v + 1))} />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>코트</Text>
          <Stepper value={`${court}코트`} onMinus={() => setCourt((v) => Math.max(1, v - 1))} onPlus={() => setCourt((v) => Math.min(session.court_count, v + 1))} />
        </View>
      </View>

      <Text style={styles.label}>슬롯을 고르고 아래 선수를 눌러 배정하세요</Text>
      <View style={styles.slotGrid}>
        {SLOTS.map((s) => (
          <Pressable key={s.key} onPress={() => setActive(s.key)} style={[styles.slot, active === s.key && styles.slotActive, s.team === 2 && styles.slotTeam2]}>
            <Text style={styles.slotLabel}>{s.label}</Text>
            <Text style={[styles.slotName, !slots[s.key] && styles.slotEmpty]} numberOfLines={1}>{nameOf(slots[s.key])}</Text>
            {slots[s.key] ? (
              <Pressable onPress={() => clearSlot(s.key)} style={styles.slotClear} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#707B87" />
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>참석자 ({attendees.length}명)</Text>
      <View style={styles.chipWrap}>
        {attendees.map((a) => {
          const used = usedIds.has(a.id);
          return (
            <Pressable key={a.id} onPress={() => assign(a.id)} style={[styles.playerChip, used && styles.playerChipUsed]}>
              <Avatar nickname={a.nickname} uri={a.avatar_url} size={22} />
              <Text style={[styles.playerChipTxt, used && styles.playerChipTxtUsed]}>{a.nickname}</Text>
            </Pressable>
          );
        })}
        {attendees.length === 0 ? <Text style={styles.dim}>참석자가 없어요. 먼저 참석 명단을 구성하세요.</Text> : null}
      </View>

      <Button title={editing ? '매치 저장' : '매치 추가'} onPress={save} loading={saving} style={{ marginTop: Spacing.three }} />
      {editing ? (
        <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteTxt}>매치 삭제</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} style={styles.stepBtn}><Ionicons name="remove" size={20} color="#F8FAFC" /></Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.stepBtn}><Ionicons name="add" size={20} color="#F8FAFC" /></Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  dim: { color: '#AAB4C0', fontSize: 14 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  row: { flexDirection: 'row', gap: Spacing.three },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '700', color: '#AAB4C0', marginLeft: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: Spacing.two },
  stepBtn: { width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151D25' },
  stepVal: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slot: { width: '47%', flexGrow: 1, minHeight: 62, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  slotActive: { borderColor: '#16C784' },
  slotTeam2: { backgroundColor: '#12141D' },
  slotLabel: { color: '#707B87', fontSize: 11, fontWeight: '800' },
  slotName: { color: '#F8FAFC', fontSize: 15, fontWeight: '800', marginTop: 3 },
  slotEmpty: { color: '#4A535E' },
  slotClear: { position: 'absolute', right: 8, top: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4, paddingRight: 12, paddingVertical: 4, borderRadius: 999, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  playerChipUsed: { backgroundColor: 'rgba(22,199,132,0.14)', borderColor: 'rgba(22,199,132,0.3)' },
  playerChipTxt: { color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  playerChipTxtUsed: { color: '#16C784' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  deleteTxt: { color: '#F26D6D', fontSize: 14, fontWeight: '800' },
});
