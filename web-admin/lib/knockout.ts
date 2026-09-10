import { supabase } from './supabase';
import type { TournamentMatch, TournamentStatus, TournamentTie } from './types';

// 본선(토너먼트) 승자를 다음 라운드 슬롯으로 전파한다.
// 라운드 r 슬롯 s 경기의 승자 → 라운드 r+1 슬롯 floor(s/2)의 entry1(s 짝수)/entry2(s 홀수).
// 부전승(생성 시 done) 및 점수 입력으로 확정된 승자 모두 처리. 여러 번 호출해도 안전(멱등).
export async function advanceKnockoutWinners(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('tournament_matches')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('phase', 'knockout');
  const ko = (data as TournamentMatch[]) ?? [];
  if (ko.length === 0) return;

  const at = (r: number, s: number) => ko.find((m) => m.round_order === r && m.slot === s);
  const maxRound = Math.max(0, ...ko.map((m) => m.round_order ?? 0));

  const updates: { id: string; field: 'entry1_id' | 'entry2_id'; value: string }[] = [];
  // 낮은 라운드부터 위로 전파 (로컬 사본을 갱신해 연쇄 반영)
  for (let r = 1; r < maxRound; r++) {
    for (const m of ko.filter((x) => x.round_order === r)) {
      if (m.status !== 'done' || !m.winner_id) continue;
      const next = at(r + 1, Math.floor(m.slot / 2));
      if (!next) continue;
      const field: 'entry1_id' | 'entry2_id' = m.slot % 2 === 0 ? 'entry1_id' : 'entry2_id';
      if (next[field] !== m.winner_id) {
        next[field] = m.winner_id; // 로컬 갱신
        updates.push({ id: next.id, field, value: m.winner_id });
      }
    }
  }

  for (const u of updates) {
    const patch = u.field === 'entry1_id' ? { entry1_id: u.value } : { entry2_id: u.value };
    await supabase.from('tournament_matches').update(patch).eq('id', u.id);
  }
}

// 결승(최종 라운드) 승자가 확정되면 대회를 자동 '종료'로 전환한다. 멱등.
// 진행 중(ongoing)인 대회만 전환 — 취소/접수 상태는 건드리지 않는다. (3·4위전 없음: 결승 라운드 = 경기 1개)
export async function maybeFinishTournament(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('tournament_matches')
    .select('round_order, status, winner_id')
    .eq('tournament_id', tournamentId)
    .eq('phase', 'knockout');
  const ko = (data as Pick<TournamentMatch, 'round_order' | 'status' | 'winner_id'>[]) ?? [];
  if (ko.length === 0) return;
  const maxRound = Math.max(...ko.map((m) => m.round_order ?? 0));
  const finals = ko.filter((m) => m.round_order === maxRound);
  // 단일 토너먼트의 결승은 정확히 1경기 — 부분 생성된 브래킷을 결승으로 오인하지 않도록.
  if (finals.length !== 1 || finals[0].status !== 'done' || !finals[0].winner_id) return;
  await supabase
    .from('tournaments')
    .update({ status: 'finished' as TournamentStatus })
    .eq('id', tournamentId)
    .eq('status', 'ongoing');
}

// 단체전 본선: 승리 팀을 다음 라운드 타이 슬롯으로 전파 (advanceKnockoutWinners 의 팀 버전).
export async function advanceTeamKnockout(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('tournament_ties')
    .select('*')
    .eq('tournament_id', tournamentId)
    .eq('phase', 'knockout');
  const ko = (data as TournamentTie[]) ?? [];
  if (ko.length === 0) return;

  const at = (r: number, s: number) => ko.find((m) => m.round_order === r && m.slot === s);
  const maxRound = Math.max(0, ...ko.map((m) => m.round_order ?? 0));

  const updates: { id: string; field: 'team1_id' | 'team2_id'; value: string }[] = [];
  for (let r = 1; r < maxRound; r++) {
    for (const tie of ko.filter((x) => x.round_order === r)) {
      if (tie.status !== 'done' || !tie.winner_team_id) continue;
      const next = at(r + 1, Math.floor(tie.slot / 2));
      if (!next) continue;
      const field: 'team1_id' | 'team2_id' = tie.slot % 2 === 0 ? 'team1_id' : 'team2_id';
      if (next[field] !== tie.winner_team_id) {
        next[field] = tie.winner_team_id;
        updates.push({ id: next.id, field, value: tie.winner_team_id });
      }
    }
  }

  for (const u of updates) {
    const patch = u.field === 'team1_id' ? { team1_id: u.value } : { team2_id: u.value };
    await supabase.from('tournament_ties').update(patch).eq('id', u.id);
  }
}

// 단체전: 결승 타이 승리 팀이 확정되면 대회를 자동 '종료'로 전환한다. 멱등.
export async function maybeFinishTeamTournament(tournamentId: string): Promise<void> {
  const { data } = await supabase
    .from('tournament_ties')
    .select('round_order, status, winner_team_id')
    .eq('tournament_id', tournamentId)
    .eq('phase', 'knockout');
  const ko = (data as Pick<TournamentTie, 'round_order' | 'status' | 'winner_team_id'>[]) ?? [];
  if (ko.length === 0) return;
  const maxRound = Math.max(...ko.map((m) => m.round_order ?? 0));
  const finals = ko.filter((m) => m.round_order === maxRound);
  // 결승 타이는 정확히 1건 — 부분 생성된 브래킷 오인 방지.
  if (finals.length !== 1 || finals[0].status !== 'done' || !finals[0].winner_team_id) return;
  await supabase
    .from('tournaments')
    .update({ status: 'finished' as TournamentStatus })
    .eq('id', tournamentId)
    .eq('status', 'ongoing');
}
