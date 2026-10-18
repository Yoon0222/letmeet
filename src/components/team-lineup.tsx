import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';

import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { AppColors } from '@/theme';
import { supabase } from '@/lib/supabase';
import type { TieMatch, TournamentTeam, TournamentTeamWithMembers, TournamentTie } from '@/lib/types';

// 오더 싸움 — 주장이 우리 팀 라인업을 배정하고 '제출'하면 잠긴다.
// 양 팀 모두 제출해야 상대 오더가 공개된다(블라인드).
export function TeamLineup({
  team,
  tieId,
  onChange,
  onSubmitted,
}: {
  team: TournamentTeamWithMembers;
  tieId?: string;
  onChange?: () => void;
  onSubmitted?: () => void;
}) {
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [{ data: tm }, { data: ti }] = await Promise.all([
      supabase.from('tournament_teams').select('id, name').eq('tournament_id', team.tournament_id),
      supabase.from('tournament_ties').select('*').eq('tournament_id', team.tournament_id).or(`team1_id.eq.${team.id},team2_id.eq.${team.id}`),
    ]);
    setTeams((tm as TournamentTeam[]) ?? []);
    const list = (ti as TournamentTie[]) ?? [];
    setTies(list);
    if (list.length > 0) {
      const { data: sm } = await supabase.from('tie_matches').select('*').in('tie_id', list.map((x) => x.id)).order('slot', { ascending: true });
      const smList = (sm as TieMatch[]) ?? [];
      setSubs(smList);
      const init: Record<string, string[]> = {};
      for (const m of smList) {
        const tie = list.find((t) => t.id === m.tie_id);
        if (!tie) continue;
        init[m.id] = tie.team1_id === team.id ? m.team1_players : m.team2_players;
      }
      setSel(init);
    }
  }, [team.id, team.tournament_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const nameOf = (teamId: string | null) => teams.find((x) => x.id === teamId)?.name ?? '상대 팀';
  const memberName = (uid: string) => team.members.find((x) => x.user_id === uid)?.profiles?.nickname ?? '?';
  const activeTies = ties.filter((t) => t.team1_id && t.team2_id && t.status !== 'done' && (!tieId || t.id === tieId));
  if (activeTies.length === 0) return null;

  const need = (m: TieMatch) => (m.kind === 'singles' ? 1 : 2);

  function toggle(m: TieMatch, uid: string) {
    const usedInAnotherMatch = subs.some(
      (other) => other.tie_id === m.tie_id && other.id !== m.id && (sel[other.id] ?? []).includes(uid),
    );
    if (!(sel[m.id] ?? []).includes(uid) && usedInAnotherMatch) {
      Alert.alert('중복 배정 불가', `${memberName(uid)} 선수는 이미 다른 경기에 배정됐어요.`);
      return;
    }
    setSel((prev) => {
      const cur = prev[m.id] ?? [];
      if (cur.includes(uid)) return { ...prev, [m.id]: cur.filter((x) => x !== uid) };
      if (cur.length >= need(m)) return { ...prev, [m.id]: [...cur.slice(1), uid] };
      return { ...prev, [m.id]: [...cur, uid] };
    });
  }

  async function saveOne(tie: TournamentTie, m: TieMatch) {
    const players = sel[m.id] ?? [];
    if (players.length !== need(m)) {
      Alert.alert('선수 수 확인', `${m.kind === 'singles' ? '단식' : '복식'}은 ${need(m)}명을 선택해야 해요.`);
      return;
    }
    const duplicated = players.find((playerId) =>
      subs.some((other) => other.tie_id === tie.id && other.id !== m.id && (sel[other.id] ?? []).includes(playerId)),
    );
    if (duplicated) {
      Alert.alert('중복 배정 불가', `${memberName(duplicated)} 선수는 이미 다른 경기에 배정됐어요.`);
      return;
    }
    const side = tie.team1_id === team.id ? 'team1' : 'team2';
    setBusy(m.id);
    const { error } = await supabase.rpc('set_tie_lineup', { p_tie_match: m.id, p_side: side, p_players: players });
    setBusy(null);
    if (error) {
      Alert.alert('오더 저장 실패', error.message);
      return;
    }
    load();
    onChange?.();
  }

  async function submit(tie: TournamentTie) {
    const tsubs = subs.filter((x) => x.tie_id === tie.id);
    const incomplete = tsubs.some((m) => (sel[m.id]?.length ?? 0) !== need(m));
    if (incomplete) {
      setSubmitNotice({ kind: 'error', text: '모든 경기의 선수를 먼저 배정해 주세요.' });
      return;
    }
    const assigned = tsubs.flatMap((m) => sel[m.id] ?? []);
    if (new Set(assigned).size !== assigned.length) {
      setSubmitNotice({ kind: 'error', text: '한 선수는 같은 팀 경기에서 한 번만 출전할 수 있어요.' });
      return;
    }
    const side = tie.team1_id === team.id ? 'team1' : 'team2';
    setBusy(tie.id);
    setSubmitNotice({ kind: 'success', text: '선택한 오더를 저장하고 있어요…' });

    try {
      // 마지막 버튼 한 번으로 각 세부 경기 저장과 최종 잠금을 연속 처리한다.
      for (const [index, match] of tsubs.entries()) {
        setSubmitNotice({ kind: 'success', text: `${index + 1}/${tsubs.length} 경기 오더를 저장하고 있어요…` });
        const { error } = await Promise.race([
          supabase.rpc('set_tie_lineup', {
            p_tie_match: match.id,
            p_side: side,
            p_players: sel[match.id] ?? [],
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('요청 시간이 초과됐어요.')), 12000)),
        ]);
        if (error) throw error;
      }

      setSubmitNotice({ kind: 'success', text: '오더를 최종 제출하고 있어요…' });
      const { error } = await Promise.race([
        supabase.rpc('submit_tie_lineup', { p_tie: tie.id, p_side: side }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('요청 시간이 초과됐어요.')), 12000)),
      ]);
      if (error) throw error;

      setSubmitNotice({ kind: 'success', text: '오더 제출이 완료됐어요. 상대 팀 제출 후 함께 공개됩니다.' });
      await load();
      onChange?.();
      onSubmitted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSubmitNotice({
        kind: 'error',
        text: message.includes('already assigned') || message.includes('duplicate player')
          ? '같은 선수가 여러 경기에 배정되어 있어요.'
          : `제출하지 못했어요: ${message}`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}><View><Text style={styles.eyebrow}>경기 준비</Text><Text style={styles.sectionTitle}>우리 팀 오더</Text></View><Badge label="주장 전용" color="#16C784" bg="rgba(22,199,132,0.14)" /></View>
      <View style={styles.blindNotice}><Text style={styles.blindIcon}>◉</Text><Text style={styles.hint}>양 팀이 모두 제출하기 전까지 상대에게 오더가 공개되지 않아요.</Text></View>
      <View style={{ gap: 12, marginTop: 10 }}>
        {activeTies.map((tie) => {
          const side = tie.team1_id === team.id ? 'team1' : 'team2';
          const myReady = side === 'team1' ? tie.team1_lineup_ready : tie.team2_lineup_ready;
          const oppReady = side === 'team1' ? tie.team2_lineup_ready : tie.team1_lineup_ready;
          const oppId = side === 'team1' ? tie.team2_id : tie.team1_id;
          const tsubs = subs.filter((x) => x.tie_id === tie.id);
          const allAssigned = tsubs.every((m) => (sel[m.id]?.length ?? 0) === need(m));
          return (
            <View key={tie.id} style={styles.tieCard}>
              <View style={styles.tieHead}>
                <View><Text style={styles.eyebrow}>다음 팀 경기</Text><Text style={styles.tieVs}>{team.name}  vs  {nameOf(oppId)}</Text></View>
                {myReady ? (
                  <Badge
                    label={oppReady ? '공개됨' : '상대 대기중'}
                    color={oppReady ? '#16A34A' : '#B45309'}
                    bg={oppReady ? 'rgba(22,163,74,0.12)' : 'rgba(245,158,11,0.14)'}
                  />
                ) : null}
              </View>

              {myReady ? (
                // 제출 완료 → 내 오더 읽기전용
                <View style={{ gap: 4, marginTop: 8 }}>
                  {tsubs.map((m) => {
                    const players = side === 'team1' ? m.team1_players : m.team2_players;
                    return (
                      <View key={m.id} style={styles.roRow}>
                        <Text style={styles.subKind}>{m.kind === 'singles' ? '단식' : '복식'} {m.slot + 1}</Text>
                        <Text style={styles.roNames}>{players.map(memberName).join(', ') || '미정'}</Text>
                      </View>
                    );
                  })}
                  <Text style={styles.lockNote}>제출 완료 — 수정할 수 없어요.</Text>
                </View>
              ) : (
                // 배정 UI
                <View style={{ gap: 12, marginTop: 8 }}>
                  {submitNotice ? (
                    <View style={[styles.submitNotice, submitNotice.kind === 'error' && styles.submitNoticeError]}>
                      <Text style={[styles.submitNoticeText, submitNotice.kind === 'error' && styles.submitNoticeTextError]}>{submitNotice.text}</Text>
                    </View>
                  ) : null}
                  {tsubs.map((m) => {
                    const chosen = sel[m.id] ?? [];
                    return (
                      <View key={m.id} style={styles.subBlock}>
                        <View style={styles.subHead}>
                          <Text style={styles.subKind}>{m.kind === 'singles' ? '단식' : '복식'} {m.slot + 1}</Text>
                          <View style={styles.subActions}>
                            <Text style={[styles.pickCount, chosen.length === need(m) && styles.pickCountDone]}>{chosen.length}/{need(m)}명</Text>
                            <Pressable onPress={() => saveOne(tie, m)} disabled={busy === m.id} style={styles.saveBtn}>
                              <Text style={styles.saveText}>{busy === m.id ? '저장 중' : '저장'}</Text>
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.chips}>
                          {team.members.map((mem) => {
                            const on = chosen.includes(mem.user_id);
                            const usedElsewhere = !on && tsubs.some(
                              (other) => other.id !== m.id && (sel[other.id] ?? []).includes(mem.user_id),
                            );
                            return (
                              <Pressable
                                key={mem.user_id}
                                disabled={usedElsewhere}
                                onPress={() => toggle(m, mem.user_id)}
                                style={[styles.chip, on && styles.chipOn, usedElsewhere && styles.chipDisabled]}>
                                <Text style={[styles.chipText, on && styles.chipTextOn, usedElsewhere && styles.chipTextDisabled]}>
                                  {mem.profiles?.nickname ?? '?'}{usedElsewhere ? ' · 배정됨' : ''}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                  <Pressable onPress={() => submit(tie)} disabled={!allAssigned || busy === tie.id} style={[styles.submitBtn, (!allAssigned || busy === tie.id) && styles.submitOff]}>
                    <Text style={styles.submitText}>{busy === tie.id ? '저장 및 제출 중…' : allAssigned ? '오더 제출하기' : '선수 배정을 완료해 주세요'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: AppColors.textPrimary },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eyebrow: { color: AppColors.primary, fontSize: 11, fontWeight: '900', marginBottom: 3 },
  blindNotice: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: 'rgba(103,164,255,0.10)', borderRadius: 8, padding: 11, marginTop: 10 },
  blindIcon: { color: '#67A4FF', fontSize: 14 },
  hint: { flex: 1, fontSize: 12, color: '#67A4FF', lineHeight: 18 },
  tieCard: { backgroundColor: AppColors.surface, borderWidth: 1, borderColor: AppColors.border, borderRadius: 8, borderCurve: 'continuous', padding: Spacing.three },
  tieHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tieVs: { fontSize: 15, fontWeight: '800', color: AppColors.textPrimary },
  subBlock: { gap: 8, backgroundColor: AppColors.surfaceSoft, borderRadius: 8, padding: 10 },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subKind: { fontSize: 14, fontWeight: '700', color: AppColors.textPrimary },
  pickCount: { color: '#F5B942', fontSize: 12, fontWeight: '800' },
  pickCountDone: { color: AppColors.primary },
  subActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveBtn: { backgroundColor: AppColors.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  saveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: AppColors.border, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: AppColors.surface },
  chipOn: { backgroundColor: '#16C784', borderColor: '#16C784' },
  chipDisabled: { opacity: 0.42, backgroundColor: AppColors.surfaceSoft },
  chipText: { fontSize: 13, fontWeight: '600', color: AppColors.textSecondary },
  chipTextOn: { color: '#fff' },
  chipTextDisabled: { color: AppColors.textMuted },
  submitBtn: { backgroundColor: AppColors.primary, borderRadius: 8, borderCurve: 'continuous', paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  submitOff: { backgroundColor: AppColors.surfaceSoft },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  submitNotice: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 9, backgroundColor: 'rgba(22,199,132,0.12)' },
  submitNoticeError: { backgroundColor: 'rgba(229,72,77,0.12)' },
  submitNoticeText: { color: AppColors.primary, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  submitNoticeTextError: { color: AppColors.dangerText },
  roRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: AppColors.surfaceSoft, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  roNames: { fontSize: 13, fontWeight: '600', color: AppColors.textPrimary },
  lockNote: { fontSize: 12, color: AppColors.textMuted, marginTop: 4 },
});
