-- 0076: 코트별 환불 정책 + 부분환불 기록
--
-- courts.refund_policy — 예약 취소 시 적용할 단계(tier) 배열.
--   각 단계 = { days_before, rate } : "예약일 days_before일 전까지 취소하면 rate% 환불".
--   평가: (예약일 - 오늘, KST) = 남은 일수 d.  days_before 내림차순으로 훑어
--         d >= days_before 인 첫 단계의 rate 적용. 해당 없으면(더 임박) 0%.
--   기본값 = 기존 전역 정책과 동일("전날까지 100%, 당일 0%").
alter table public.courts
  add column if not exists refund_policy jsonb not null
  default '[{"days_before":1,"rate":100}]'::jsonb;

-- payments.refund_amount — 실제 환불된 금액(부분환불 대응). 0 = 미환불.
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
