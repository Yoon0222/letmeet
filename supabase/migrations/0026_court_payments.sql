-- 0026: 코트 예약 결제 (PG 연동 토대)
-- 주문(court_payments) 1건 = 예약 슬롯 N개(court_reservations)에 대한 결제.
-- 흐름: 슬롯 선택 → 주문(pending) + 슬롯 홀드 → PG 결제 → 서버 검증 → paid.
--        실패/취소/24h미결제 → 슬롯 해제 + 주문 canceled/failed.
-- 서버 검증(Edge Function)은 service_role 로 상태를 paid 로 바꾼다(RLS 우회).

create table if not exists public.court_payments (
  id           uuid primary key default uuid_generate_v4(),
  order_id     text not null unique,                 -- 가맹점 주문번호(멱등키)
  user_id      uuid not null references public.profiles(id) on delete cascade,
  court_id     uuid not null references public.courts(id) on delete cascade,
  slot_date    date not null,
  hours        int[] not null default '{}',          -- 결제한 시간대(로그/표시용)
  amount       int not null default 0,               -- 결제 금액(원)
  status       text not null default 'pending'
               check (status in ('pending','paid','failed','canceled','refunded')),
  provider     text not null default 'portone',      -- portone | toss | mock
  provider_tx  text,                                 -- PG 거래 고유번호(paymentId 등)
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists court_payments_user_idx on public.court_payments (user_id, created_at desc);
create index if not exists court_payments_status_idx on public.court_payments (status, created_at);

alter table public.court_payments enable row level security;
-- 조회: 본인 / 코트 owner / 최고관리자
drop policy if exists "payments_select" on public.court_payments;
create policy "payments_select" on public.court_payments
  for select using (
    auth.uid() = user_id
    or public.my_role() = 'super_admin'
    or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  );
-- 생성: 본인 주문만
drop policy if exists "payments_insert_self" on public.court_payments;
create policy "payments_insert_self" on public.court_payments
  for insert with check (auth.uid() = user_id);
-- 수정: 본인(취소 요청 등). paid 확정은 Edge Function(service_role)이 처리.
drop policy if exists "payments_update_self" on public.court_payments;
create policy "payments_update_self" on public.court_payments
  for update using (auth.uid() = user_id);

-- 예약 슬롯 ↔ 주문 연결. null = 무료/구제도(결제 없이 확정).
alter table public.court_reservations add column if not exists payment_id uuid references public.court_payments(id) on delete set null;
create index if not exists court_reservations_payment_idx on public.court_reservations (payment_id);
