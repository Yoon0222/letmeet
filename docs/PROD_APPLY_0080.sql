-- ============================================================
-- PROD 반영 번들 — 0080 프리미엄 클럽 구독(Toss 빌링키 정기결제)
-- 운영 Supabase(jbvtdthtmrlndduqiikj) SQL Editor 에서 1회 실행. 멱등.
-- ⚠️ 실행 후 아래 "배포 체크리스트"의 엣지함수·시크릿·cron 도 함께 반영해야 동작.
-- ============================================================

create table if not exists public.club_subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  club_id              uuid not null unique references public.clubs(id) on delete cascade,
  owner_id             uuid not null references public.profiles(id) on delete cascade,
  billing_key          text not null,
  customer_key         text not null,
  card_company         text not null default '',
  card_number_masked   text not null default '',
  amount               int  not null default 5500 check (amount >= 0),
  status               text not null default 'active' check (status in ('active','past_due','canceled')),
  current_period_start timestamptz,
  current_period_end   timestamptz,
  next_charge_at       timestamptz,
  last_charge_at       timestamptz,
  fail_count           int  not null default 0,
  canceled_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists club_subscriptions_due_idx
  on public.club_subscriptions (next_charge_at) where status in ('active','past_due');
alter table public.club_subscriptions enable row level security;
drop policy if exists "club_subs_select_owner" on public.club_subscriptions;
create policy "club_subs_select_owner" on public.club_subscriptions for select using (auth.uid() = owner_id);
revoke select on public.club_subscriptions from authenticated, anon;
grant select (id, club_id, owner_id, card_company, card_number_masked, amount, status,
              current_period_start, current_period_end, next_charge_at, last_charge_at,
              fail_count, canceled_at, created_at, updated_at)
  on public.club_subscriptions to authenticated;

create table if not exists public.club_subscription_charges (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.club_subscriptions(id) on delete cascade,
  club_id         uuid not null references public.clubs(id) on delete cascade,
  amount          int not null,
  status          text not null check (status in ('paid','failed')),
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

-- 검증 (모두 true 기대)
select
  exists (select 1 from information_schema.tables where table_name='club_subscriptions') as subs_ok,
  exists (select 1 from information_schema.tables where table_name='club_subscription_charges') as charges_ok;

-- ============================================================
-- 배포 체크리스트 (SQL 외)
-- ============================================================
-- 1) 엣지함수 배포 (운영):
--      npx supabase functions deploy toss-billing-issue  --project-ref jbvtdthtmrlndduqiikj
--      npx supabase functions deploy toss-billing-cancel --project-ref jbvtdthtmrlndduqiikj
--      npx supabase functions deploy toss-billing-charge --no-verify-jwt --project-ref jbvtdthtmrlndduqiikj
-- 2) 시크릿:
--      TOSS_SECRET_KEY (이미 설정됨) + CRON_SECRET(임의 난수) 설정:
--      npx supabase secrets set CRON_SECRET=<난수> --project-ref jbvtdthtmrlndduqiikj
--      (dev 에도 CRON_SECRET 설정해야 charge 함수가 401 아님)
-- 3) pg_cron 정기 과금 (대시보드에서 pg_cron·pg_net 활성화 후 SQL Editor 1회):
--      select cron.schedule('charge-club-subscriptions', '10 15 * * *',  -- 매일 00:10 KST
--        $$ select net.http_post(
--             url := 'https://jbvtdthtmrlndduqiikj.supabase.co/functions/v1/toss-billing-charge',
--             headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CRON_SECRET>'),
--             body := '{}'::jsonb
--           ) $$);
-- 4) Toss: 운영 결제는 상점 계정에 '자동결제(빌링)' 활성화 필요. 현재는 테스트 키로 테스트 모드.
-- ============================================================
