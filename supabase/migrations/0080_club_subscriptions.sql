-- 0080: 프리미엄 클럽 구독 (Toss 빌링키 정기결제)
--   카드 등록(빌링키) → 매월 자동 과금 → clubs.premium_status='active' 유지.
--   무료체험 중 구독 시 카드만 등록하고 첫 과금은 체험 종료일에(next_charge_at).
--   빌링키/커스터머키는 민감정보 → 클라(authenticated) 컬럼 SELECT 회수.

create table if not exists public.club_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null unique references public.clubs(id) on delete cascade,  -- 클럽당 1구독
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  billing_key          text not null,          -- Toss billingKey (카드 토큰; 원카드번호 아님)
  customer_key         text not null,          -- Toss customerKey (= owner uuid)
  card_company         text not null default '',
  card_number_masked   text not null default '',
  amount               int  not null default 5500 check (amount >= 0),
  status               text not null default 'active' check (status in ('active','past_due','canceled')),
  current_period_start timestamptz,
  current_period_end   timestamptz,            -- 이 시점까지 이용 가능
  next_charge_at       timestamptz,            -- 다음 과금 예정(체험 중이면 체험 종료일)
  last_charge_at       timestamptz,
  fail_count           int  not null default 0,
  canceled_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists club_subscriptions_due_idx
  on public.club_subscriptions (next_charge_at) where status in ('active', 'past_due');

alter table public.club_subscriptions enable row level security;
-- 조회: 클럽장 본인만 (민감정보라 멤버에게도 비공개). 쓰기는 엣지함수(service_role)만.
drop policy if exists "club_subs_select_owner" on public.club_subscriptions;
create policy "club_subs_select_owner" on public.club_subscriptions for select using (auth.uid() = owner_id);

-- 민감 컬럼(billing_key, customer_key) 은 클라에서 못 보게: 전체 회수 후 안전 컬럼만 부여
revoke select on public.club_subscriptions from authenticated, anon;
grant select (id, club_id, owner_id, card_company, card_number_masked, amount, status,
              current_period_start, current_period_end, next_charge_at, last_charge_at,
              fail_count, canceled_at, created_at, updated_at)
  on public.club_subscriptions to authenticated;

-- 과금 이력(감사/영수증)
create table if not exists public.club_subscription_charges (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.club_subscriptions(id) on delete cascade,
  club_id         uuid not null references public.clubs(id) on delete cascade,
  amount          int not null,
  status          text not null check (status in ('paid', 'failed')),
  toss_payment_key text,
  order_id        text,
  fail_reason     text,
  charged_at      timestamptz not null default now()
);
create index if not exists club_sub_charges_sub_idx
  on public.club_subscription_charges (subscription_id, charged_at desc);
alter table public.club_subscription_charges enable row level security;
drop policy if exists "club_sub_charges_select_owner" on public.club_subscription_charges;
create policy "club_sub_charges_select_owner" on public.club_subscription_charges for select using (
  exists (select 1 from public.club_subscriptions s where s.id = subscription_id and s.owner_id = auth.uid())
);
