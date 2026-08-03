import { supabase } from '@/lib/supabase';
import type { DuprPoint } from '@/components/ui/dupr-rating-chart';
import type { DuprVerifyResult } from '@/lib/types';

// 프로필 그래프용 히스토리(캐시 테이블 dupr_rating_history). 시간 오름차순.
export async function getDuprHistory(userId: string): Promise<DuprPoint[]> {
  const { data, error } = await supabase
    .from('dupr_rating_history')
    .select('recorded_at, doubles, singles')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    at: new Date(r.recorded_at).getTime(),
    doubles: r.doubles,
    singles: r.singles,
  }));
}

// 경기결과를 DUPR 에 등록(match/create). 우리 프로필ID 를 넘기면 서버가 DUPR ID 로 변환.
export async function submitMatchToDupr(params: {
  source: 'meetup' | 'tournament';
  match_id: string;
  format: 'singles' | 'doubles';
  teamA: { p1: string; p2?: string };
  teamB: { p1: string; p2?: string };
  games: { a: number; b: number }[];
  event?: string;
  match_date?: string;
}): Promise<{ ok: boolean; error?: string; missing?: string[] }> {
  const { data, error } = await supabase.functions.invoke('dupr-match', { body: params });
  if (error) {
    // deno-lint-ignore no-explicit-any
    const body = (error as any).context?.body ?? (error as any).context;
    if (body?.error === 'players_not_connected') return { ok: false, error: 'players_not_connected', missing: body.missing };
    return { ok: false, error: body?.error ?? error.message };
  }
  if (data?.error) return { ok: false, error: data.error, missing: data.missing };
  return { ok: true };
}

// 번개 경기기록 삭제 — DUPR 에서도 제거(등록됐던 경우) 후 로컬 행 삭제.
export async function deleteMeetupMatch(matchId: string): Promise<{ ok: boolean; error?: string }> {
  // 1) DUPR 삭제(등록됐던 경기면). 실패해도 로컬 삭제는 진행.
  await supabase.functions.invoke('dupr-match', { body: { source: 'meetup', match_id: matchId, action: 'delete' } });
  // 2) 로컬 행 삭제(호스트 RLS)
  const { error } = await supabase.from('meetup_matches').delete().eq('id', matchId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// 서버에 히스토리 새로고침 요청(DUPR /history → 캐시 upsert). 갱신된 개수 반환.
export async function refreshDuprHistory(): Promise<number> {
  const { data, error } = await supabase.functions.invoke('dupr-verify', { body: { history: true } });
  if (error || !data?.ok) return 0;
  return data.count ?? 0;
}

// 샘플 히스토리 — 실제 연동 전 차트 UI 확인용(개발/프리뷰에서만 사용).
export const SAMPLE_DUPR_HISTORY: DuprPoint[] = [
  { at: Date.parse('2026-02-05'), doubles: 3.21, singles: 3.05 },
  { at: Date.parse('2026-03-01'), doubles: 3.28, singles: 3.09 },
  { at: Date.parse('2026-03-22'), doubles: 3.35, singles: 3.04 },
  { at: Date.parse('2026-04-14'), doubles: 3.4, singles: 3.18 },
  { at: Date.parse('2026-05-06'), doubles: 3.52, singles: 3.22 },
  { at: Date.parse('2026-05-28'), doubles: 3.58, singles: 3.31 },
  { at: Date.parse('2026-06-20'), doubles: 3.66, singles: 3.35 },
  { at: Date.parse('2026-07-18'), doubles: 3.74, singles: 3.42 },
];

// SSO iframe 용 설정(공개값 base64(clientKey) + SSO base)을 서버(시크릿)에서 받아온다.
export async function getDuprSsoConfig(): Promise<{ clientKeyB64: string; ssoBase: string } | null> {
  const { data, error } = await supabase.functions.invoke('dupr-verify', { body: { config: true } });
  if (error || !data?.clientKeyB64) return null;
  return { clientKeyB64: data.clientKeyB64, ssoBase: data.ssoBase };
}

// DUPR ID 로 레이팅을 불러와 본인 프로필에 연동. 서버(dupr-verify)가 처리한다.
// verified=true 면 SSO 동의를 거친 소유 인증(Level B) → dupr_status='verified' 로 저장.
// SSO 로 온 자격/토큰(운영요건: 엔티틀먼트 확인 + 토큰 저장)
export type DuprSso = { userToken?: string; refreshToken?: string; subscriptions?: unknown };

export async function verifyDupr(
  duprId: string,
  verified = false,
  sso?: DuprSso,
): Promise<{ ok: boolean; result?: DuprVerifyResult; error?: string }> {
  const { data, error } = await supabase.functions.invoke('dupr-verify', {
    body: { dupr_id: duprId.trim(), verified, sso },
  });

  // 서버가 4xx/5xx 로 준 에러 메시지 최대한 사람 친화적으로.
  const decode = (code?: string, msg?: string) => {
    if (code === 'dupr_not_configured') return 'DUPR 연동이 아직 준비 중이에요. 조금만 기다려 주세요.';
    if (code === 'not_found') return msg ?? 'DUPR 에서 레이팅을 찾지 못했어요. ID 를 확인해 주세요.';
    return msg ?? 'DUPR 연동에 실패했어요. 잠시 후 다시 시도해 주세요.';
  };

  if (error) {
    // FunctionsHttpError 면 응답 본문에 error/message 가 있을 수 있음
    // deno-lint-ignore no-explicit-any
    const ctx = (error as any).context;
    const body = ctx?.body ?? ctx;
    return { ok: false, error: decode(body?.error, body?.message) || error.message };
  }
  if (data?.error) return { ok: false, error: decode(data.error, data.message) };
  return { ok: true, result: data as DuprVerifyResult };
}
