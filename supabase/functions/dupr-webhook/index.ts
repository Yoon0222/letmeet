// dupr-webhook: DUPR 레이팅 변경 수신(RATING topic).
//   DUPR 가 구독된 선수의 레이팅이 경기 후 바뀌면 이 URL 로 POST 한다.
//   URL 에 ?s=<DUPR_WEBHOOK_SECRET> 를 붙여 등록했고, 그 값으로 인바운드를 검증한다.
//   (ClientHookRequest 에 secret 필드가 없어 URL 시크릿으로 진위 확인.)
//
// 배포: supabase functions deploy dupr-webhook --no-verify-jwt   ← 공개 엔드포인트
//
// 페이로드(RatingWebhookEnvelope):
//   { clientId, event, message: {
//       duprId, name, timestamp(epoch),
//       rating: { singles:"3.5", doubles:"3.7", matchId, ... }, metrics } }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' };
function ack(body: unknown = { ok: true }, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// 문자열/숫자 레이팅을 정규화. "NR" 등은 null. 범위 2~8만 인정.
function toNum(v: unknown, decimals: number): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  if (!Number.isFinite(n) || n < 2 || n > 8) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return ack({ error: 'method not allowed' }, 405);

  // 1) 시크릿 검증 (등록 URL 의 ?s=)
  const secret = Deno.env.get('DUPR_WEBHOOK_SECRET');
  const s = new URL(req.url).searchParams.get('s');
  if (!secret || s !== secret) return ack({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const body = await req.json().catch(() => null);
  // deno-lint-ignore no-explicit-any
  const msg: any = (body as any)?.message ?? body;
  const duprId: string | undefined = msg?.duprId;
  if (!duprId) return ack({ ok: true, skipped: 'no duprId' }); // 형식 밖이면 조용히 200

  const r = msg?.rating ?? {};
  const dbHist = toNum(r.doubles, 3); // 히스토리는 정밀(3자리)
  const sgHist = toNum(r.singles, 3);
  const dbProf = toNum(r.doubles, 1); // 프로필 컬럼은 numeric(3,1)
  const sgProf = toNum(r.singles, 1);
  const matchId = r.matchId != null ? Number(r.matchId) : null;
  const ts = msg?.timestamp;
  const at = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : (ts ?? Date.now())).toISOString();

  // 2) 대상 유저 찾기 (우리 앱에서 연결한 사람만)
  const { data: prof } = await admin
    .from('profiles')
    .select('id, dupr_doubles, dupr_singles')
    .eq('dupr_id', duprId)
    .maybeSingle();
  if (!prof) return ack({ ok: true, skipped: 'unknown duprId' });

  // 3) 프로필 최신값 갱신 (service_role → protect_dupr 트리거 통과)
  const primary = dbProf ?? sgProf ?? null;
  await admin
    .from('profiles')
    .update({ dupr_doubles: dbProf, dupr_singles: sgProf, dupr_rating: primary, dupr_synced_at: at })
    .eq('id', prof.id);

  // 4) 히스토리 append (그래프용)
  if (dbHist != null || sgHist != null) {
    await admin
      .from('dupr_rating_history')
      .upsert(
        { user_id: prof.id, match_id: matchId, doubles: dbHist, singles: sgHist, recorded_at: at },
        { onConflict: 'user_id,match_id,recorded_at', ignoreDuplicates: true },
      );
  }

  // 5) 변화 있으면 푸시 알림 (best-effort)
  const changed = (dbProf != null && dbProf !== prof.dupr_doubles) || (sgProf != null && sgProf !== prof.dupr_singles);
  if (changed) {
    const parts = [
      dbProf != null ? `복식 ${dbProf.toFixed(1)}` : null,
      sgProf != null ? `단식 ${sgProf.toFixed(1)}` : null,
    ].filter(Boolean);
    try {
      await admin.rpc('push_notify', {
        p_user: prof.id,
        p_type: 'dupr_rating',
        p_title: 'DUPR 레이팅 업데이트',
        p_body: parts.length ? `새 레이팅 · ${parts.join(' · ')}` : '레이팅이 갱신됐어요.',
        p_target_type: null,
        p_target_id: null,
        p_actor: null,
      });
    } catch (_) {
      // 알림 실패는 무시
    }
  }

  return ack({ ok: true, updated: prof.id, changed });
});
