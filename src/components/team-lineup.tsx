import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { TieMatch, TournamentTeam, TournamentTeamWithMembers, TournamentTie } from '@/lib/types';

// 오더 싸움 — 주장이 우리 팀 라인업을 배정하고 '제출'하면 잠긴다.
// 양 팀 모두 제출해야 상대 오더가 공개된다(블라인드).
export function TeamLineup({ team, onChange }: { team: TournamentTeamWithMembers; onChange?: () => void }) {
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

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
  const activeTies = ties.filter((t) => t.team1_id && t.team2_id && t.status !== 'done');
  if (activeTies.length === 0) return null;

  const need = (m: TieMatch) => (m.kind === 'singles' ? 1 : 2);

  function toggle(m: TieMatch, uid: string) {
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
      Alert.alert('오더 미완성', '모든 경기의 선수를 먼저 배정하고 저장하세요.');
      return;
    }
    Alert.alert('오더 제출', '제출하면 수정할 수 없어요. 상대도 제출하면 서로 공개됩니다.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '제출',
        onPress: async () => {
          const side = tie.team1_id === team.id ? 'team1' : 'team2';
          setBusy(tie.id);
          const { error } = await supabase.rpc('submit_tie_lineup', { p_tie: tie.id, p_side: side });
          setBusy(null);
          if (error) {
            Alert.alert('제출 실패', error.message);
            return;
          }
          load();
          onChange?.();
        },
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>우리 팀 오더</Text>
      <Text style={styles.hint}>경기별 출전 선수를 정해 제출하세요. 양 팀 모두 제출하면 서로 공개돼요. (단식 1명 · 복식 2명)</Text>
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
                <Text style={styles.tieVs}>vs {nameOf(oppId)}</Text>
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
                  {tsubs.map((m) => {
                    const chosen = sel[m.id] ?? [];
                    return (
                      <View key={m.id} style={styles.subBlock}>
                        <View style={styles.subHead}>
                          <Text style={styles.subKind}>{m.kind === 'singles' ? '단식' : '복식'} {m.slot + 1}</Text>
                          <Pressable onPress={() => saveOne(tie, m)} disabled={busy === m.id} style={styles.saveBtn}>
                            <Text style={styles.saveText}>{busy === m.id ? '저장 중…' : '저장'}</Text>
                          </Pressable>
                        </View>
                        <View style={styles.chips}>
                          {team.members.map((mem) => {
                            const on = chosen.includes(mem.user_id);
                            return (
                              <Pressable key={mem.user_id} onPress={() => toggle(m, mem.user_id)} style={[styles.chip, on && styles.chipOn]}>
                                <Text style={[styles.chipText, on && styles.chipTextOn]}>{mem.profiles?.nickname ?? '?'}</Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    );
                  })}
                  <Pressable onPress={() => submit(tie)} disabled={!allAssigned || busy === tie.id} style={[styles.submitBtn, (!allAssigned || busy === tie.id) && styles.submitOff]}>
                    <Text style={styles.submitText}>{busy === tie.id ? '제출 중…' : '오더 제출 (잠금)'}</Text>
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
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  hint: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 19 },
  tieCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, borderCurve: 'continuous', padding: Spacing.three },
  tieHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tieVs: { fontSize: 15, fontWeight: '800', color: '#111827' },
  subBlock: { gap: 6 },
  subHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subKind: { fontSize: 14, fontWeight: '700', color: '#111827' },
  saveBtn: { backgroundColor: '#16C784', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#FFFFFF' },
  chipOn: { backgroundColor: '#16C784', borderColor: '#16C784' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextOn: { color: '#fff' },
  submitBtn: { backgroundColor: '#2D6BD6', borderRadius: 12, borderCurve: 'continuous', paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  submitOff: { backgroundColor: '#C7CDD6' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  roRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F6F7F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  roNames: { fontSize: 13, fontWeight: '600', color: '#111827' },
  lockNote: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
});
