// DUPR 레이팅 연동 (Level A: 레이팅 표시).
//   호출자가 입력한 DUPR ID(또는 이름)로 DUPR 파트너 API 를 조회해
//   복식/단식 레이팅을 가져와 본인 프로필에 저장한다(dupr_status='linked').
//
// 보안: DUPR 파트너 키는 이 함수(서버)에서만 쓴다. 앱에 절대 노출하지 않는다.
// 배포:  supabase functions deploy dupr-verify
// 시크릿(키 승인 후 사장님이 등록):
//   supabase secrets set DUPR_API_BASE=https://backend.mydupr.com
//   supabase secrets set DUPR_BEARER=<파트너 발급 토큰>     (또는 아래 키/시크릿)
//   supabase secrets set DUPR_CLIENT_KEY=... DUPR_CLIENT_SECRET=...
//
// ⚠️ DUPR 파트너 문서가 승인과 함께 오면, 아래 (a)토큰 발급 방식과
//    (b)조회 엔드포인트/응답 필드명을 실제 스펙에 맞춰 확정해야 한다(현재는 최선의 추정).
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

const DUPR_BASE = Deno.env.get('DUPR_API_BASE') ?? 'https://backend.mydupr.com';

// (a) DUPR 파트너 인증 토큰 확보. 파트너가 고정 Bearer 를 주면 그걸 쓰고,
//     client key/secret 방식이면 로그인 엔드포인트로 교환한다.
//     ⚠️ 실제 경로/필드는 파트너 문서로 확정 필요.
async function getDuprToken(): Promise<string | null> {
  const bearer = Deno.env.get('DUPR_BEARER');
  if (bearer) return bearer;

  const key = Deno.env.get('DUPR_CLIENT_KEY');
  const secret = Deno.env.get('DUPR_CLIENT_SECRET');
  if (!key || !secret) return null;

  try {
    // TODO(dupr): 실제 토큰 발급 엔드포인트로 교체 (파트너 문서 확인).
    const res = await fetch(`${DUPR_BASE}/auth/v1/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: key, clientSecret: secret }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.result?.token ?? data?.token ?? data?.accessToken ?? null;
  } catch {
    return null;
  }
}

// (b) DUPR ID/이름으로 플레이어 조회 → 복식/단식 레이팅 파싱.
//     응답 필드명은 방어적으로 여러 후보를 훑는다(문서 확정 시 정리).
function parseRatings(player: Record<string, unknown> | null) {
  if (!player) return null;
  // deno-lint-ignore no-explicit-any
  const p = player as any;
  const ratings = p.ratings ?? p.rating ?? p;
  const num = (v: unknown) => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
    return Number.isFinite(n) && n >= 2 && n <= 8 ? Math.round(n * 10) / 10 : null;
  };
  return {
    name: p.fullName ?? p.name ?? null,
    doubles: num(ratings?.doubles ?? ratings?.doublesRating ?? p.doubles),
    singles: num(ratings?.singles ?? ratings?.singlesRating ?? p.singles),
  };
}

async function lookupPlayer(token: string, duprId: string) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const isNumericId = /^\d+$/.test(duprId.trim());

  try {
    if (isNumericId) {
      // TODO(dupr): get-player 경로 확정
      const res = await fetch(`${DUPR_BASE}/player/v1/${duprId.trim()}`, { headers });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        return parseRatings(data?.result ?? data);
      }
    }
    // 이름/이메일 검색 → 첫 결과
    // TODO(dupr): search 경로/바디 확정
    const res = await fetch(`${DUPR_BASE}/player/v1/search`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: duprId.trim(), limit: 1 }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    const first = (data?.result?.hits ?? data?.result ?? data?.hits ?? [])[0] ?? null;
    return parseRatings(first);
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

  // 2) 조회할 DUPR ID (요청 바디 우선, 없으면 프로필의 dupr_id)
  const body = await req.json().catch(() => ({}));
  let duprId: string | undefined = body?.dupr_id;
  if (!duprId) {
    const { data: prof } = await admin.from('profiles').select('dupr_id').eq('id', caller.id).maybeSingle();
    duprId = prof?.dupr_id ?? undefined;
  }
  if (!duprId) return json({ error: 'dupr_id required' }, 400);

  // 3) DUPR 토큰 (키 미설정이면 아직 준비 단계)
  const token = await getDuprToken();
  if (!token) {
    return json({ error: 'dupr_not_configured', message: 'DUPR 파트너 키가 아직 설정되지 않았습니다.' }, 503);
  }

  // 4) 조회 + 파싱
  const ratings = await lookupPlayer(token, duprId);
  if (!ratings || (ratings.doubles == null && ratings.singles == null)) {
    return json({ error: 'not_found', message: 'DUPR 에서 레이팅을 찾지 못했어요. ID 를 확인해 주세요.' }, 404);
  }

  // 5) 본인 프로필에 저장 (service_role 이라 protect_dupr 트리거 통과)
  const primary = ratings.doubles ?? ratings.singles;
  await admin
    .from('profiles')
    .update({
      dupr_id: duprId,
      dupr_doubles: ratings.doubles,
      dupr_singles: ratings.singles,
      dupr_rating: primary,
      dupr_status: 'linked', // 소유 인증(B)이 아니라 표시 연동(A)
      dupr_synced_at: new Date().toISOString(),
    })
    .eq('id', caller.id);

  return json({ ok: true, level: 'linked', ...ratings });
});
