import { supabase } from './supabase';
import type { TournamentMatch } from './types';

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
