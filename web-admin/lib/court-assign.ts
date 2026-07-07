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

// 숫자 배열 사전식 비교 (작을수록 우선)
function cmpKey(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

// 지금 배정 가능한 경기를 빈 코트에 배정한 결과를 계산한다.
// 규칙:
//  - 코트당 1경기, 같은 팀 동시 출전 금지(선수가 경기중이면 건너뜀)
//  - 우선순위: "덜 진행한 조" 먼저 (조별 완료+진행중 경기 수가 적은 조 우선) → 조번호 → 슬롯
//    (예: 1조가 이미 한 번 뛰었고 6조가 아직이면, 빈 코트엔 6조가 먼저 들어간다)
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
  if (courtQueue.length === 0) return [];

  // 조별 진행 횟수(완료 + 진행중) — 전체 경기 기준
  const groupPlayed = new Map<number, number>();
  matches.forEach((m) => {
    if (m.phase !== 'group' || m.group_no == null) return;
    if (m.status === 'done' || m.court_id) groupPlayed.set(m.group_no, (groupPlayed.get(m.group_no) ?? 0) + 1);
  });

  const priorityKey = (m: TournamentMatch): number[] =>
    m.phase === 'group'
      ? [0, groupPlayed.get(m.group_no ?? 0) ?? 0, m.group_no ?? 0, m.slot]
      : [1, 0, m.round_order ?? 0, m.slot];

  const pool = remaining.filter((m) => !m.court_id);
  const updates: { id: string; court_id: string }[] = [];
  let qi = 0;
  while (qi < courtQueue.length && pool.length > 0) {
    // 준비된(선수 안 겹치는) 경기 중 우선순위가 가장 높은 것을 고른다
    let bestIdx = -1;
    let bestKey: number[] | null = null;
    for (let i = 0; i < pool.length; i++) {
      const m = pool[i];
      if ((m.entry1_id && busyTeams.has(m.entry1_id)) || (m.entry2_id && busyTeams.has(m.entry2_id))) continue;
      const key = priorityKey(m);
      if (bestKey === null || cmpKey(key, bestKey) < 0) {
        bestKey = key;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break; // 준비된 경기 없음
    const m = pool.splice(bestIdx, 1)[0];
    updates.push({ id: m.id, court_id: courtQueue[qi].id });
    qi += 1;
    if (m.entry1_id) busyTeams.add(m.entry1_id);
    if (m.entry2_id) busyTeams.add(m.entry2_id);
    if (m.phase === 'group' && m.group_no != null) {
      groupPlayed.set(m.group_no, (groupPlayed.get(m.group_no) ?? 0) + 1); // 방금 배정 반영 → 다음 선택은 다른 조 우선
    }
  }
  return updates;
}

// 배정 대기열: 아직 코트 없이 지금 배정 가능한(양팀 확정 + 선수 안 겹침) 경기를
// 우선순위 순(덜 진행한 조 → 조/라운드/슬롯)으로 나열한다. 대기번호 매길 때 사용.
export function computeQueueOrder(matches: TournamentMatch[]): TournamentMatch[] {
  const remaining = remainingMatches(matches);

  const busyTeams = new Set<string>();
  remaining.forEach((m) => {
    if (m.court_id) {
      if (m.entry1_id) busyTeams.add(m.entry1_id);
      if (m.entry2_id) busyTeams.add(m.entry2_id);
    }
  });

  const groupPlayed = new Map<number, number>();
  matches.forEach((m) => {
    if (m.phase !== 'group' || m.group_no == null) return;
    if (m.status === 'done' || m.court_id) groupPlayed.set(m.group_no, (groupPlayed.get(m.group_no) ?? 0) + 1);
  });

  const priorityKey = (m: TournamentMatch, played: Map<number, number>): number[] =>
    m.phase === 'group'
      ? [0, played.get(m.group_no ?? 0) ?? 0, m.group_no ?? 0, m.slot]
      : [1, 0, m.round_order ?? 0, m.slot];

  // 지금 배정 가능한 경기(양팀 확정 + 선수 안 겹침)만 대상
  const pool = remaining.filter(
    (m) => !m.court_id && !!m.entry1_id && !!m.entry2_id && !busyTeams.has(m.entry1_id) && !busyTeams.has(m.entry2_id),
  );

  // 픽할 때마다 조별 진행수를 늘려 조 간 rotation (1조→2조→…→다시 1조) 순으로 나열
  const played = new Map(groupPlayed);
  const order: TournamentMatch[] = [];
  const rest = [...pool];
  while (rest.length > 0) {
    let bestIdx = 0;
    let bestKey = priorityKey(rest[0], played);
    for (let i = 1; i < rest.length; i++) {
      const key = priorityKey(rest[i], played);
      if (cmpKey(key, bestKey) < 0) {
        bestKey = key;
        bestIdx = i;
      }
    }
    const m = rest.splice(bestIdx, 1)[0];
    order.push(m);
    if (m.phase === 'group' && m.group_no != null) played.set(m.group_no, (played.get(m.group_no) ?? 0) + 1);
  }
  return order;
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
