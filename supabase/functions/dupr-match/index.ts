// dupr-match: 피넛 경기결과를 DUPR 에 등록(match/create).
//   번개(meetup_matches) / 대회(tournament_matches) 공용.
//   우리 프로필 ID 를 받아 서버에서 DUPR ID 로 변환(키·ID 서버 보관).
//   등록되면 DUPR 레이팅 재계산 → RATING 웹훅 → 그래프 자동 갱신으로 이어진다.
//
// 배포: supabase functions deploy dupr-match --project-ref <ref>
//
// 입력(JSON):
//   { source:'meetup'|'tournament', match_id, format:'singles'|'doubles',
//     match_date?, event?, teamA:{p1,p2?}, teamB:{p1,p2?}, games:[{a,b}...] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

const BASE = (Deno.env.get('DUPR_API_BASE') ?? 'https://uat.mydupr.com/api').replace(/\/$/, '');
const VERSION = Deno.env.get('DUPR_API_VERSION') ?? 'v1.0';

async function getDuprToken(): Promise<string | null> {
  const key = Deno.env.get('DUPR_CLIENT_KEY');
  const secret = Deno.env.get('DUPR_CLIENT_SECRET');
  if (!key || !secret) return null;
  try {
    const res = await fetch(`${BASE}/auth/${VERSION}/token`, {
      method: 'POST',
      headers: { 'x-authorization': btoa(`${key}:${secret}`), 'Content-Type': 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json().catch(() => null))?.result?.token ?? null;
  } catch {
    return null;
  }
}

type Team = { p1?: string; p2?: string };
type Game = { a?: number; b?: number };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1) 호출자 인증
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const source: string = body?.source;
  const matchId: string = body?.match_id;
  const format: string = (body?.format ?? 'doubles').toLowerCase();
  const teamA: Team = body?.teamA ?? {};
  const teamB: Team = body?.teamB ?? {};
  const games: Game[] = Array.isArray(body?.games) ? body.games : [];
  if (!['meetup', 'tournament'].includes(source) || !matchId) return json({ error: 'bad_request' }, 400);
  if (!teamA.p1 || !teamB.p1 || games.length === 0) return json({ error: 'incomplete_match' }, 400);

  // 2) 권한: meetup 은 호스트만. tournament 는 organizer/super_admin.
  if (source === 'meetup') {
    const { data: mm } = await admin.from('meetup_matches').select('meetup_id').eq('id', matchId).maybeSingle();
    if (!mm) return json({ error: 'not_found' }, 404);
    const { data: mt } = await admin.from('meetups').select('host_id, title').eq('id', mm.meetup_id).maybeSingle();
    if (!mt || mt.host_id !== caller.id) return json({ error: 'forbidden' }, 403);
    body.__event = body?.event ?? mt.title;
  } else {
    const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
    if (!prof || !['organizer', 'court_manager', 'super_admin'].includes(prof.role)) return json({ error: 'forbidden' }, 403);
  }

  // 3) 우리 프로필 ID → DUPR ID 변환(연결된 사람만)
  const ids = [teamA.p1, teamA.p2, teamB.p1, teamB.p2].filter(Boolean) as string[];
  const { data: profs } = await admin.from('profiles').select('id, dupr_id, dupr_status').in('id', ids);
  const map = new Map((profs ?? []).map((p) => [p.id, p]));
  const duprOf = (uid?: string) => (uid ? map.get(uid)?.dupr_id ?? null : null);
  const missing = ids.filter((uid) => !map.get(uid)?.dupr_id || map.get(uid)?.dupr_status !== 'verified');
  if (missing.length > 0) return json({ error: 'players_not_connected', missing }, 422);

  // 4) DUPR ExternalMatchRequest 구성
  const gN = (i: number, side: 'a' | 'b') => {
    const v = games[i]?.[side];
    return typeof v === 'number' ? Math.max(0, Math.round(v)) : 0;
  };
  const teamPayload = (t: Team, side: 'a' | 'b') => ({
    player1: duprOf(t.p1),
    ...(t.p2 ? { player2: duprOf(t.p2) } : {}),
    game1: gN(0, side),
    game2: games[1] ? gN(1, side) : undefined,
    game3: games[2] ? gN(2, side) : undefined,
    game4: games[3] ? gN(3, side) : undefined,
    game5: games[4] ? gN(4, side) : undefined,
  });
  const identifier = `${source}:${matchId}`;
  const matchDate = (body?.match_date ?? new Date().toISOString().slice(0, 10)) as string;
  const request = {
    matchDate,
    format: format === 'singles' ? 'SINGLES' : 'DOUBLES',
    event: String(body?.__event ?? body?.event ?? '피넛 경기').slice(0, 120),
    identifier,
    matchType: 'SIDEOUT',
    matchCompletionType: 'COMPLETED',
    teamA: teamPayload(teamA, 'a'),
    teamB: teamPayload(teamB, 'b'),
  };

  const table = source === 'meetup' ? 'meetup_matches' : 'tournament_matches';

  // 5) DUPR 등록
  const token = await getDuprToken();
  if (!token) {
    await admin.from(table).update({ dupr_status: 'failed', dupr_error: 'no_token' }).eq('id', matchId);
    return json({ error: 'dupr_not_configured' }, 503);
  }
  let ok = false;
  let respText = '';
  try {
    const res = await fetch(`${BASE}/match/${VERSION}/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    respText = await res.text().catch(() => '');
    ok = res.ok && !/"status"\s*:\s*"FAILURE"/.test(respText);
  } catch (e) {
    respText = String(e);
  }

  // 6) 소스 행 상태 갱신
  await admin
    .from(table)
    .update({
      dupr_identifier: identifier,
      dupr_status: ok ? 'submitted' : 'failed',
      dupr_submitted_at: ok ? new Date().toISOString() : null,
      dupr_error: ok ? null : respText.slice(0, 500),
    })
    .eq('id', matchId);

  if (!ok) return json({ error: 'submit_failed', detail: respText.slice(0, 300) }, 502);
  return json({ ok: true, identifier });
});
