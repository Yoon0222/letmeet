-- ============================================================
-- PROD 반영 번들 — 0076 코트별 환불 정책
-- 운영 Supabase(jbvtdthtmrlndduqiikj) SQL Editor 에서 1회 실행.
-- 멱등(idempotent): 여러 번 실행해도 안전.
-- ⚠️ 이 SQL을 먼저 실행한 뒤에 toss-cancel 함수를 prod에 배포할 것
--    (함수가 payments.refund_amount 컬럼을 사용하므로 순서 중요).
-- ============================================================

-- 1) courts.refund_policy — 취소 환불 단계 배열 [{days_before, rate}]
--    기본값 = 기존 전역 정책("전날까지 100%, 당일 0%")과 동일.
alter table public.courts
  add column if not exists refund_policy jsonb not null
  default '[{"days_before":1,"rate":100}]'::jsonb;

-- 2) payments.refund_amount — 실제 환불 금액(부분환불 대응). 0 = 미환불.
alter table public.payments
  add column if not exists refund_amount int not null default 0;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'payments' and constraint_name = 'payments_refund_amount_chk'
  ) then
    alter table public.payments
      add constraint payments_refund_amount_chk check (refund_amount >= 0);
  end if;
end $$;

-- ============================================================
-- 검증 — 아래 두 줄이 모두 true 여야 함
-- ============================================================
select
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='courts' and column_name='refund_policy') as courts_refund_policy_ok,
  exists (select 1 from information_schema.columns
          where table_schema='public' and table_name='payments' and column_name='refund_amount') as payments_refund_amount_ok;

-- 기존 코트가 기본 정책을 받았는지 확인(선택)
select id, name, refund_policy from public.courts limit 5;
