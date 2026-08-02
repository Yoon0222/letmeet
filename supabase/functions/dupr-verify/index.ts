// DUPR 레이팅 연동 (Level A: 레이팅 표시).
//   호출자가 입력한 DUPR ID(또는 이름)로 DUPR 파트너 API 를 조회해
//   복식/단식 레이팅을 가져와 본인 프로필에 저장한다(dupr_status='linked').
//
// 보안: DUPR 파트너 키는 이 함수(서버)에서만 쓴다. 앱에 절대 노출하지 않는다.
// 배포:  supabase functions deploy dupr-verify
// 시크릿(사장님이 등록):
//   supabase secrets set DUPR_API_BASE=https://uat.mydupr.com/api   (UAT / 운영은 운영 URL)
//   supabase secrets set DUPR_CLIENT_KEY=<ClientKey> DUPR_CLIENT_SECRET=<ClientSecret>
//   (선택) supabase secrets set DUPR_API_VERSION=v1.0
//
// DUPR 스펙(OpenAPI 확인, 2026-08):
//   인증  POST {BASE}/auth/{version}/token  헤더 x-authorization: base64(ClientKey:ClientSecret)
//         → { result: { token, expiry } }
//   조회  GET  {BASE}/user/{version}/{id}         → { result: { ratings:{doubles,singles}, fullName } }
//   검색  POST {BASE}/user/{version}/search {query,offset,limit} → { result:{ hits:[...] } }
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

// 파트너 토큰 발급: x-authorization = base64(ClientKey:ClientSecret)
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
    const data = await res.json().catch(() => null);
    return data?.result?.token ?? null;
  } catch {
    return null;
  }
}

// ratings.doubles / ratings.singles 는 문자열("3.521" 또는 "NR"). 유효 범위만 숫자로.
function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 2 && n <= 8 ? Math.round(n * 10) / 10 : null;
}
function parseUser(user: Record<string, unknown> | null) {
  if (!user) return null;
  // deno-lint-ignore no-explicit-any
  const u = user as any;
  const r = u.ratings ?? {};
  return { name: u.fullName ?? null, doubles: num(r.doubles), singles: num(r.singles) };
}

async function lookupPlayer(token: string, duprId: string) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const id = duprId.trim();
  try {
    // 1) DUPR ID 로 직접 조회
    const res = await fetch(`${BASE}/user/${VERSION}/${encodeURIComponent(id)}`, { headers });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const parsed = parseUser(data?.result ?? data);
      if (parsed && (parsed.doubles != null || parsed.singles != null)) return parsed;
    }
    // 2) 이름/이메일 검색 → 첫 결과
    const sres = await fetch(`${BASE}/user/${VERSION}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: id, offset: 0, limit: 1 }),
    });
    if (!sres.ok) return null;
    const sdata = await sres.json().catch(() => null);
    const first = (sdata?.result?.hits ?? sdata?.hits ?? [])[0] ?? null;
    return parseUser(first);
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // 1) 호출자 인증
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // 2) 조회할 DUPR ID
  const body = await req.json().catch(() => ({}));
  let duprId: string | undefined = body?.dupr_id;
  if (!duprId) {
    const { data: prof } = await admin.from('profiles').select('dupr_id').eq('id', caller.id).maybeSingle();
    duprId = prof?.dupr_id ?? undefined;
  }
  if (!duprId) return json({ error: 'dupr_id required' }, 400);

  // 3) DUPR 토큰
  const token = await getDuprToken();
  if (!token) return json({ error: 'dupr_not_configured', message: 'DUPR 파트너 키가 설정되지 않았거나 인증에 실패했어요.' }, 503);

  // 4) 조회 + 파싱
  const ratings = await lookupPlayer(token, duprId);
  if (!ratings || (ratings.doubles == null && ratings.singles == null)) {
    return json({ error: 'not_found', message: 'DUPR 에서 레이팅을 찾지 못했어요. ID 를 확인해 주세요.' }, 404);
  }

  // 5) 본인 프로필에 저장 (service_role → protect_dupr 트리거 통과)
  const primary = ratings.doubles ?? ratings.singles;
  await admin
    .from('profiles')
    .update({
      dupr_id: duprId,
      dupr_doubles: ratings.doubles,
      dupr_singles: ratings.singles,
      dupr_rating: primary,
      dupr_status: 'linked',
      dupr_synced_at: new Date().toISOString(),
    })
    .eq('id', caller.id);

  return json({ ok: true, level: 'linked', ...ratings });
});
