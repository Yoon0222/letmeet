import type { TieMatch, TournamentTie } from './types';

// 타이(팀 대 팀) 승자: 서브매치 승수 비교. 모두 끝나야(또는 과반 확정 시) 승자 반환.
export function tieWinner(matches: TieMatch[]): 'team1' | 'team2' | null {
  const total = matches.length;
  if (total === 0) return null;
  const w1 = matches.filter((m) => m.winner === 'team1').length;
  const w2 = matches.filter((m) => m.winner === 'team2').length;
  const majority = Math.floor(total / 2) + 1;
  if (w1 >= majority) return 'team1';
  if (w2 >= majority) return 'team2';
  const done = matches.filter((m) => m.status === 'done').length;
  if (done === total && w1 !== w2) return w1 > w2 ? 'team1' : 'team2';
  return null;
}

// 팀 순위 (조별) — 팀 승수 → 득실차 → 득점 순. 득실은 서브매치 스코어 합산.
export type TeamStanding = { teamId: string; played: number; wins: number; pf: number; pa: number; diff: number };

export function teamStandings(teamIds: string[], ties: TournamentTie[], subs: TieMatch[]): TeamStanding[] {
  const map = new Map<string, TeamStanding>();
  teamIds.forEach((id) => map.set(id, { teamId: id, played: 0, wins: 0, pf: 0, pa: 0, diff: 0 }));
  for (const tie of ties) {
    if (tie.status !== 'done') continue;
    const s1 = tie.team1_id ? map.get(tie.team1_id) : undefined;
    const s2 = tie.team2_id ? map.get(tie.team2_id) : undefined;
    if (s1) s1.played++;
    if (s2) s2.played++;
    if (tie.winner_team_id && map.has(tie.winner_team_id)) map.get(tie.winner_team_id)!.wins++;
    // 서브매치 스코어로 득실 집계
    for (const m of subs) {
      if (m.tie_id !== tie.id || m.status !== 'done' || m.score1 == null || m.score2 == null) continue;
      if (s1) { s1.pf += m.score1; s1.pa += m.score2; }
      if (s2) { s2.pf += m.score2; s2.pa += m.score1; }
    }
  }
  const arr = [...map.values()];
  arr.forEach((s) => (s.diff = s.pf - s.pa));
  arr.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf);
  return arr;
}
