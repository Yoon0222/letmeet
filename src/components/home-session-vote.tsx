import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import type { ClubSession } from '@/lib/types';

type VoteSession = ClubSession & { clubs: { name: string } | null };

// 홈 화면 간편 참석 투표 — 내가 속한 클럽의 '투표 중' 정기모임을 카드로 노출.
export function HomeSessionVote() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [sessions, setSessions] = useState<VoteSession[]>([]);
  const [votes, setVotes] = useState<Map<string, 'in' | 'out'>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) {
      setSessions([]);
      return;
    }
    // 내가 승인된 클럽
    const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', uid).eq('status', 'approved');
    const clubIds = ((mem as { club_id: string }[] | null) ?? []).map((m) => m.club_id);
    if (clubIds.length === 0) {
      setSessions([]);
      return;
    }
    // 반복 스케줄로 도래한 회차 보충(내 클럽만) — cron 미설정이어도 홈에서 materialize
    await Promise.all(clubIds.map((id) => supabase.rpc('generate_due_club_sessions', { p_club_id: id })));
    const nowIso = new Date().toISOString();
    const { data: rows } = await supabase
      .from('club_sessions')
      .select('*, clubs(name)')
      .in('club_id', clubIds)
      .eq('status', 'voting')
      .or(`vote_deadline.is.null,vote_deadline.gt.${nowIso}`)
      .order('session_date', { ascending: true })
      .limit(5);
    const list = (rows as VoteSession[] | null) ?? [];
    setSessions(list);
    if (list.length > 0) {
      const { data: myVotes } = await supabase
        .from('club_session_players')
        .select('session_id, status')
        .eq('user_id', uid)
        .in('session_id', list.map((s) => s.id));
      setVotes(new Map(((myVotes as { session_id: string; status: 'in' | 'out' }[] | null) ?? []).map((v) => [v.session_id, v.status])));
    } else {
      setVotes(new Map());
    }
  }, [uid]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function vote(sessionId: string, status: 'in' | 'out') {
    if (!uid) return;
    setBusy(sessionId);
    // 낙관적 업데이트
    setVotes((prev) => new Map(prev).set(sessionId, status));
    const { error } = await supabase.from('club_session_players').upsert({ session_id: sessionId, user_id: uid, status }, { onConflict: 'session_id,user_id' });
    setBusy(null);
    if (error) load(); // 실패 시 원복
  }

  // 아직 투표 안 한 모임만 홈에 노출 (투표하면 홈에서 사라짐)
  const pending = sessions.filter((s) => !votes.has(s.id));
  if (pending.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Ionicons name="calendar" size={16} color="#16C784" />
        <Text style={styles.headerText}>참석 투표</Text>
      </View>
      <View style={{ gap: 10 }}>
        {pending.map((s) => {
          return (
            <View key={s.id} style={styles.card}>
              <Pressable onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: s.id } })} style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clubName} numberOfLines={1}>{s.clubs?.name ?? '클럽'}</Text>
                  <Text style={styles.title} numberOfLines={1}>{s.title || '정기모임'} · {s.session_date.replaceAll('-', '.')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#707B87" />
              </Pressable>
              <View style={styles.voteRow}>
                <Pressable onPress={() => vote(s.id, 'in')} disabled={busy === s.id} style={styles.voteBtn}>
                  <Ionicons name="checkmark-circle" size={16} color="#16C784" />
                  <Text style={styles.voteTxt}>참석</Text>
                </Pressable>
                <Pressable onPress={() => vote(s.id, 'out')} disabled={busy === s.id} style={styles.voteBtn}>
                  <Ionicons name="close-circle" size={16} color="#AAB4C0" />
                  <Text style={styles.voteTxt}>불참</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerText: { color: '#F8FAFC', fontSize: 17, fontWeight: '800' },
  card: { borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clubName: { color: '#16C784', fontSize: 12, fontWeight: '800' },
  title: { color: '#F8FAFC', fontSize: 15, fontWeight: '700', marginTop: 3 },
  voteRow: { flexDirection: 'row', gap: 8 },
  voteBtn: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#0B1116', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  inOn: { backgroundColor: '#16C784', borderColor: '#16C784' },
  outOn: { backgroundColor: '#3A2530', borderColor: '#7A3B4E' },
  voteTxt: { color: '#AAB4C0', fontSize: 14, fontWeight: '800' },
  voteTxtOn: { color: '#07100D' },
});
