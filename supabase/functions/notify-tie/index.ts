// 단체전 타이 차례 알림 — 대회 주최자/슈퍼관리자가 타이(팀 대 팀)의 양 팀 선수들에게 푸시 발송.
// 배포:  supabase functions deploy notify-tie
// 호출:  supabase.functions.invoke('notify-tie', { body: { tie_id } })
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const { tie_id } = await req.json().catch(() => ({}));
  if (!tie_id) return json({ error: 'tie_id required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // 1) 호출자 인증
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // 2) 타이 + 대회(주최자) 조회
  const { data: tie } = await admin
    .from('tournament_ties')
    .select('team1_id, team2_id, court_id, tournaments(organizer_id)')
    .eq('id', tie_id)
    .maybeSingle();
  if (!tie) return json({ error: 'tie not found' }, 404);

  // 3) 권한: 대회 주최자 또는 슈퍼관리자
  const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const organizerId = (tie as any).tournaments?.organizer_id;
  if (organizerId !== caller.id && prof?.role !== 'super_admin') {
    return json({ error: 'forbidden' }, 403);
  }

  // 4) 양 팀 팀원 수집
  const teamIds = [tie.team1_id, tie.team2_id].filter(Boolean) as string[];
  if (teamIds.length === 0) return json({ sent: 0, note: 'no teams' });
  const { data: members } = await admin
    .from('tournament_team_members')
    .select('user_id')
    .in('team_id', teamIds);
  const userIds = [...new Set((members ?? []).map((m) => m.user_id))];
  if (userIds.length === 0) return json({ sent: 0, note: 'no members' });

  // 5) push_token 수집 → Expo 푸시 발송
  const { data: profiles } = await admin.from('profiles').select('push_token').in('id', userIds);
  const tokens = (profiles ?? []).map((p) => p.push_token).filter(Boolean) as string[];
  if (tokens.length === 0) return json({ sent: 0, note: 'no push tokens' });

  // 6) 코트 이름(있으면)
  let courtName = '';
  if (tie.court_id) {
    const { data: c } = await admin.from('tournament_courts').select('name').eq('id', tie.court_id).maybeSingle();
    courtName = c?.name ? ` (${c.name} 코트)` : '';
  }

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: '우리 팀 차례예요',
    body: `곧 팀 경기가 시작됩니다${courtName}. 코트로 이동해 주세요!`,
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);
  return json({ sent: tokens.length, result });
});
