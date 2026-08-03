import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { submitMatchToDupr } from '@/lib/dupr';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { MeetupMatch } from '@/lib/types';

type Part = { user_id: string; nickname: string; avatar_url: string | null; connected: boolean };
type Side = 'A' | 'B' | null;

export default function RecordMeetupMatch() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();

  const [title, setTitle] = useState('');
  const [parts, setParts] = useState<Part[]>([]);
  const [past, setPast] = useState<MeetupMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const [format, setFormat] = useState<'doubles' | 'singles'>('doubles');
  const [side, setSide] = useState<Record<string, Side>>({});
  const [games, setGames] = useState<{ a: string; b: string }[]>([{ a: '', b: '' }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: m }, { data: p }, { data: mm }] = await Promise.all([
      supabase.from('meetups').select('title, host_id').eq('id', id).maybeSingle(),
      supabase
        .from('meetup_participants')
        .select('user_id, status, profiles(id, nickname, avatar_url, dupr_status)')
        .eq('meetup_id', id)
        .eq('status', 'approved'),
      supabase.from('meetup_matches').select('*').eq('meetup_id', id).order('created_at', { ascending: false }),
    ]);
    setTitle(m?.title ?? '');
    // deno/ts: 조인 결과 프로필
    const list: Part[] = ((p as unknown as { user_id: string; profiles: { nickname: string; avatar_url: string | null; dupr_status: string } | null }[]) ?? []).map((r) => ({
      user_id: r.user_id,
      nickname: r.profiles?.nickname ?? '알 수 없음',
      avatar_url: r.profiles?.avatar_url ?? null,
      connected: r.profiles?.dupr_status === 'verified',
    }));
    setParts(list);
    setPast((mm as MeetupMatch[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const perTeam = format === 'doubles' ? 2 : 1;
  const teamA = parts.filter((p) => side[p.user_id] === 'A');
  const teamB = parts.filter((p) => side[p.user_id] === 'B');

  function assign(userId: string, next: Side) {
    setSide((prev) => {
      const cur = prev[userId] ?? null;
      const target = cur === next ? null : next;
      if (target && (target === 'A' ? teamA : teamB).length >= perTeam && cur !== target) {
        Alert.alert('인원 초과', `${format === 'doubles' ? '복식은 팀당 2명' : '단식은 팀당 1명'}까지예요.`);
        return prev;
      }
      return { ...prev, [userId]: target };
    });
  }

  function setGame(i: number, key: 'a' | 'b', v: string) {
    setGames((g) => g.map((row, idx) => (idx === i ? { ...row, [key]: v.replace(/[^0-9]/g, '').slice(0, 2) } : row)));
  }
  function addGame() {
    if (games.length >= 5) return;
    setGames((g) => [...g, { a: '', b: '' }]);
  }
  function removeGame(i: number) {
    setGames((g) => (g.length <= 1 ? g : g.filter((_, idx) => idx !== i)));
  }

  async function onSubmit() {
    if (!id || !session?.user.id) return;
    if (teamA.length !== perTeam || teamB.length !== perTeam) {
      Alert.alert('선수 선택', `양 팀 각 ${perTeam}명씩 선택해주세요.`);
      return;
    }
    const gameRows = games
      .map((g) => ({ a: parseInt(g.a, 10), b: parseInt(g.b, 10) }))
      .filter((g) => Number.isFinite(g.a) && Number.isFinite(g.b));
    if (gameRows.length === 0) {
      Alert.alert('점수 입력', '최소 한 게임의 점수를 입력해주세요.');
      return;
    }
    const notConnected = [...teamA, ...teamB].filter((p) => !p.connected);
    if (notConnected.length > 0) {
      Alert.alert('DUPR 미연결', `${notConnected.map((p) => p.nickname).join(', ')} 님은 DUPR 연결이 안 돼 등록할 수 없어요.`);
      return;
    }
    setSaving(true);
    // 1) 경기기록 저장 (RLS: 호스트만)
    const { data: row, error } = await supabase
      .from('meetup_matches')
      .insert({
        meetup_id: id,
        format,
        a1: teamA[0].user_id,
        a2: teamA[1]?.user_id ?? null,
        b1: teamB[0].user_id,
        b2: teamB[1]?.user_id ?? null,
        games: gameRows,
        recorded_by: session.user.id,
      })
      .select('id')
      .single();
    if (error || !row) {
      setSaving(false);
      Alert.alert('저장 실패', error?.message ?? '다시 시도해주세요.');
      return;
    }
    // 2) DUPR 등록
    const res = await submitMatchToDupr({
      source: 'meetup',
      match_id: row.id,
      format,
      teamA: { p1: teamA[0].user_id, p2: teamA[1]?.user_id },
      teamB: { p1: teamB[0].user_id, p2: teamB[1]?.user_id },
      games: gameRows,
      event: title,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('DUPR 등록 실패', res.error === 'players_not_connected' ? '연결 안 된 선수가 있어요.' : (res.error ?? '잠시 후 다시 시도해주세요.') + '\n(경기 기록은 저장됐어요)');
    } else {
      Alert.alert('등록 완료', 'DUPR에 경기가 등록됐어요. 레이팅 반영 후 그래프에 표시됩니다.');
    }
    // 초기화 + 새로고침
    setSide({});
    setGames([{ a: '', b: '' }]);
    load();
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 형식 */}
          <View style={styles.card}>
            <Text style={styles.label}>경기 형식</Text>
            <View style={styles.segRow}>
              {(['doubles', 'singles'] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => {
                    setFormat(f);
                    setSide({});
                  }}
                  style={[styles.seg, format === f && styles.segActive]}>
                  <Text style={[styles.segText, format === f && styles.segTextActive]}>{f === 'doubles' ? '복식' : '단식'}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 선수 배정 */}
          <View style={styles.card}>
            <Text style={styles.label}>선수 선택 (팀당 {perTeam}명)</Text>
            <Text style={styles.hint}>참가자를 A팀 / B팀에 배정하세요. DUPR 미연결 회원은 등록 불가.</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {parts.map((p) => {
                const s = side[p.user_id] ?? null;
                return (
                  <View key={p.user_id} style={styles.pRow}>
                    <Avatar nickname={p.nickname} uri={p.avatar_url} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pName}>{p.nickname}</Text>
                      <Text style={[styles.pTag, { color: p.connected ? '#16A34A' : '#9CA3AF' }]}>
                        {p.connected ? 'DUPR 연결됨' : 'DUPR 미연결'}
                      </Text>
                    </View>
                    {(['A', 'B'] as const).map((t) => (
                      <Pressable
                        key={t}
                        disabled={!p.connected}
                        onPress={() => assign(p.user_id, t)}
                        style={[styles.teamBtn, s === t && (t === 'A' ? styles.teamA : styles.teamB), !p.connected && { opacity: 0.4 }]}>
                        <Text style={[styles.teamBtnText, s === t && { color: '#fff' }]}>{t}</Text>
                      </Pressable>
                    ))}
                  </View>
                );
              })}
              {parts.length === 0 ? <Text style={styles.hint}>승인된 참가자가 없어요.</Text> : null}
            </View>
            <Text style={styles.vs}>
              A: {teamA.map((p) => p.nickname).join(', ') || '—'}  vs  B: {teamB.map((p) => p.nickname).join(', ') || '—'}
            </Text>
          </View>

          {/* 점수 */}
          <View style={styles.card}>
            <Text style={styles.label}>게임 점수 (A : B)</Text>
            <View style={{ gap: 8, marginTop: 8 }}>
              {games.map((g, i) => (
                <View key={i} style={styles.gameRow}>
                  <Text style={styles.gameNo}>{i + 1}게임</Text>
                  <TextInput style={styles.scoreInput} value={g.a} onChangeText={(v) => setGame(i, 'a', v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="#C4C7CC" />
                  <Text style={styles.colon}>:</Text>
                  <TextInput style={styles.scoreInput} value={g.b} onChangeText={(v) => setGame(i, 'b', v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="#C4C7CC" />
                  {games.length > 1 ? (
                    <Pressable onPress={() => removeGame(i)} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color="#D1D5DB" />
                    </Pressable>
                  ) : (
                    <View style={{ width: 22 }} />
                  )}
                </View>
              ))}
            </View>
            {games.length < 5 ? (
              <Pressable onPress={addGame} style={styles.addGame}>
                <Ionicons name="add" size={16} color="#16C784" />
                <Text style={styles.addGameText}>게임 추가</Text>
              </Pressable>
            ) : null}
          </View>

          {/* 기록된 경기 */}
          {past.length > 0 ? (
            <View style={styles.card}>
              <Text style={styles.label}>기록된 경기 {past.length}</Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                {past.map((m) => (
                  <View key={m.id} style={styles.pastRow}>
                    <Text style={styles.pastText}>
                      {m.format === 'doubles' ? '복식' : '단식'} · {m.games.map((g) => `${g.a}-${g.b}`).join(', ')}
                    </Text>
                    <Text style={[styles.pastStatus, statusStyle(m.dupr_status)]}>{statusLabel(m.dupr_status)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actionBar}>
          <Button title="경기 기록 + DUPR 등록" onPress={onSubmit} loading={saving} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function statusLabel(s: MeetupMatch['dupr_status']) {
  return s === 'submitted' ? 'DUPR 등록됨' : s === 'failed' ? '등록 실패' : s === 'skipped' ? '건너뜀' : '대기';
}
function statusStyle(s: MeetupMatch['dupr_status']) {
  if (s === 'submitted') return { color: '#16A34A' };
  if (s === 'failed') return { color: '#E5484D' };
  return { color: '#9CA3AF' };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F7F9' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 40 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', padding: Spacing.three },
  label: { fontSize: 15, fontWeight: '800', color: '#111827' },
  hint: { fontSize: 12.5, color: '#9CA3AF', marginTop: 4, lineHeight: 17 },
  segRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', backgroundColor: '#F3F4F6' },
  segActive: { backgroundColor: '#16C784' },
  segText: { fontSize: 14, fontWeight: '800', color: '#6B7280' },
  segTextActive: { color: '#fff' },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { fontSize: 14.5, fontWeight: '700', color: '#111827' },
  pTag: { fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  teamBtn: { width: 34, height: 34, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  teamA: { backgroundColor: '#16C784', borderColor: '#16C784' },
  teamB: { backgroundColor: '#2D6BD6', borderColor: '#2D6BD6' },
  teamBtnText: { fontSize: 14, fontWeight: '800', color: '#6B7280' },
  vs: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 10, textAlign: 'center' },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameNo: { fontSize: 13, fontWeight: '700', color: '#6B7280', width: 48 },
  scoreInput: { flex: 1, height: 46, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#111827' },
  colon: { fontSize: 18, fontWeight: '800', color: '#9CA3AF' },
  addGame: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 8 },
  addGameText: { fontSize: 14, fontWeight: '800', color: '#16C784' },
  pastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastText: { fontSize: 13.5, color: '#374151', flex: 1 },
  pastStatus: { fontSize: 12.5, fontWeight: '800' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#F6F7F9' },
});
