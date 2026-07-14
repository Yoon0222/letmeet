import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { TieMatch, TournamentTeamWithMembers, TournamentTie } from '@/lib/types';

// 단체전 대진 표시 (읽기전용) — 조별 팀 순위 + 타이·서브매치 결과·오더 + 본선.
// 오더는 양 팀 모두 제출해야(블라인드) 공개된다.
export function TeamBracketView({ tournamentId, refreshKey = 0 }: { tournamentId: string; refreshKey?: number }) {
  const [teams, setTeams] = useState<TournamentTeamWithMembers[]>([]);
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [{ data: tm }, { data: ti }] = await Promise.all([
      supabase
        .from('tournament_teams')
        .select('*, members:tournament_team_members(user_id, profiles(id, nickname, skill_level, avatar_url, region))')
        .eq('tournament_id', tournamentId),
      supabase.from('tournament_ties').select('*').eq('tournament_id', tournamentId).order('slot', { ascending: true }),
    ]);
    setTeams((tm as unknown as TournamentTeamWithMembers[]) ?? []);
    const tieList = (ti as TournamentTie[]) ?? [];
    setTies(tieList);
    if (tieList.length > 0) {
      const { data: sm } = await supabase.from('tie_matches').select('*').in('tie_id', tieList.map((x) => x.id)).order('slot', { ascending: true });
      setSubs((sm as TieMatch[]) ?? []);
    }
    setLoaded(true);
  }, [tournamentId]);

  useEffect(() => {
    // refreshKey 변경 시(오더 저장 등) 다시 로드
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load, refreshKey]);

  // 진행 전이면 아무것도 안 보임
  if (!loaded || ties.length === 0) return null;

  const nameOf = (teamId: string | null) => teams.find((x) => x.id === teamId)?.name ?? '미정';
  // uid -> 닉네임 (오더 표시용)
  const playerName = new Map<string, string>();
  teams.forEach((t) => t.members?.forEach((m) => playerName.set(m.user_id, m.profiles?.nickname ?? '?')));
  const lineup = (ids: string[]) => ids.map((id) => playerName.get(id) ?? '?').join('·');
  const groupTies = ties.filter((x) => x.phase === 'group');
  const groupNos = [...new Set(groupTies.map((x) => x.group_no ?? 1))].sort((a, b) => a - b);
  const koTies = ties.filter((x) => x.phase === 'knockout').sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot);
  const koRounds = [...new Set(koTies.map((x) => x.round_order ?? 1))].sort((a, b) => a - b);

  function TieRow({ tie }: { tie: TournamentTie }) {
    const tsubs = subs.filter((x) => x.tie_id === tie.id);
    const w1 = tsubs.filter((x) => x.winner === 'team1').length;
    const w2 = tsubs.filter((x) => x.winner === 'team2').length;
    const done = tie.status === 'done';
    // 오더는 양 팀 모두 제출해야 공개 (또는 경기 종료 시)
    const revealed = (tie.team1_lineup_ready && tie.team2_lineup_ready) || done;
    return (
      <View style={styles.tie}>
        <View style={styles.tieHead}>
          <Text style={[styles.tieName, done && tie.winner_team_id === tie.team1_id && styles.win]} numberOfLines={1}>{nameOf(tie.team1_id)}</Text>
          <Text style={styles.tieScore}>{w1} : {w2}</Text>
          <Text style={[styles.tieName, styles.right, done && tie.winner_team_id === tie.team2_id && styles.win]} numberOfLines={1}>{nameOf(tie.team2_id)}</Text>
        </View>
        {tie.team1_id && tie.team2_id ? (
          <View style={{ gap: 4, marginTop: 6 }}>
            {tsubs.map((m) => {
              const hasLineup = m.team1_players.length > 0 || m.team2_players.length > 0;
              return (
                <View key={m.id} style={styles.sub}>
                  <View style={styles.subTop}>
                    <Text style={styles.subKind}>{m.kind === 'singles' ? '단식' : '복식'} {m.slot + 1}</Text>
                    <Text style={styles.subResult}>
                      {m.status === 'done' && m.score1 != null ? `${m.score1} : ${m.score2}` : '예정'}
                    </Text>
                  </View>
                  {revealed && hasLineup ? (
                    <Text style={styles.lineup}>
                      {m.team1_players.length ? lineup(m.team1_players) : '미정'} vs {m.team2_players.length ? lineup(m.team2_players) : '미정'}
                    </Text>
                  ) : !revealed && (tie.team1_lineup_ready || tie.team2_lineup_ready) ? (
                    <Text style={styles.lineupHidden}>오더 미공개 (양 팀 제출 후 공개)</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.pending}>양 팀 확정 대기 중</Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three, marginTop: Spacing.two }}>
      {groupNos.map((g) => {
        const gt = groupTies.filter((x) => (x.group_no ?? 1) === g);
        const teamIds = [...new Set(gt.flatMap((x) => [x.team1_id, x.team2_id]).filter(Boolean) as string[])];
        // 팀 승수 + 득실 (서브매치 스코어 합산). 정렬: 승 → 득실 → 득점
        const stat = new Map<string, { wins: number; pf: number; pa: number }>();
        teamIds.forEach((tid) => stat.set(tid, { wins: 0, pf: 0, pa: 0 }));
        gt.forEach((tie) => {
          if (tie.status !== 'done') return;
          if (tie.winner_team_id && stat.has(tie.winner_team_id)) stat.get(tie.winner_team_id)!.wins++;
          subs.filter((m) => m.tie_id === tie.id && m.status === 'done' && m.score1 != null && m.score2 != null).forEach((m) => {
            const a = tie.team1_id ? stat.get(tie.team1_id) : undefined;
            const b = tie.team2_id ? stat.get(tie.team2_id) : undefined;
            if (a) { a.pf += m.score1!; a.pa += m.score2!; }
            if (b) { b.pf += m.score2!; b.pa += m.score1!; }
          });
        });
        const diffOf = (tid: string) => (stat.get(tid)?.pf ?? 0) - (stat.get(tid)?.pa ?? 0);
        const ranked = [...teamIds].sort((a, b) => (stat.get(b)!.wins - stat.get(a)!.wins) || (diffOf(b) - diffOf(a)) || (stat.get(b)!.pf - stat.get(a)!.pf));
        return (
          <View key={g} style={styles.section}>
            <Text style={styles.sectionTitle}>{g}조</Text>
            <View style={styles.card}>
              {ranked.map((tid, i) => (
                <View key={tid} style={[styles.standRow, i > 0 && styles.divider]}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <Text style={styles.standName} numberOfLines={1}>{nameOf(tid)}</Text>
                  <Text style={styles.standDiff}>{diffOf(tid) > 0 ? '+' : ''}{diffOf(tid)}</Text>
                  <Text style={styles.standWins}>{stat.get(tid)?.wins ?? 0}승</Text>
                </View>
              ))}
            </View>
            <View style={{ gap: 8, marginTop: 8 }}>{gt.map((tie) => <TieRow key={tie.id} tie={tie} />)}</View>
          </View>
        );
      })}

      {koTies.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>본선 토너먼트</Text>
          <View style={{ gap: 12, marginTop: 4 }}>
            {koRounds.map((r) => {
              const rTies = koTies.filter((x) => (x.round_order ?? 1) === r);
              return (
                <View key={r} style={{ gap: 8 }}>
                  <Text style={styles.roundLabel}>{rTies[0]?.round_name ?? `${r}라운드`}</Text>
                  {rTies.map((tie) => <TieRow key={tie.id} tie={tie} />)}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 6 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, borderCurve: 'continuous', overflow: 'hidden' },
  standRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, gap: 10 },
  divider: { borderTopWidth: 1, borderTopColor: '#F1F3F5' },
  rank: { width: 18, fontSize: 13, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
  standName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  standDiff: { fontSize: 12, color: '#6B7280', minWidth: 34, textAlign: 'right' },
  standWins: { fontSize: 13, fontWeight: '700', color: '#16C784', minWidth: 34, textAlign: 'right' },
  tie: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, borderCurve: 'continuous', padding: 12 },
  tieHead: { flexDirection: 'row', alignItems: 'center' },
  tieName: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  right: { textAlign: 'right' },
  win: { color: '#16A34A' },
  tieScore: { fontSize: 14, fontWeight: '800', color: '#6B7280', paddingHorizontal: 10 },
  sub: { backgroundColor: '#F6F7F9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, gap: 2 },
  subTop: { flexDirection: 'row', justifyContent: 'space-between' },
  subKind: { fontSize: 13, color: '#6B7280' },
  subResult: { fontSize: 13, fontWeight: '600', color: '#111827' },
  lineup: { fontSize: 12, color: '#6B7280' },
  lineupHidden: { fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' },
  pending: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },
  roundLabel: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
});
