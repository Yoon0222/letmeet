import { supabase } from '@/lib/supabase';

// 대회 개별경기 결과가 확정되면 DUPR 에 등록(match/create). 인증 대회에서만 동작.
// 경기(entry1/2)+복식 파트너를 DB 에서 풀어 공용 dupr-match 엣지함수를 호출한다.
// 실패해도 UI 를 막지 않는다(등록 상태는 tournament_matches.dupr_status 에 기록됨).
export async function submitTournamentMatch(matchId: string): Promise<void> {
  try {
    const { data: m } = await supabase
      .from('tournament_matches')
      .select('id, tournament_id, entry1_id, entry2_id, score1, score2, status, dupr_status')
      .eq('id', matchId)
      .maybeSingle();
    if (!m || m.status !== 'done' || m.score1 == null || m.score2 == null || !m.entry1_id || !m.entry2_id) return;
    // 이미 등록된 경기라도 재호출 = 점수 수정 반영(dupr-match 가 create/update 자동 판단).

    const { data: t } = await supabase
      .from('tournaments')
      .select('dupr_certified, discipline, title, start_at')
      .eq('id', m.tournament_id)
      .maybeSingle();
    if (!t?.dupr_certified) return;

    const doubles = t.discipline === 'doubles';
    let a2: string | undefined;
    let b2: string | undefined;
    if (doubles) {
      const { data: es } = await supabase
        .from('tournament_entries')
        .select('user_id, partner_id')
        .eq('tournament_id', m.tournament_id)
        .in('user_id', [m.entry1_id, m.entry2_id]);
      const pm = new Map((es ?? []).map((e) => [e.user_id, e.partner_id as string | null]));
      a2 = pm.get(m.entry1_id) ?? undefined;
      b2 = pm.get(m.entry2_id) ?? undefined;
    }

    await supabase.functions.invoke('dupr-match', {
      body: {
        source: 'tournament',
        match_id: m.id,
        format: doubles ? 'doubles' : 'singles',
        teamA: { p1: m.entry1_id, p2: a2 },
        teamB: { p1: m.entry2_id, p2: b2 },
        games: [{ a: m.score1, b: m.score2 }],
        event: t.title,
        match_date: t.start_at ? String(t.start_at).slice(0, 10) : undefined,
      },
    });
  } catch {
    // 등록 실패는 조용히 넘어간다(상태는 서버가 기록)
  }
}
