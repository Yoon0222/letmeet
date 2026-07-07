import { supabase } from './supabase';
import type { TournamentCourt, TournamentMatch } from './types';

// 잔여 경기(미완료, 부전승 제외)를 예선→본선, 조/라운드/슬롯 순으로 정렬
function remainingMatches(matches: TournamentMatch[]): TournamentMatch[] {
  return matches
    .filter((m) => m.status !== 'done' && m.entry2_id)
    .sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === 'group' ? -1 : 1;
      if (a.phase === 'group') return (a.group_no ?? 0) - (b.group_no ?? 0) || a.slot - b.slot;
      return (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot;
    });
}

// 지금 배정 가능한 경기를 빈 코트에 배정한 결과를 계산한다.
// 규칙: 코트당 1경기, 같은 팀 동시 출전 금지(선수가 경기중이면 건너뜀), 순서 우선.
export function computeAutoAssign(
  matches: TournamentMatch[],
  courts: TournamentCourt[],
): { id: string; court_id: string }[] {
  if (courts.length === 0) return [];
  const remaining = remainingMatches(matches);

  const occupiedCourtIds = new Set<string>();
  const busyTeams = new Set<string>();
  remaining.forEach((m) => {
    if (m.court_id) {
      occupiedCourtIds.add(m.court_id);
      if (m.entry1_id) busyTeams.add(m.entry1_id);
      if (m.entry2_id) busyTeams.add(m.entry2_id);
    }
  });

  const courtQueue = courts.filter((c) => !occupiedCourtIds.has(c.id));
  const unassigned = remaining.filter((m) => !m.court_id);

  const updates: { id: string; court_id: string }[] = [];
  let qi = 0;
  for (const m of unassigned) {
    if (qi >= courtQueue.length) break;
    if ((m.entry1_id && busyTeams.has(m.entry1_id)) || (m.entry2_id && busyTeams.has(m.entry2_id))) continue;
    updates.push({ id: m.id, court_id: courtQueue[qi].id });
    qi += 1;
    if (m.entry1_id) busyTeams.add(m.entry1_id);
    if (m.entry2_id) busyTeams.add(m.entry2_id);
  }
  return updates;
}

// 경기 종료 등으로 코트가 비었을 때, 대기 경기를 자동으로 빈 코트에 투입(미확정 상태).
// 새로 배정한 경기 수를 반환.
export async function autoAdvanceCourts(tournamentId: string): Promise<number> {
  const [{ data: ms }, { data: cs }] = await Promise.all([
    supabase.from('tournament_matches').select('*').eq('tournament_id', tournamentId),
    supabase.from('tournament_courts').select('*').eq('tournament_id', tournamentId).order('sort', { ascending: true }),
  ]);
  const updates = computeAutoAssign((ms as TournamentMatch[]) ?? [], (cs as TournamentCourt[]) ?? []);
  for (const u of updates) {
    await supabase.from('tournament_matches').update({ court_id: u.court_id, court_confirmed: false }).eq('id', u.id);
  }
  return updates.length;
}
