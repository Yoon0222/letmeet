-- ============================================================
-- PROD 반영 통합 번들 — 피넛 v3.1.0
-- 운영 Supabase(jbvtdthtmrlndduqiikj) SQL Editor 에서 이 파일 전체를 1회 실행.
-- 포함: (A) 정기모임 반복스케줄 0077~0079  (B) 프리미엄 구독 0080
-- 모두 멱등(idempotent) — 여러 번 실행해도 안전.
-- ============================================================

-- ========== (A) 정기모임 반복 스케줄 ==========

-- ============================================================
-- PROD 반영 번들 — 0077~0079 정기모임 반복 스케줄
-- 운영 Supabase(jbvtdthtmrlndduqiikj) SQL Editor 에서 1회 실행. 멱등(idempotent).
-- ============================================================

-- 1) 반복 규칙 테이블
create table if not exists public.club_session_schedules (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  weekday         int  not null check (weekday between 0 and 6),
  start_time      time not null default '19:00',
  vote_open_days  int  not null default 5 check (vote_open_days between 0 and 21),
  vote_close_days int  not null default 1 check (vote_close_days between 0 and 21),
  title           text not null default '정기모임',
  location        text not null default '',
  court_count     int  not null default 2 check (court_count between 1 and 20),
  point_target    int  not null default 16 check (point_target between 1 and 99),
  format          text not null default 'americano' check (format in ('americano')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint css_vote_order_chk check (vote_open_days >= vote_close_days)
);
create index if not exists club_session_schedules_club_idx on public.club_session_schedules (club_id);
alter table public.club_session_schedules enable row level security;
drop policy if exists "css_select" on public.club_session_schedules;
create policy "css_select" on public.club_session_schedules for select using (
  exists (select 1 from public.club_members m
          where m.club_id = club_session_schedules.club_id and m.user_id = auth.uid() and m.status = 'approved')
  or exists (select 1 from public.clubs c
             where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
);
drop policy if exists "css_write_owner" on public.club_session_schedules;
create policy "css_write_owner" on public.club_session_schedules for all using (
  exists (select 1 from public.clubs c where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.clubs c where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
);

-- 2) 세션 ↔ 스케줄 연결
alter table public.club_sessions add column if not exists schedule_id uuid references public.club_session_schedules(id) on delete set null;
create unique index if not exists club_sessions_schedule_date_uniq
  on public.club_sessions (schedule_id, session_date) where schedule_id is not null;

-- 3) 도래한 회차 생성 함수
create or replace function public.generate_due_club_sessions(p_club_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int := 0;
  r record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_next date;
begin
  for r in
    select s.* from public.club_session_schedules s
    join public.clubs c on c.id = s.club_id
    where s.active
      and (p_club_id is null or s.club_id = p_club_id)
      and c.tier = 'premium'
      and (c.premium_status = 'active'
           or (c.premium_status = 'trialing' and c.premium_trial_ends_at is not null and c.premium_trial_ends_at > now()))
  loop
    v_next := v_today + ((r.weekday - extract(dow from v_today)::int + 7) % 7);
    if v_today > (v_next - r.vote_close_days) then
      v_next := v_next + 7;
    end if;
    if v_today >= (v_next - r.vote_open_days)
       and not exists (select 1 from public.club_sessions where schedule_id = r.id and session_date = v_next) then
      begin
        insert into public.club_sessions
          (club_id, created_by, schedule_id, title, session_date, start_at, vote_deadline,
           location, court_count, point_target, format, status)
        values
          (r.club_id, r.created_by, r.id, r.title, v_next,
           (v_next + r.start_time) at time zone 'Asia/Seoul',
           ((v_next - r.vote_close_days) + r.start_time) at time zone 'Asia/Seoul',
           r.location, r.court_count, r.point_target, r.format, 'voting');
        v_count := v_count + 1;
      exception when unique_violation then
        null;
      end;
    end if;
  end loop;
  return v_count;
end;
$$;

-- 4) 실행 권한: authenticated 만 (anon/public 회수)
revoke execute on function public.generate_due_club_sessions(uuid) from public, anon;
grant execute on function public.generate_due_club_sessions(uuid) to authenticated;

-- ============================================================
-- 검증 (모두 true 기대)
-- ============================================================
select
  exists (select 1 from information_schema.tables where table_name='club_session_schedules') as table_ok,
  exists (select 1 from information_schema.columns where table_name='club_sessions' and column_name='schedule_id') as column_ok,
  exists (select 1 from pg_proc where proname='generate_due_club_sessions') as function_ok;

-- ============================================================
-- (선택) pg_cron 일 1회 자동 생성 — pg_cron 확장 활성화 후 1회 실행:
--   select cron.schedule('generate-club-sessions', '5 15 * * *',
--                        $$select public.generate_due_club_sessions()$$);
-- cron 없이도 앱(홈·정기모임 목록) 열람 시 on-read 로 보충됩니다.
-- ============================================================

-- ========== (B) 프리미엄 클럽 구독 ==========

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
