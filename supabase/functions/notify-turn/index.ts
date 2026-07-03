// 내 경기 차례 알림 — 대회 주최자/슈퍼관리자가 특정 경기의 선수들에게 푸시 발송.
// 배포:  supabase functions deploy notify-turn
// 호출:  supabase.functions.invoke('notify-turn', { body: { match_id } })
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

  const { match_id } = await req.json().catch(() => ({}));
  if (!match_id) return json({ error: 'match_id required' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // 1) 호출자 인증
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // 2) 경기 + 대회(주최자) 조회
  const { data: match } = await admin
    .from('tournament_matches')
    .select('tournament_id, entry1_id, entry2_id, tournaments(organizer_id)')
    .eq('id', match_id)
    .maybeSingle();
  if (!match) return json({ error: 'match not found' }, 404);

  // 3) 권한: 대회 주최자 또는 슈퍼관리자
  const { data: prof } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
  // deno-lint-ignore no-explicit-any
  const organizerId = (match as any).tournaments?.organizer_id;
  if (organizerId !== caller.id && prof?.role !== 'super_admin') {
    return json({ error: 'forbidden' }, 403);
  }

  // 4) 대상 선수 + 파트너 수집
  const entryIds = [match.entry1_id, match.entry2_id].filter(Boolean) as string[];
  if (entryIds.length === 0) return json({ sent: 0, note: 'no players' });
  const { data: entries } = await admin
    .from('tournament_entries')
    .select('user_id, partner_id')
    .eq('tournament_id', match.tournament_id)
    .in('user_id', entryIds);
  const userIds = new Set<string>();
  for (const e of entries ?? []) {
    userIds.add(e.user_id);
    if (e.partner_id) userIds.add(e.partner_id);
  }

  // 5) push_token 수집 → Expo 푸시 발송
  const { data: profiles } = await admin
    .from('profiles')
    .select('push_token')
    .in('id', [...userIds]);
  const tokens = (profiles ?? []).map((p) => p.push_token).filter(Boolean) as string[];
  if (tokens.length === 0) return json({ sent: 0, note: 'no push tokens' });

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: '내 경기 차례예요',
    body: '곧 경기가 시작됩니다. 코트로 이동해 주세요!',
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => null);
  return json({ sent: tokens.length, result });
});
