import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
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
import { deleteMeetupMatch, submitMatchToDupr } from '@/lib/dupr';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { MatchChangeRequest, MeetupMatch } from '@/lib/types';

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
  const [editing, setEditing] = useState<MeetupMatch | null>(null); // 수정 중인 기존 경기(DUPR 미제출만 직접 수정 가능)

  // DUPR 등록된 경기는 직접 수정/삭제 불가(0085) → 운영자에게 요청
  const [pendingReqs, setPendingReqs] = useState<Record<string, MatchChangeRequest>>({});
  const [reqTarget, setReqTarget] = useState<MeetupMatch | null>(null);
  const [reqKind, setReqKind] = useState<'edit' | 'delete'>('edit');
  const [reqMsg, setReqMsg] = useState('');
  const [reqSending, setReqSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: m }, { data: p }, { data: mm }, { data: rq }] = await Promise.all([
      supabase.from('meetups').select('title, host_id').eq('id', id).maybeSingle(),
      supabase
        .from('meetup_participants')
        .select('user_id, status, profiles(id, nickname, avatar_url, dupr_status)')
        .eq('meetup_id', id)
        .eq('status', 'approved'),
      supabase.from('meetup_matches').select('*').eq('meetup_id', id).order('created_at', { ascending: false }),
      supabase.from('match_change_requests').select('*').eq('meetup_id', id).eq('status', 'pending'),
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
    const reqMap: Record<string, MatchChangeRequest> = {};
    ((rq as MatchChangeRequest[]) ?? []).forEach((r) => {
      reqMap[r.match_id] = r;
    });
    setPendingReqs(reqMap);
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
    // 1) 경기기록 저장 (RLS: 호스트만) — 수정 모드면 기존 행 update, 아니면 insert
    const fields = {
      format,
      a1: teamA[0].user_id,
      a2: teamA[1]?.user_id ?? null,
      b1: teamB[0].user_id,
      b2: teamB[1]?.user_id ?? null,
      games: gameRows,
    };
    let matchId: string | null = null;
    if (editing) {
      const { error } = await supabase.from('meetup_matches').update(fields).eq('id', editing.id);
      if (error) {
        setSaving(false);
        Alert.alert('저장 실패', error.message);
        return;
      }
      matchId = editing.id;
    } else {
      const { data: row, error } = await supabase
        .from('meetup_matches')
        .insert({ ...fields, meetup_id: id, recorded_by: session.user.id })
        .select('id')
        .single();
      if (error || !row) {
        setSaving(false);
        Alert.alert('저장 실패', error?.message ?? '다시 시도해주세요.');
        return;
      }
      matchId = row.id;
    }
    // 2) DUPR 등록/반영 — 이미 등록된 경기(match code 보유)면 서버가 match/update 로 처리
    const res = await submitMatchToDupr({
      source: 'meetup',
      match_id: matchId,
      format,
      teamA: { p1: teamA[0].user_id, p2: teamA[1]?.user_id },
      teamB: { p1: teamB[0].user_id, p2: teamB[1]?.user_id },
      games: gameRows,
      event: title,
    });
    setSaving(false);
    if (!res.ok) {
      Alert.alert('DUPR 등록 실패', res.error === 'players_not_connected' ? '연결 안 된 선수가 있어요.' : (res.error ?? '잠시 후 다시 시도해주세요.') + '\n(경기 기록은 저장됐어요)');
    } else if (editing) {
      Alert.alert('수정 완료', '경기 기록이 수정되고 DUPR에도 반영됐어요.');
    } else {
      Alert.alert('등록 완료', 'DUPR에 경기가 등록됐어요. 레이팅 반영 후 그래프에 표시됩니다.');
    }
    // 초기화 + 새로고침
    setEditing(null);
    setSide({});
    setGames([{ a: '', b: '' }]);
    load();
  }

  // 기존 경기를 폼에 불러와 수정 모드로 전환 — DUPR 미제출 경기만 (등록된 경기는 요청으로)
  function startEdit(m: MeetupMatch) {
    const map: Record<string, Side> = {};
    map[m.a1] = 'A';
    if (m.a2) map[m.a2] = 'A';
    map[m.b1] = 'B';
    if (m.b2) map[m.b2] = 'B';
    setEditing(m);
    setFormat(m.format);
    setSide(map);
    setGames(m.games.map((g) => ({ a: String(g.a), b: String(g.b) })));
  }

  function cancelEdit() {
    setEditing(null);
    setSide({});
    setGames([{ a: '', b: '' }]);
  }

  // DUPR 미제출 경기 직접 삭제 (등록된 경기는 요청으로)
  function confirmDelete(mId: string) {
    Alert.alert('경기 삭제', '이 경기 기록을 삭제할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteMeetupMatch(mId);
          if (!res.ok) Alert.alert('삭제 실패', res.error ?? '다시 시도해주세요.');
          load();
        },
      },
    ]);
  }

  // DUPR 등록된 경기: 운영자에게 수정/삭제 요청 (0085)
  function openRequest(m: MeetupMatch, kind: 'edit' | 'delete') {
    setReqTarget(m);
    setReqKind(kind);
    setReqMsg('');
  }

  async function sendRequest() {
    if (!reqTarget || !id || !session?.user.id) return;
    if (reqKind === 'edit' && !reqMsg.trim()) {
      Alert.alert('내용 입력', '어떻게 수정할지 적어주세요. (예: 2게임 11-9 → 11-7)');
      return;
    }
    setReqSending(true);
    const { error } = await supabase.from('match_change_requests').insert({
      source: 'meetup',
      match_id: reqTarget.id,
      meetup_id: id,
      requester_id: session.user.id,
      kind: reqKind,
      message: reqMsg.trim(),
    });
    setReqSending(false);
    if (error) {
      Alert.alert('요청 실패', error.message);
      return;
    }
    setReqTarget(null);
    Alert.alert('요청 완료', 'DUPR에 등록된 경기라 운영자 확인 후 처리돼요. 처리되면 DUPR에도 반영됩니다.');
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
                  <TextInput style={styles.scoreInput} value={g.a} onChangeText={(v) => setGame(i, 'a', v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="#707B87" />
                  <Text style={styles.colon}>:</Text>
                  <TextInput style={styles.scoreInput} value={g.b} onChangeText={(v) => setGame(i, 'b', v)} keyboardType="number-pad" placeholder="0" placeholderTextColor="#707B87" />
                  {games.length > 1 ? (
                    <Pressable onPress={() => removeGame(i)} hitSlop={8}>
                      <Ionicons name="close-circle" size={22} color="#707B87" />
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
                {past.map((m) => {
                  const submitted = m.dupr_status === 'submitted';
                  const pendingReq = pendingReqs[m.id];
                  return (
                    <View key={m.id} style={[styles.pastRow, editing?.id === m.id && styles.pastRowEditing]}>
                      <Text style={styles.pastText}>
                        {m.format === 'doubles' ? '복식' : '단식'} · {m.games.map((g) => `${g.a}-${g.b}`).join(', ')}
                      </Text>
                      <Text style={[styles.pastStatus, statusStyle(m.dupr_status)]}>{statusLabel(m.dupr_status)}</Text>
                      {submitted ? (
                        pendingReq ? (
                          // 요청 접수됨 — 운영자 처리 대기
                          <View style={styles.reqChip}>
                            <Text style={styles.reqChipText}>{pendingReq.kind === 'edit' ? '수정' : '삭제'} 요청중</Text>
                          </View>
                        ) : (
                          // DUPR 등록된 경기 → 직접 수정/삭제 대신 운영자 요청 (0085)
                          <>
                            <Pressable onPress={() => openRequest(m, 'edit')} hitSlop={8} style={{ marginLeft: 8 }}>
                              <Ionicons name="create-outline" size={18} color="#AAB4C0" />
                            </Pressable>
                            <Pressable onPress={() => openRequest(m, 'delete')} hitSlop={8} style={{ marginLeft: 8 }}>
                              <Ionicons name="trash-outline" size={18} color="#AAB4C0" />
                            </Pressable>
                          </>
                        )
                      ) : (
                        <>
                          <Pressable onPress={() => startEdit(m)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Ionicons name="create-outline" size={18} color="#16C784" />
                          </Pressable>
                          <Pressable onPress={() => confirmDelete(m.id)} hitSlop={8} style={{ marginLeft: 8 }}>
                            <Ionicons name="trash-outline" size={18} color="#E5484D" />
                          </Pressable>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.actionBar}>
          {editing ? (
            <View style={styles.editNotice}>
              <Ionicons name="create-outline" size={15} color="#16C784" />
              <Text style={styles.editNoticeText}>기록된 경기를 수정 중이에요 — 저장하면 DUPR에도 반영돼요.</Text>
              <Pressable onPress={cancelEdit} hitSlop={8}>
                <Text style={styles.editCancel}>취소</Text>
              </Pressable>
            </View>
          ) : null}
          <Button title={editing ? '경기 수정 + DUPR 반영' : '경기 기록 + DUPR 등록'} onPress={onSubmit} loading={saving} />
        </View>

        {/* DUPR 등록 경기 수정/삭제 요청 모달 (0085) */}
        <Modal visible={!!reqTarget} transparent animationType="slide" onRequestClose={() => setReqTarget(null)}>
          <View style={styles.reqModalWrap}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.reqModalCard}>
                <Text style={styles.reqModalTitle}>{reqKind === 'edit' ? '경기 수정 요청' : '경기 삭제 요청'}</Text>
                <Text style={styles.reqModalSub}>
                  DUPR에 등록된 경기는 레이팅에 영향을 줘서 직접 고칠 수 없어요. 운영자가 확인 후 처리하면 DUPR에도 반영됩니다.
                </Text>
                {reqTarget ? (
                  <Text style={styles.reqModalMatch}>
                    {reqTarget.format === 'doubles' ? '복식' : '단식'} · {reqTarget.games.map((g) => `${g.a}-${g.b}`).join(', ')}
                  </Text>
                ) : null}
                <TextInput
                  style={styles.reqModalInput}
                  placeholder={reqKind === 'edit' ? '어떻게 수정할지 적어주세요 (예: 2게임 11-9 → 11-7)' : '삭제 사유 (선택)'}
                  placeholderTextColor="#707B87"
                  value={reqMsg}
                  onChangeText={setReqMsg}
                  multiline
                  maxLength={300}
                  textAlignVertical="top"
                />
                <View style={styles.reqModalBtns}>
                  <Button title="닫기" variant="secondary" onPress={() => setReqTarget(null)} style={{ flex: 1 }} />
                  <Button title="요청 보내기" onPress={sendRequest} loading={reqSending} style={{ flex: 1 }} />
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
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
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 40 },
  card: { backgroundColor: '#10161D', borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three },
  label: { fontSize: 15, fontWeight: '800', color: '#F8FAFC' },
  hint: { fontSize: 12.5, color: '#707B87', marginTop: 4, lineHeight: 17 },
  segRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  seg: { flex: 1, paddingVertical: 12, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', backgroundColor: '#151D25' },
  segActive: { backgroundColor: '#16C784' },
  segText: { fontSize: 14, fontWeight: '800', color: '#AAB4C0' },
  segTextActive: { color: '#fff' },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pName: { fontSize: 14.5, fontWeight: '700', color: '#F8FAFC' },
  pTag: { fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  teamBtn: { width: 34, height: 34, borderRadius: 10, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#151D25', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  teamA: { backgroundColor: '#16C784', borderColor: '#16C784' },
  teamB: { backgroundColor: '#2D6BD6', borderColor: '#2D6BD6' },
  teamBtnText: { fontSize: 14, fontWeight: '800', color: '#AAB4C0' },
  vs: { fontSize: 13, fontWeight: '700', color: '#AAB4C0', marginTop: 10, textAlign: 'center' },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  gameNo: { fontSize: 13, fontWeight: '700', color: '#AAB4C0', width: 48 },
  scoreInput: { flex: 1, height: 46, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: '#10161D', textAlign: 'center', fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  colon: { fontSize: 18, fontWeight: '800', color: '#707B87' },
  addGame: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 10, paddingVertical: 8 },
  addGameText: { fontSize: 14, fontWeight: '800', color: '#16C784' },
  pastRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pastRowEditing: { backgroundColor: 'rgba(22,199,132,0.08)', borderRadius: 8, marginHorizontal: -6, paddingHorizontal: 6, paddingVertical: 4 },
  pastText: { fontSize: 13.5, color: '#AAB4C0', flex: 1 },
  pastStatus: { fontSize: 12.5, fontWeight: '800' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', backgroundColor: '#070A0D', gap: 10 },
  editNotice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editNoticeText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#AAB4C0' },
  editCancel: { fontSize: 13, fontWeight: '800', color: '#E5484D', paddingHorizontal: 4 },
  reqChip: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.14)' },
  reqChipText: { fontSize: 11.5, fontWeight: '800', color: '#F59E0B' },
  reqModalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  reqModalCard: {
    backgroundColor: '#10161D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.four,
    paddingBottom: Spacing.four + 12,
    gap: Spacing.two,
  },
  reqModalTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  reqModalSub: { fontSize: 13, lineHeight: 19, color: '#AAB4C0' },
  reqModalMatch: { fontSize: 13.5, fontWeight: '700', color: '#F8FAFC', backgroundColor: '#151D25', borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: 12, paddingVertical: 8 },
  reqModalInput: { minHeight: 84, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', backgroundColor: '#151D25', padding: 12, fontSize: 14.5, color: '#F8FAFC' },
  reqModalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
