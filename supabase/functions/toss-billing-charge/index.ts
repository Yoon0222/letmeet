// toss-billing-charge: 구독 정기 과금 (pg_cron 일1회 호출).
//   인증: x-cron-secret 헤더 == CRON_SECRET. (게이트웨이 통과용 anon Authorization 은 별도)
//   0) 무료 체험 후 첫 결제 7일 전 사전 안내(가격·해지 방법)
//   1) 해지 후 기간 만료 구독 → 클럽 강등
//   2) 도래한 구독 과금 — 예약된 플랜 변경(pending_plan) 적용, 성공=연장 / 확정 거절=재시도·3회 초과 강등
//   3) 다시 시도되지 않은 미확정 주문 정리(결제돼 있었으면 환불)
//
//   이중 결제 방지(_shared/billing.ts 의 chargeWithIntent):
//   · 주문번호 = 구독 + 결제 예정일 + 시도 차수 + 플랜. 같은 상태에서 다시 실행돼도 같은 주문이라 한 번만 결제된다.
//   · 이력에 이미 결과가 기록된 주문번호는 토스에 다시 보내지 않는다.
//   · 결과를 모르는 응답(네트워크 오류·5xx·처리 중)은 실패로 치지 않고 상태를 그대로 둔다 → 다음 실행이 같은 주문번호로 확인.
//   · 결과를 모르는 주문이 남은 채 다른 주문으로 결제하게 되면, 남은 주문부터 확정한다(결제돼 있었으면 환불).
//   · 결과 반영은 DB 함수가 "과금 직전에 본 예정 상태"와 같을 때만 한다(뒤늦은 쓰기가 덮어쓰지 않게).
//   응답의 unknown·mismatch 가 0 이 아니면 사람이 확인할 것(log 에 주문번호 끝자리와 토스 응답 상태가 남는다).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import {
  CORS, addMonthAnchored, chargeWithIntent, json, loadPlans, planTag, refundUnapplied, rpcWithRetry, settlePendingOrder, ymd,
} from '../_shared/billing.ts';

const MAX_FAILS = 3; // 이 횟수 초과 실패 시 강등
const NOTICE_DAYS = 7; // 첫 결제 사전 안내 시점
const RETRY_HOURS = 23; // 다음 날 실행이 조금 일러도 잡히도록 24시간보다 짧게
const SWEEP_AFTER_MINUTES = 60; // 이보다 오래된 미확정 주문은 사용자가 다시 시도하지 않은 것으로 보고 정리

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!cronSecret || (req.headers.get('x-cron-secret') ?? '') !== cronSecret) {
    return json({ error: 'unauthorized' }, 401);
  }
  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'TOSS_SECRET_KEY missing' }, 500);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const now = new Date();
  const nowIso = now.toISOString();

  let plans;
  try {
    plans = await loadPlans(admin);
  } catch (err) {
    // 가격표를 못 읽으면 아무것도 결제하지 않는다 — 다음 실행에서 같은 주문번호로 안전하게 다시 시도
    return json({ error: 'plans_load_failed', detail: String(err).slice(0, 200) }, 500);
  }

  // 0) 체험 중 카드를 등록한 구독의 첫 결제 사전 안내 — 무료 → 유료 전환 전에 가격과 해지 방법을 알린다
  const noticeUntil = new Date(now.getTime() + NOTICE_DAYS * 86400000).toISOString();
  const { data: upcoming, error: upcomingErr } = await admin
    .from('club_subscriptions')
    .select('id, club_id, owner_id, plan, pending_plan, amount, next_charge_at')
    .eq('status', 'active')
    .is('last_charge_at', null)
    .is('first_charge_notified_at', null)
    .gt('next_charge_at', nowIso)
    .lte('next_charge_at', noticeUntil);
  let noticed = 0;
  for (const s of upcomingErr ? [] : (upcoming ?? [])) {
    const planKey: string = s.pending_plan ?? s.plan;
    const price: number | undefined = s.pending_plan ? plans[planKey]?.monthly_price : s.amount;
    if (!price) continue; // 금액을 모르면 틀린 안내를 보내지 않는다
    const kst = new Date(new Date(s.next_charge_at).getTime() + 9 * 3600000);
    const { error } = await admin.rpc('push_notify', {
      p_user: s.owner_id,
      p_type: 'system',
      p_title: '무료 체험이 곧 끝나요',
      p_body: `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일에 ${plans[planKey]?.name ?? '프리미엄'} 월 ${price.toLocaleString('ko-KR')}원이 자동 결제돼요. 원하지 않으면 클럽 > 플랜 관리에서 해지할 수 있어요.`,
      p_target_type: 'club',
      p_target_id: s.club_id,
    });
    if (!error) {
      await admin.from('club_subscriptions').update({ first_charge_notified_at: nowIso }).eq('id', s.id);
      noticed++;
    }
  }

  // 1) 해지 후 기간 만료 → 클럽 강등(멱등: premium_status='active' 인 것만)
  const { data: expired } = await admin
    .from('club_subscriptions')
    .select('id, club_id')
    .eq('status', 'canceled')
    .lte('current_period_end', nowIso);
  for (const e of expired ?? []) {
    await admin.from('clubs').update({ premium_status: 'canceled' }).eq('id', e.club_id).eq('premium_status', 'active');
  }

  // 2) 도래한 과금
  const { data: due, error: dueErr } = await admin
    .from('club_subscriptions')
    .select('*')
    .in('status', ['active', 'past_due'])
    .not('next_charge_at', 'is', null)
    .lte('next_charge_at', nowIso);
  if (dueErr) return json({ error: 'due_load_failed', detail: dueErr.message }, 500);

  let charged = 0;
  let failed = 0;
  let unknown = 0;
  let mismatch = 0;
  let refunded = 0; // 결제는 됐지만 그 사이 구독이 바뀌어 반영하지 않고 환불한 건
  let skipped = 0;
  const attempted = new Set<string>(); // 이번 실행에서 과금을 시도한 클럽
  const log: string[] = []; // 주문별 처리 요약(주문번호 끝자리·결과·토스 응답 상태) — 응답에 실어 사후 확인에 쓴다
  for (const s of due ?? []) {
    // 예약된 플랜 변경(다운그레이드)은 이번 갱신부터 적용. 가격은 플랜이 바뀔 때만 가격표에서 다시 읽는다
    // (같은 플랜의 가격 인상은 동의 절차가 필요하므로 기존 금액 유지).
    const planKey: string = s.pending_plan ?? s.plan;
    const amount: number | undefined = s.pending_plan ? plans[planKey]?.monthly_price : s.amount;
    if (!amount || amount <= 0) {
      // 바뀔 플랜의 가격을 모르면 결제하지 않고 건너뛴다(잘못된 금액 청구 방지)
      skipped++;
      continue;
    }
    const planName = plans[planKey]?.name ?? '프리미엄';
    const dueAt = new Date(s.next_charge_at);
    const fails: number = s.fail_count ?? 0;
    const kind = s.last_charge_at ? 'renewal' : 'initial';
    // 새 기간은 이전 기간의 끝(원래 결제 예정일)에서 이어진다 — 실패 후 재시도로 늦게 결제돼도 기간이 밀리지 않게.
    const base = s.current_period_end ? new Date(s.current_period_end) : dueAt;
    // 같은 구독·같은 예정일·같은 시도 차수·같은 플랜이면 주문번호가 같다 → 중복 실행에도 한 번만 결제.
    // 예약 변경으로 플랜(금액)이 바뀌면 다른 주문이 되고, 앞선 주문이 결제돼 있었다면 환불 후 새로 결제한다.
    const orderId = `sub-${s.id}-${ymd(dueAt)}-${fails}-${planTag(planKey)}`;
    attempted.add(s.club_id);
    // 목록을 읽은 뒤 그 사이에 해지·카드 재등록·플랜 변경이 있었으면 결제하지 않는다(다음 실행이 새 상태로 처리)
    const { data: fresh, error: freshErr } = await admin
      .from('club_subscriptions')
      .select('status, next_charge_at, fail_count, plan, pending_plan')
      .eq('id', s.id)
      .maybeSingle();
    if (freshErr) {
      console.error('subscription recheck failed', { subscription: s.id, message: freshErr.message });
      unknown++;
      continue;
    }
    if (!fresh || fresh.status !== s.status || fresh.next_charge_at !== s.next_charge_at
      || fresh.fail_count !== s.fail_count || fresh.plan !== s.plan || fresh.pending_plan !== s.pending_plan) {
      skipped++;
      continue;
    }
    const res = await chargeWithIntent(admin, secret, {
      clubId: s.club_id, kind, billingKey: s.billing_key, customerKey: s.customer_key, amount, orderId,
      orderName: `${planName} 구독 ${s.last_charge_at ? '갱신' : '시작'}`,
    });
    log.push(`${orderId.slice(-18)} ${res.kind} [${res.trace ?? ''}]`);

    if (res.kind === 'unknown') {
      // 결제됐을 수도 있다 — 실패로 치지 않고 그대로 둔다. 다음 실행이 같은 주문번호로 결과를 확인한다.
      console.error('charge result unknown', { subscription: s.id, orderId, reason: res.reason, trace: res.trace });
      unknown++;
      continue;
    }

    if (res.kind === 'approved') {
      if (res.amount !== amount) {
        // 같은 주문번호가 다른 금액으로 결제돼 있었다(가격표가 바뀐 경우 등) — 반영하지 않고 환불한다.
        // 환불되면 그 주문은 이력에 '실패'로 닫히고, 다음 실행이 실패 차수를 올려 새 주문으로 올바른 금액을 결제한다.
        console.error('charge amount mismatch', { subscription: s.id, orderId, expected: amount, paid: res.amount, trace: res.trace });
        await refundUnapplied(admin, secret, s.club_id, { order_id: orderId, kind, amount: res.amount }, res.paymentKey, '금액 불일치 자동 환불');
        mismatch++;
        continue;
      }
      const anchorDay: number = s.billing_anchor_day ?? base.getUTCDate();
      const end = addMonthAnchored(base, anchorDay);
      const { data: outcome, error } = await rpcWithRetry(admin, 'club_billing_commit_renewal', {
        p_sub_id: s.id,
        p_expect_next: s.next_charge_at,
        p_expect_fails: fails,
        p_expect_plan: s.plan,
        p_expect_pending: s.pending_plan ?? null,
        p_plan: planKey,
        p_amount: amount,
        p_period_start: base.toISOString(),
        p_period_end: end.toISOString(),
        p_anchor_day: anchorDay,
        p_kind: kind,
        p_order_id: orderId,
        p_payment_key: res.paymentKey,
      });
      if (error) {
        // 결제는 됐는데 반영 실패 — 상태가 그대로라 다음 실행이 같은 주문번호로 (재결제 없이) 다시 반영한다
        console.error('club_billing_commit_renewal failed', { subscription: s.id, orderId, paymentKey: res.paymentKey, message: error.message });
        unknown++;
        continue;
      }
      if (outcome === 'ok') {
        charged++;
      } else if (outcome === 'stale') {
        // 결제는 됐는데 그 사이 구독이 바뀌었다(해지·카드 재등록·플랜 변경) → 반영하지 않고 바로 환불
        const back = await refundUnapplied(admin, secret, s.club_id, { order_id: orderId, kind, amount: res.amount }, res.paymentKey, '구독 변경으로 미반영 — 자동 환불');
        console.error('renewal not applied, refund', { subscription: s.id, orderId, refunded: back });
        if (back) refunded++;
        else unknown++; // 환불까지 못 했으면 미확정 주문으로 남아 다음 실행(정리 단계)이 처리한다
      } else if (outcome !== 'duplicate') {
        // 'closed'(다른 요청이 환불·취소로 닫은 주문) 등 — 다음 실행이 이력을 보고 실패로 처리한다
        console.error('renewal not applied', { subscription: s.id, orderId, outcome });
        unknown++;
      }
    } else {
      const retryAt = new Date(now.getTime() + RETRY_HOURS * 3600000);
      const { error } = await rpcWithRetry(admin, 'club_billing_commit_failure', {
        p_sub_id: s.id,
        p_expect_next: s.next_charge_at,
        p_expect_fails: fails,
        p_plan: planKey,
        p_amount: amount,
        p_kind: kind,
        p_order_id: orderId,
        p_reason: res.reason,
        p_max_fails: MAX_FAILS,
        p_retry_at: retryAt.toISOString(),
      });
      if (error) console.error('club_billing_commit_failure failed', { subscription: s.id, orderId, message: error.message });
      failed++;
    }
  }

  // 3) 남은 미확정 주문 정리 — 결과를 모른 채 끝나고 다시 시도되지 않은 주문(카드 등록·업그레이드 중 이탈 등).
  //    결제돼 있었으면 환불한다. 이번 실행에서 과금을 시도한 클럽은 건드리지 않는다(다음 실행이 같은 주문으로 확인).
  const sweepBefore = new Date(now.getTime() - SWEEP_AFTER_MINUTES * 60000).toISOString();
  const { data: leftovers } = await admin.from('club_billing_pending_orders').select('club_id').lt('created_at', sweepBefore);
  let settled = 0;
  let stuck = 0; // 정리하지 못한 주문(조회·환불 실패 등) — 계속 남으면 사람이 확인해야 한다
  for (const p of leftovers ?? []) {
    if (attempted.has(p.club_id)) continue;
    if ((await settlePendingOrder(admin, secret, p.club_id)) === 'clear') settled++;
    else stuck++;
  }

  // 4) 사람이 확인해야 하는 건이 있으면 최고관리자에게 알린다(결과 불명이 며칠 이어지면 그 구독은 결제 없이 유지되고 있는 것)
  if (unknown + mismatch + refunded + stuck > 0) {
    const { data: admins } = await admin.from('profiles').select('id').eq('role', 'super_admin');
    for (const a of admins ?? []) {
      await admin.rpc('push_notify', {
        p_user: a.id,
        p_type: 'system',
        p_title: '구독 결제 확인 필요',
        p_body: `결과 불명 ${unknown}건 · 금액 불일치 ${mismatch}건 · 미반영 환불 ${refunded}건 · 정리 못 한 주문 ${stuck}건. 함수 로그(toss-billing-charge)를 확인해주세요.`,
      });
    }
  }

  return json({
    ok: true, noticed, charged, failed, unknown, mismatch, refunded, skipped, settled, stuck, expired: (expired ?? []).length, log: log.slice(0, 50),
  });
});
