import type { TournamentMatch } from './types';

// 조 순위 (읽기 전용) — 승수 → 득실차 → 득점 순
export type Standing = { id: string; played: number; wins: number; pf: number; pa: number; diff: number };

export function standings(members: string[], matches: TournamentMatch[]): Standing[] {
  const map = new Map<string, Standing>();
  members.forEach((id) => map.set(id, { id, played: 0, wins: 0, pf: 0, pa: 0, diff: 0 }));
  for (const m of matches) {
    if (m.status !== 'done' || m.score1 == null || m.score2 == null) continue;
    const s1 = m.entry1_id ? map.get(m.entry1_id) : undefined;
    const s2 = m.entry2_id ? map.get(m.entry2_id) : undefined;
    if (!s1 || !s2) continue;
    s1.played++;
    s2.played++;
    s1.pf += m.score1;
    s1.pa += m.score2;
    s2.pf += m.score2;
    s2.pa += m.score1;
    if (m.winner_id === s1.id) s1.wins++;
    else if (m.winner_id === s2.id) s2.wins++;
  }
  const arr = [...map.values()];
  arr.forEach((s) => (s.diff = s.pf - s.pa));
  arr.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf);
  return arr;
}

// 조별 경기에서 조 구성원(순서 유지)을 추출
export function groupMembers(matches: TournamentMatch[]): string[] {
  const seen: string[] = [];
  for (const m of matches) {
    for (const id of [m.entry1_id, m.entry2_id]) {
      if (id && !seen.includes(id)) seen.push(id);
    }
  }
  return seen;
}

export function roundLabel(m: TournamentMatch): string {
  return m.round_name || '토너먼트';
}
