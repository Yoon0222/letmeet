import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { TieMatch, TournamentTeamWithMembers, TournamentTie } from '@/lib/types';

// 오더 — 주장이 우리 팀 서브매치 출전 선수를 배정한다 (set_tie_lineup RPC).
export function TeamLineup({ team }: { team: TournamentTeamWithMembers }) {
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [sel, setSel] = useState<Record<string, string[]>>({}); // subMatchId -> uids
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    // 우리 팀이 team1 또는 team2 인 타이
    const { data: ti } = await supabase
      .from('tournament_ties')
      .select('*')
      .eq('tournament_id', team.tournament_id)
      .or(`team1_id.eq.${team.id},team2_id.eq.${team.id}`);
    const list = (ti as TournamentTie[]) ?? [];
    setTies(list);
    if (list.length > 0) {
      const { data: sm } = await supabase.from('tie_matches').select('*').in('tie_id', list.map((x) => x.id)).order('slot', { ascending: true });
      const smList = (sm as TieMatch[]) ?? [];
      setSubs(smList);
      // 초기 선택값 = 우리 쪽 저장된 라인업
      const init: Record<string, string[]> = {};
      for (const m of smList) {
        const tie = list.find((t) => t.id === m.tie_id);
        if (!tie) continue;
        const side = tie.team1_id === team.id ? 'team1' : 'team2';
        init[m.id] = side === 'team1' ? m.team1_players : m.team2_players;
      }
      setSel(init);
    }
  }, [team.id, team.tournament_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const activeTies = ties.filter((t) => t.team1_id && t.team2_id && t.status !== 'done');
  if (activeTies.length === 0) return null;

  const need = (m: TieMatch) => (m.kind === 'singles' ? 1 : 2);

  function toggle(m: TieMatch, uid: string) {
    setSel((prev) => {
      const cur = prev[m.id] ?? [];
      if (cur.includes(uid)) return { ...prev, [m.id]: cur.filter((x) => x !== uid) };
      if (cur.length >= need(m)) return { ...prev, [m.id]: [...cur.slice(1), uid] }; // 초과 시 가장 오래된 것 교체
      return { ...prev, [m.id]: [...cur, uid] };
    });
  }

  async function save(tie: TournamentTie, m: TieMatch) {
    const players = sel[m.id] ?? [];
    if (players.length !== need(m)) {
      Alert.alert('선수 수 확인', `${m.kind === 'singles' ? '단식' : '복식'}은 ${need(m)}명을 선택해야 해요.`);
      return;
    }
    const side = tie.team1_id === team.id ? 'team1' : 'team2';
    setSaving(m.id);
    const { error } = await supabase.rpc('set_tie_lineup', { p_tie_match: m.id, p_side: side, p_players: players });
    setSaving(null);
    if (error) {
      Alert.alert('오더 저장 실패', error.message);
      return;
    }
    load();
  }

  const nameOf = (uid: string) => team.members.find((x) => x.user_id === uid)?.profiles?.nickname ?? '?';

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>우리 팀 오더 배정</Text>
      <Text style={styles.hint}>각 경기에 나갈 우리 팀 선수를 정하세요. (단식 1명 · 복식 2명)</Text>
      <View style={{ gap: 12, marginTop: 10 }}>
        {activeTies.map((tie) => {
          const tsubs = subs.filter((x) => x.tie_id === tie.id);
          return (
            <View key={tie.id} style={styles.tieCard}>
              {tsubs.map((m) => {
                const chosen = sel[m.id] ?? [];
                return (
                  <View key={m.id} style={styles.subBlock}>
                    <View style={styles.subHead}>
                      <Text style={styles.subKind}>{m.kind === 'singles' ? '단식' : '복식'} {m.slot + 1}</Text>
                      <Pressable onPress={() => save(tie, m)} disabled={saving === m.id} style={styles.saveBtn}>
                        <Text style={styles.saveText}>{saving === m.id ? '저장 중…' : '저장'}</Text>
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
                    {chosen.length > 0 ? (
                      <Text style={styles.chosen}>선택: {chosen.map(nameOf).join(', ')}</Text>
                    ) : null}
                  </View>
                );
              })}
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
  hint: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  tieCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 14, borderCurve: 'continuous', padding: Spacing.three, gap: 12 },
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
  chosen: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
});
