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
  // 과반 미달이지만 전 경기 종료 시 승수 많은 쪽
  const done = matches.filter((m) => m.status === 'done').length;
  if (done === total && w1 !== w2) return w1 > w2 ? 'team1' : 'team2';
  return null;
}

// 팀 순위 (조별) — done 타이의 winner_team_id 로 팀 승수 집계.
export type TeamStanding = { teamId: string; played: number; wins: number };

export function teamStandings(teamIds: string[], ties: TournamentTie[]): TeamStanding[] {
  const map = new Map<string, TeamStanding>();
  teamIds.forEach((id) => map.set(id, { teamId: id, played: 0, wins: 0 }));
  for (const tie of ties) {
    if (tie.status !== 'done') continue;
    const s1 = tie.team1_id ? map.get(tie.team1_id) : undefined;
    const s2 = tie.team2_id ? map.get(tie.team2_id) : undefined;
    if (s1) s1.played++;
    if (s2) s2.played++;
    if (tie.winner_team_id && map.has(tie.winner_team_id)) map.get(tie.winner_team_id)!.wins++;
  }
  return [...map.values()].sort((a, b) => b.wins - a.wins || b.played - a.played);
}
