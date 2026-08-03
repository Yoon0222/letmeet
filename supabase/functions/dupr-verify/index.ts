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
// 히스토리(그래프)용 — 3자리 정밀도 유지(테이블 numeric(4,3)).
function num3(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 2 && n <= 8 ? Math.round(n * 1000) / 1000 : null;
}
function parseUser(user: Record<string, unknown> | null) {
  if (!user) return null;
  // deno-lint-ignore no-explicit-any
  const u = user as any;
  const r = u.ratings ?? {};
  return { name: u.fullName ?? null, doubles: num(r.doubles), singles: num(r.singles) };
}

// 유저를 찾으면 레이팅이 없어도(NR/null) found=true 로 돌려준다.
// (레이팅 유무는 연결 성공 여부와 별개 — 미채점 계정도 정상 연결.)
type Found = { found: true; name: string | null; doubles: number | null; singles: number | null };
async function lookupPlayer(token: string, duprId: string): Promise<Found | null> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const id = duprId.trim();
  try {
    // 1) DUPR ID 로 직접 조회 — 200 이면 유저 존재로 간주(레이팅 없어도 OK)
    const res = await fetch(`${BASE}/user/${VERSION}/${encodeURIComponent(id)}`, { headers });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      const u = data?.result ?? data;
      // deno-lint-ignore no-explicit-any
      const any = u as any;
      if (any && (any.id || any.fullName || any.ratings)) {
        return { found: true, ...parseUser(any) };
      }
    }
    // 2) 이름 검색 → 첫 결과(직접 조회가 안 됐을 때만)
    const sres = await fetch(`${BASE}/user/${VERSION}/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: id, offset: 0, limit: 1 }),
    });
    if (!sres.ok) return null;
    const sdata = await sres.json().catch(() => null);
    const first = (sdata?.result?.hits ?? sdata?.hits ?? [])[0] ?? null;
    if (!first) return null;
    return { found: true, ...parseUser(first) };
  } catch {
    return null;
  }
}

// 경기별 레이팅 변화(그래프용). POST /history?duprId=&offset=&limit=
// 응답: { result: [{ matchId, singles, doubles, created(epoch), ... }] } 또는 { result: { results:[...] } }
type HistPoint = { matchId: number | null; doubles: number | null; singles: number | null; at: string };
async function fetchHistory(token: string, duprId: string): Promise<HistPoint[]> {
  try {
    const url = `${BASE}/history?duprId=${encodeURIComponent(duprId.trim())}&offset=0&limit=100`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => null);
    const rows: unknown[] = data?.result?.results ?? data?.result ?? data?.results ?? [];
    if (!Array.isArray(rows)) return [];
    const toIso = (created: unknown): string | null => {
      const n = typeof created === 'number' ? created : Number(created);
      if (!Number.isFinite(n)) return null;
      const ms = n < 1e12 ? n * 1000 : n; // 초/밀리초 자동 판별
      return new Date(ms).toISOString();
    };
    return rows
      // deno-lint-ignore no-explicit-any
      .map((r: any) => ({
        matchId: r?.matchId != null ? Number(r.matchId) : null,
        doubles: num3(r?.doubles),
        singles: num3(r?.singles),
        at: toIso(r?.created),
      }))
      .filter((r): r is HistPoint => r.at != null && (r.doubles != null || r.singles != null));
  } catch {
    return [];
  }
}

// 이 선수의 레이팅 변경을 구독(RATING 웹훅). 이후 경기 후 자동으로 dupr-webhook 이 호출됨.
async function subscribeRating(token: string, duprId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/user/${VERSION}/subscribe/webhook-event`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ duprIds: [duprId.trim()], topic: 'RATING' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// deno-lint-ignore no-explicit-any
async function saveHistory(admin: any, userId: string, points: HistPoint[]) {
  if (points.length === 0) return;
  const rows = points.map((p) => ({
    user_id: userId,
    match_id: p.matchId,
    doubles: p.doubles,
    singles: p.singles,
    recorded_at: p.at,
  }));
  // 같은 (user,match,시각) 중복은 무시. 캐시라 실패해도 치명적이지 않음.
  await admin.from('dupr_rating_history').upsert(rows, { onConflict: 'user_id,match_id,recorded_at', ignoreDuplicates: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const body = await req.json().catch(() => ({}));

  // 0) SSO 설정 요청 — iframe 용 base64(clientKey) + SSO base 를 돌려준다.
  //    clientKey 는 iframe URL 에 그대로 노출되는 공개값이라 인증 이전에 처리한다
  //    (세션 전파 지연에도 SSO 화면이 견고하도록). clientSecret 은 절대 안 준다.
  if (body?.config === true) {
    const key = Deno.env.get('DUPR_CLIENT_KEY');
    if (!key) return json({ error: 'dupr_not_configured' }, 503);
    return json({
      clientKeyB64: btoa(key),
      ssoBase: Deno.env.get('DUPR_SSO_BASE') ?? 'https://uat.dupr.gg/login-external-app',
    });
  }

  // 0.5) 웹훅 셋업(관리자용, 시크릿 게이트) — 스키마 조회 / URL 등록 / 구독목록.
  //      body: { setup:true, secret, register?:bool, list?:bool }
  if (body?.setup === true) {
    const secret = Deno.env.get('DUPR_WEBHOOK_SECRET');
    if (!secret || body?.secret !== secret) return json({ error: 'forbidden' }, 403);
    const token = await getDuprToken();
    if (!token) return json({ error: 'dupr_not_configured' }, 503);
    const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const out: Record<string, unknown> = {};
    // RATING 페이로드 스키마
    const sc = await fetch(`${BASE}/${VERSION}/webhook/schema/RATING`, { headers: h });
    out.schemaStatus = sc.status;
    out.schema = await sc.text().catch(() => null);
    // 우리 웹훅 URL 등록(topics=[RATING])
    if (body?.register === true) {
      const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/dupr-webhook?s=${secret}`;
      const rg = await fetch(`${BASE}/${VERSION}/webhook`, {
        method: 'POST', headers: h, body: JSON.stringify({ webhookUrl, topics: ['RATING'] }),
      });
      out.registerStatus = rg.status;
      out.registerBody = await rg.text().catch(() => null);
      out.webhookUrl = webhookUrl;
    }
    // 현재 구독중인 duprId 목록
    if (body?.list === true) {
      const ls = await fetch(`${BASE}/${VERSION}/subscribe/rating-changes`, { headers: h });
      out.listStatus = ls.status;
      out.listBody = await ls.text().catch(() => null);
    }
    return json(out);
  }

  // 1) 호출자 인증 — 조회/검증 요청은 로그인 필요
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const caller = userData?.user;
  if (!caller) return json({ error: 'unauthorized' }, 401);

  // 2) 조회할 DUPR ID
  let duprId: string | undefined = body?.dupr_id;
  if (!duprId) {
    const { data: prof } = await admin.from('profiles').select('dupr_id').eq('id', caller.id).maybeSingle();
    duprId = prof?.dupr_id ?? undefined;
  }
  if (!duprId) return json({ error: 'dupr_id required' }, 400);

  // 3) DUPR 토큰
  const token = await getDuprToken();
  if (!token) return json({ error: 'dupr_not_configured', message: 'DUPR 파트너 키가 설정되지 않았거나 인증에 실패했어요.' }, 503);

  // 2.5) 히스토리 새로고침만 요청 — 캐시 갱신 후 개수 반환(그래프 수동 새로고침용)
  if (body?.history === true) {
    const pts = await fetchHistory(token, duprId);
    await saveHistory(admin, caller.id, pts);
    return json({ ok: true, count: pts.length });
  }

  // 4) 조회 — 유저가 존재하면 레이팅이 없어도(NR) 연결 성공. 아예 못 찾을 때만 실패.
  const found = await lookupPlayer(token, duprId);
  if (!found) {
    return json({ error: 'not_found', message: 'DUPR 에서 계정을 찾지 못했어요. ID 를 확인해 주세요.' }, 404);
  }

  // 5) 본인 프로필에 저장 (service_role → protect_dupr 트리거 통과)
  //    verified=true(SSO 동의 경유) → 소유 인증. 아니면 표시 연동.
  const isVerified = body?.verified === true;
  const status = isVerified ? 'verified' : 'linked';
  const primary = found.doubles ?? found.singles ?? null;
  await admin
    .from('profiles')
    .update({
      dupr_id: duprId,
      dupr_doubles: found.doubles,
      dupr_singles: found.singles,
      dupr_rating: primary,
      dupr_status: status,
      dupr_verified: isVerified,
      dupr_synced_at: new Date().toISOString(),
    })
    .eq('id', caller.id);

  // 6) 그래프용 히스토리 캐시 + 이후 변경 자동 수신 구독. 실패해도 연결은 성공 처리.
  const hist = await fetchHistory(token, duprId);
  await saveHistory(admin, caller.id, hist);
  await subscribeRating(token, duprId);

  // unrated: 계정은 연결됐지만 아직 레이팅이 없는 상태(NR)
  return json({ ok: true, level: status, name: found.name, doubles: found.doubles, singles: found.singles, unrated: found.doubles == null && found.singles == null });
});
