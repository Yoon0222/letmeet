import { supabase } from '@/lib/supabase';
import type { DuprVerifyResult } from '@/lib/types';

// DUPR ID 로 레이팅을 불러와 본인 프로필에 연동(Level A). 서버(dupr-verify)가 처리한다.
export async function verifyDupr(
  duprId: string,
): Promise<{ ok: boolean; result?: DuprVerifyResult; error?: string }> {
  const { data, error } = await supabase.functions.invoke('dupr-verify', {
    body: { dupr_id: duprId.trim() },
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
