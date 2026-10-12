-- ============================================================================
-- PROD 적용: 0097 클럽 회비 — 데이터·규칙 (프리미엄 플러스 전용)
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj)
--
-- 내용:
--   · club_members.approved_at(승인 시각, 서버가 정함) — "납부일 이후 승인된 회원은 다음 기간부터" 판단용.
--   · 설정: platform_billing_settings(회비 스위치·기본 수수료 3.5%), club_fee_overrides(클럽별 수수료).
--   · 규칙: club_dues_plans(주기·금액·납부일), club_payout_accounts(정산 계좌), 기간 계산 함수(KST).
--   · 회원: member_billing_cards(결제 카드 — 결제 키는 앱에 안 내려감), club_dues_mandates(자동결제 동의).
--   · 장부: club_dues(회원×기간), club_dues_charges(결제 시도), club_dues_settlements(클럽×월 정산), dues_job_runs.
--   · 앱용 함수: 회비 규칙 설정·끄기, 정산 계좌 등록·조회(끝 4자리), 현금 납부·면제·되돌리기, 동의 해지, 명단·기간 조회.
--   · 관리자용 함수: 계좌 확인, 정산 생성·확정·지급 완료.
--   · 트리거: 회원 탈퇴 시 동의 해지·미납 무효 / 정산 안 끝난 클럽 삭제 차단 / 규칙·계좌·정산 변경 기록.
--
-- ⚠️ 회비 기능은 꺼진 채로 들어간다(platform_billing_settings.dues_enabled = false).
--    켜는 조건(토스 지급대행 계약 등)이 갖춰진 뒤 아래 중 하나로 켠다:
--      update public.platform_billing_settings set dues_enabled = true, updated_at = now() where id;                       -- 전체
--      update public.platform_billing_settings set pilot_club_ids = array['<클럽 id>']::uuid[], updated_at = now() where id;  -- 일부 클럽만
--
-- ⚠️ 적용 순서: 0096(프리미엄 플러스) → 이 파일 → 0098(자동결제 엔진) → 엣지함수 → 앱.
--    이 파일만 적용해도 기존 앱·기능에는 영향이 없다. 기존 표에 닿는 것은 세 가지뿐:
--      · club_members 에 열 1개(approved_at) + 트리거 2개(승인 시각 기록 / 탈퇴·승인 취소 시 회비 동의 해지·미납 무효)
--      · clubs 에 삭제 전 트리거 1개(정산이 끝나지 않은 회비 결제가 있으면 삭제 차단 — 회비를 쓰기 전에는 해당 없음)
--
-- DEV 검증(2026-10-12): 역할별 호출 시험 2종(116 + 41항목) 통과 — 기간·수수료 계산, 규칙 설정 권한·검증, 납부 처리(임원 본인 불가·
--   카드 결제분 되돌리기 불가), 카드·동의·계좌·정산·수수료 조회 범위, 앱의 직접 쓰기 차단, 회원 탈퇴·재가입·승인 취소,
--   금액 변경 예약, 끄기·다시 켜기(같은 주기/주기 변경 — 회원당 미납 행 1개 이하), 스위치(전체·일부 클럽),
--   정산(끝난 달만·진행 중 결제/환불이 있으면 확정 거절·확정 뒤 변경 차단), 계좌 확인(본 뒤 바뀌면 거절), 클럽 삭제 차단,
--   변경 기록(계좌번호는 끝자리만, 탈퇴 연쇄 삭제 중에도 막히지 않음).
--
-- 실행: npx supabase db query -f docs/PROD_APPLY_0097.sql --linked --project-ref jbvtdthtmrlndduqiikj
-- 전체가 하나의 트랜잭션 — 중간에 실패하면 아무것도 적용되지 않는다. 재실행해도 안전.
-- ============================================================================

begin;

-- 0097: 클럽 회비 — 데이터·규칙 (프리미엄 플러스 전용)
--   돈의 흐름: 회원 카드 → 피넛 토스 가맹점 → 클럽 정산.
--   원칙: 앱(회원·운영진)은 회비 표에 직접 쓰지 않는다 — 전부 서버 함수(RPC·엣지함수) 경유.
--   스위치: platform_billing_settings.dues_enabled(운영은 false 로 시작) 또는 pilot_club_ids 에 든 클럽만 동작.
--   날짜 계산은 모두 한국 시간(KST) 기준.

-- ── 0) 클럽 회원의 승인 시각 — "납부일 이후 승인된 회원은 다음 기간부터" 판단용 ──────────
alter table public.club_members add column if not exists approved_at timestamptz;
update public.club_members set approved_at = joined_at where status = 'approved' and approved_at is null;

create or replace function public.club_members_set_approved_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    else
      new.approved_at := old.approved_at;  -- 승인 시각은 한 번 정해지면 바꿀 수 없다
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists on_club_member_approved_at on public.club_members;
create trigger on_club_member_approved_at
  before insert or update on public.club_members
  for each row execute function public.club_members_set_approved_at();

-- ── 1) 플랫폼 설정·수수료 ──────────
create table if not exists public.platform_billing_settings (
  id              boolean primary key default true check (id),      -- 단일 행
  dues_enabled    boolean not null default false,                   -- 회비 기능 전체 스위치
  pilot_club_ids  uuid[]  not null default '{}',                    -- 전체 스위치가 꺼져 있어도 켜 둘 클럽
  default_fee_bps int     not null default 350 check (default_fee_bps between 0 and 3000),  -- 기본 수수료 3.5%(카드 수수료 포함)
  updated_by      uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);
insert into public.platform_billing_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_billing_settings enable row level security;
drop policy if exists "platform_billing_settings_admin" on public.platform_billing_settings;
create policy "platform_billing_settings_admin" on public.platform_billing_settings
  for all using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

create table if not exists public.club_fee_overrides (
  club_id    uuid primary key references public.clubs(id) on delete cascade,
  fee_bps    int  not null check (fee_bps between 0 and 3000),
  note       text not null default '',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.club_fee_overrides enable row level security;
drop policy if exists "club_fee_overrides_admin" on public.club_fee_overrides;
create policy "club_fee_overrides_admin" on public.club_fee_overrides
  for all using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

create or replace function public.dues_enabled_for(p_club_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select s.dues_enabled or p_club_id = any (s.pilot_club_ids) from public.platform_billing_settings s where s.id), false);
$$;

-- 클럽에 적용되는 수수료율(만분율): 클럽별 예외 → 기본값
create or replace function public.club_fee_bps(p_club_id uuid)
returns int
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select o.fee_bps from public.club_fee_overrides o where o.club_id = p_club_id),
    (select s.default_fee_bps from public.platform_billing_settings s where s.id),
    350);
$$;

create or replace function public.dues_fee_amount(p_amount int, p_bps int)
returns int language sql immutable
as $$ select round(p_amount::numeric * p_bps / 10000)::int; $$;  -- numeric 으로 계산(큰 금액×높은 요율에서 정수 넘침 방지)

-- 호출자가 최고관리자이거나 서버(서비스롤·cron)인가 — 관리자용 함수의 공통 검사
create or replace function public.dues_is_admin_or_service()
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    -- 요청 정보(JWT)가 아예 없는 실행 = DB 안에서 직접 부른 것(cron 등). 요청 정보가 있으면 서비스롤·최고관리자만.
    when nullif(current_setting('request.jwt.claims', true), '') is null
         and nullif(current_setting('request.jwt.claim.role', true), '') is null then true
    else coalesce(auth.role(), '') = 'service_role' or public.my_role() = 'super_admin'
  end;
$$;

-- ── 2) 기간 계산 (KST) ──────────
create or replace function public.dues_today()
returns date language sql stable
as $$ select (now() at time zone 'Asia/Seoul')::date; $$;

-- 날짜가 속한 회비 기간. period_end 는 다음 기간의 시작일.
--   매월 'M2026-10' / 분기 'Q2026-4'(1·4·7·10월 시작) / 연 'Y2026-03'(시작 월 기준)
create or replace function public.dues_period_of(p_cycle text, p_start_month int, p_on date)
returns table (period_key text, period_start date, period_end date)
language plpgsql immutable
as $$
declare
  v_start date;
begin
  if p_cycle = 'monthly' then
    v_start := date_trunc('month', p_on)::date;
    return query select 'M' || to_char(v_start, 'YYYY-MM'), v_start, (v_start + interval '1 month')::date;
  elsif p_cycle = 'quarterly' then
    v_start := date_trunc('quarter', p_on)::date;
    return query select 'Q' || to_char(v_start, 'YYYY') || '-' || to_char(v_start, 'Q'), v_start, (v_start + interval '3 months')::date;
  elsif p_cycle = 'yearly' then
    v_start := make_date(extract(year from p_on)::int, p_start_month, 1);
    if v_start > p_on then
      v_start := (v_start - interval '1 year')::date;
    end if;
    return query select 'Y' || to_char(v_start, 'YYYY-MM'), v_start, (v_start + interval '1 year')::date;
  else
    raise exception 'unknown dues cycle: %', p_cycle;
  end if;
end;
$$;

-- 납부일의 자동결제 시각: 그날 오전 10시(KST)
create or replace function public.dues_due_at(p_due date)
returns timestamptz language sql immutable
as $$ select (p_due::timestamp + interval '10 hours') at time zone 'Asia/Seoul'; $$;

-- 회비 행을 만들거나 되살릴 때의 자동결제 시각: 납부일 10시와 "다음 오전 10시" 중 늦은 쪽.
--   납부일이 이미 지난 행이 생겨도 그 자리에서 바로 청구하지 않고, 일일 작업(9시)의 안내가 먼저 나간 뒤 청구한다.
create or replace function public.dues_next_slot(p_due date)
returns timestamptz language sql stable
as $$
  select greatest(
    public.dues_due_at(p_due),
    public.dues_due_at(case when now() < public.dues_due_at(public.dues_today()) then public.dues_today() else public.dues_today() + 1 end));
$$;

-- ── 3) 회비 규칙 (클럽당 1행) ──────────
create table if not exists public.club_dues_plans (
  club_id            uuid primary key references public.clubs(id) on delete cascade,
  active             boolean not null default true,
  cycle              text not null check (cycle in ('monthly', 'quarterly', 'yearly')),
  amount             int  not null check (amount between 1000 and 1000000 and amount % 100 = 0),
  due_day            int  not null check (due_day between 1 and 28),          -- 기간 첫 달의 납부일
  start_month        int  not null default 1 check (start_month between 1 and 12),  -- 연 회비의 시작 월(다른 주기에서는 쓰지 않음)
  include_owner      boolean not null default false,                          -- 클럽장도 회비 대상에 포함
  first_period_start date not null,                                           -- 회비를 받기 시작한 기간의 시작일
  next_amount        int check (next_amount is null or (next_amount between 1000 and 1000000 and next_amount % 100 = 0)),
  next_amount_from   date,                                                    -- 바뀐 금액이 적용되는 기간의 시작일
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.club_dues_plans enable row level security;
drop policy if exists "club_dues_plans_select" on public.club_dues_plans;
create policy "club_dues_plans_select" on public.club_dues_plans for select using (true);

-- ── 4) 정산 계좌 (클럽당 1행) — 토스 지급대행 판매자 등록에 필요한 항목을 처음부터 받는다 ──────────
create table if not exists public.club_payout_accounts (
  club_id         uuid primary key references public.clubs(id) on delete cascade,
  holder_type     text not null check (holder_type in ('individual', 'business')),
  holder_name     text not null,
  bank_name       text not null,
  account_number  text not null,
  business_number text,
  contact_phone   text not null default '',
  contact_email   text,
  verified        boolean not null default false,       -- 관리자가 계좌를 확인했는가(정산 확정의 조건)
  verified_by     uuid references public.profiles(id) on delete set null,
  verified_at     timestamptz,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.club_payout_accounts enable row level security;
-- 계좌번호가 들어 있으므로 표 조회는 최고관리자만. 클럽장은 club_payout_account_get(끝 4자리만)으로 본다.
drop policy if exists "club_payout_accounts_admin" on public.club_payout_accounts;
create policy "club_payout_accounts_admin" on public.club_payout_accounts
  for select using (public.my_role() = 'super_admin');

-- ── 5) 회원 결제 카드(회원당 1장)·자동결제 동의 ──────────
create table if not exists public.member_billing_cards (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  billing_key        text not null,
  customer_key       text not null,
  card_company       text not null default '',
  card_number_masked text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.member_billing_cards enable row level security;
drop policy if exists "member_billing_cards_select_own" on public.member_billing_cards;
create policy "member_billing_cards_select_own" on public.member_billing_cards for select using (auth.uid() = user_id);
-- 결제 키는 앱에 내려가지 않는다
revoke all on public.member_billing_cards from anon, authenticated;
grant select (user_id, card_company, card_number_masked, created_at, updated_at) on public.member_billing_cards to authenticated;

create table if not exists public.club_dues_mandates (
  club_id          uuid not null references public.clubs(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'needs_reconsent', 'revoked')),
  consented_amount int  not null,                 -- 동의한 회비 금액 — 이보다 큰 금액은 다시 동의해야 청구된다
  consented_cycle  text not null check (consented_cycle in ('monthly', 'quarterly', 'yearly')),
  consent_text     text not null,                 -- 동의 당시 안내 문구(그대로 보관)
  consented_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_reason   text,
  updated_at       timestamptz not null default now(),
  primary key (club_id, user_id)
);
alter table public.club_dues_mandates enable row level security;
drop policy if exists "club_dues_mandates_select" on public.club_dues_mandates;
create policy "club_dues_mandates_select" on public.club_dues_mandates
  for select using (auth.uid() = user_id or public.is_club_manager(club_id));

-- ── 6) 정산(클럽×월) ──────────
create table if not exists public.club_dues_settlements (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid references public.clubs(id) on delete set null,
  club_name        text not null default '',      -- 기록 보존용
  period_month     text not null,                 -- 'YYYY-MM' (결제일 기준, KST)
  gross_amount     int  not null default 0,       -- 그 달에 결제된 회비 합계
  refund_amount    int  not null default 0,       -- 그중 환불된 금액
  fee_amount       int  not null default 0,       -- 피넛 수수료(환불 건 제외)
  net_amount       int  not null default 0,       -- 정산액 = 합계 − 환불 − 수수료
  charge_count     int  not null default 0,
  status           text not null default 'draft' check (status in ('draft', 'confirmed', 'paid')),
  account_snapshot jsonb,                         -- 확정 시점의 정산 계좌
  confirmed_by     uuid references public.profiles(id) on delete set null,
  confirmed_at     timestamptz,
  paid_by          uuid references public.profiles(id) on delete set null,
  paid_at          timestamptz,
  paid_reference   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (club_id, period_month)
);
alter table public.club_dues_settlements enable row level security;
drop policy if exists "club_dues_settlements_select" on public.club_dues_settlements;
create policy "club_dues_settlements_select" on public.club_dues_settlements
  for select using (
    public.my_role() = 'super_admin'
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
  );
-- 계좌 스냅샷은 앱에 내려가지 않는다(관리자 화면은 전용 함수로 조회)
revoke all on public.club_dues_settlements from anon, authenticated;
grant select (id, club_id, club_name, period_month, gross_amount, refund_amount, fee_amount, net_amount, charge_count,
              status, confirmed_at, paid_at, created_at, updated_at)
  on public.club_dues_settlements to authenticated;

-- ── 7) 회비(회원×기간 1행)·결제 시도 장부 ──────────
create table if not exists public.club_dues (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  period_key       text not null,
  period_start     date not null,
  period_end       date not null,                 -- 다음 기간의 시작일
  due_date         date not null,
  amount           int  not null,
  status           text not null default 'open'
                   check (status in ('open', 'processing', 'paid', 'failed', 'exempt', 'refunded', 'void')),
  paid_via         text check (paid_via in ('card', 'cash')),
  paid_at          timestamptz,
  marked_by        uuid references public.profiles(id) on delete set null,  -- 현금 납부·면제를 처리한 운영진
  note             text not null default '',
  attempt_count    int  not null default 0,       -- 카드가 확정 거절된 횟수
  next_attempt_at  timestamptz,                   -- 자동결제 다음 시도 시각(null = 예정 없음)
  last_fail_reason text,
  notified_d3_at   timestamptz,                   -- 납부 사전 안내를 보낸 시각
  void_reason      text check (void_reason in ('plan_disabled', 'left_club')),  -- 무효가 된 이유(되살릴 수 있는지 판단)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (club_id, user_id, period_key)
);
create index if not exists club_dues_club_period_idx on public.club_dues (club_id, period_start desc);
create index if not exists club_dues_user_idx on public.club_dues (user_id, period_start desc);
create index if not exists club_dues_attempt_idx on public.club_dues (next_attempt_at) where status = 'open';
alter table public.club_dues enable row level security;
drop policy if exists "club_dues_select" on public.club_dues;
create policy "club_dues_select" on public.club_dues
  for select using (auth.uid() = user_id or public.is_club_manager(club_id));

-- 결제 시도 장부: 시도마다 1행(주문번호 고유). 돈의 기록이라 클럽·회원이 지워져도 남는다.
create table if not exists public.club_dues_charges (
  id               uuid primary key default gen_random_uuid(),
  dues_id          uuid references public.club_dues(id) on delete set null,
  club_id          uuid references public.clubs(id) on delete set null,
  user_id          uuid references public.profiles(id) on delete set null,
  club_name        text not null default '',
  payer_name       text not null default '',
  period_key       text not null,
  amount           int  not null check (amount > 0),
  fee_bps          int  not null,                 -- 결제 시점의 수수료율(이후 요율이 바뀌어도 그대로)
  fee_amount       int  not null check (fee_amount >= 0),
  net_amount       int  not null,                 -- 클럽 정산액 = amount − fee_amount
  order_id         text not null unique,
  status           text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  attempt_no       int  not null default 1,
  source           text not null default 'auto' check (source in ('auto', 'manual')),  -- 자동결제 / 회원이 직접 '지금 결제'
  toss_payment_key text,
  fail_reason      text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  refunded_at      timestamptz,
  refund_reason    text,
  refunded_by      uuid references public.profiles(id) on delete set null,
  refund_requested_at timestamptz,                -- 환불을 시작한 시각(진행 중에는 정산을 확정하지 않는다)
  settlement_id    uuid references public.club_dues_settlements(id) on delete set null,
  check (net_amount = amount - fee_amount),
  check (status not in ('paid', 'refunded') or paid_at is not null)  -- 결제 시각이 없으면 어느 달 정산에도 들어가지 못한다
);
-- 같은 회비에 결제 완료 1건·진행 중 1건만 — 이중 결제를 DB 가 막는다
create unique index if not exists club_dues_charges_one_paid on public.club_dues_charges (dues_id) where status = 'paid';
create unique index if not exists club_dues_charges_one_pending on public.club_dues_charges (dues_id) where status = 'pending';
create unique index if not exists club_dues_charges_payment_key_uniq on public.club_dues_charges (toss_payment_key) where toss_payment_key is not null;
create index if not exists club_dues_charges_club_paid_idx on public.club_dues_charges (club_id, paid_at);
create index if not exists club_dues_charges_pending_idx on public.club_dues_charges (created_at) where status = 'pending';
alter table public.club_dues_charges enable row level security;
drop policy if exists "club_dues_charges_select" on public.club_dues_charges;
create policy "club_dues_charges_select" on public.club_dues_charges
  for select using (auth.uid() = user_id or public.is_club_manager(club_id) or public.my_role() = 'super_admin');
-- 토스 결제 키와 수수료(요율·금액·정산액)는 앱에 내려가지 않는다 — 수수료는 운영진이 club_dues_status·정산 내역으로 본다
revoke all on public.club_dues_charges from anon, authenticated;
grant select (id, dues_id, club_id, user_id, club_name, payer_name, period_key, amount,
              status, attempt_no, source, fail_reason, created_at, paid_at, refunded_at, refund_reason, settlement_id)
  on public.club_dues_charges to authenticated;

-- 확정·지급된 정산에 묶인 결제 건은 바꿀 수 없다(환불·금액 수정 차단 — 정산 금액과 어긋나지 않게)
create or replace function public.dues_charges_lock_settled()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if old.settlement_id is not null
     and (new.settlement_id is distinct from old.settlement_id
          or new.status is distinct from old.status or new.amount is distinct from old.amount
          or new.fee_amount is distinct from old.fee_amount or new.net_amount is distinct from old.net_amount
          or new.paid_at is distinct from old.paid_at or new.club_id is distinct from old.club_id and new.club_id is not null)
     and exists (select 1 from public.club_dues_settlements s where s.id = old.settlement_id and s.status in ('confirmed', 'paid')) then
    raise exception '정산이 확정된 결제는 바꿀 수 없어요.';
  end if;
  return new;
end;
$$;
drop trigger if exists on_dues_charge_lock_settled on public.club_dues_charges;
create trigger on_dues_charge_lock_settled
  before update on public.club_dues_charges
  for each row execute function public.dues_charges_lock_settled();

-- 자동 작업 실행 기록(회비 생성·결제 워커·정산 초안)
create table if not exists public.dues_job_runs (
  id          bigint generated always as identity primary key,
  job         text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  summary     jsonb
);
create index if not exists dues_job_runs_job_idx on public.dues_job_runs (job, started_at desc);
alter table public.dues_job_runs enable row level security;
drop policy if exists "dues_job_runs_admin" on public.dues_job_runs;
create policy "dues_job_runs_admin" on public.dues_job_runs for select using (public.my_role() = 'super_admin');

-- ── 8) 변경 기록(감사) — 규칙·수수료·정산의 변경을 남긴다. 계좌번호·사업자번호는 끝자리만. ──────────
create or replace function public.dues_audit_trigger()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  -- 회원 탈퇴로 연쇄 삭제될 때는 프로필이 이미 지워져 있다 → 그때는 행위자를 비워 둔다(외래키 오류 방지)
  v_actor uuid := (select p.id from public.profiles p where p.id = auth.uid());
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if v_old ? 'account_number' then
    v_old := v_old || jsonb_build_object('account_number', '****' || right(v_old->>'account_number', 4),
                                         'business_number', case when v_old->>'business_number' is null then null else '****' || right(v_old->>'business_number', 4) end);
  end if;
  if v_new ? 'account_number' then
    v_new := v_new || jsonb_build_object('account_number', '****' || right(v_new->>'account_number', 4),
                                         'business_number', case when v_new->>'business_number' is null then null else '****' || right(v_new->>'business_number', 4) end);
  end if;
  if v_old ? 'account_snapshot' then v_old := v_old - 'account_snapshot'; end if;
  if v_new ? 'account_snapshot' then v_new := v_new - 'account_snapshot'; end if;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (v_actor, case when v_actor is null then null else public.my_role() end,
          tg_table_name || '.' || tg_op, tg_table_name, coalesce(v_row->>'id', v_row->>'club_id'), v_old, v_new);
  return null;
end;
$$;

drop trigger if exists audit_club_dues_plans on public.club_dues_plans;
create trigger audit_club_dues_plans after insert or update or delete on public.club_dues_plans
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_club_payout_accounts on public.club_payout_accounts;
create trigger audit_club_payout_accounts after insert or update or delete on public.club_payout_accounts
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_club_dues_settlements on public.club_dues_settlements;
create trigger audit_club_dues_settlements after insert or update or delete on public.club_dues_settlements
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_club_fee_overrides on public.club_fee_overrides;
create trigger audit_club_fee_overrides after insert or update or delete on public.club_fee_overrides
  for each row execute function public.dues_audit_trigger();
drop trigger if exists audit_platform_billing_settings on public.platform_billing_settings;
create trigger audit_platform_billing_settings after update on public.platform_billing_settings
  for each row execute function public.dues_audit_trigger();

-- ── 9) 규칙 함수 ──────────

-- 클럽 승인 회원 전원에게 회비 알림(유발한 사람 제외)
create or replace function public.dues_notify_members(p_club_id uuid, p_title text, p_body text, p_actor uuid default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
begin
  for m in select user_id from public.club_members where club_id = p_club_id and status = 'approved' loop
    perform public.push_notify(m.user_id, 'dues', p_title, p_body, 'club_dues', p_club_id, p_actor);
  end loop;
end;
$$;

-- 이번 기간(과 납부일이 3일 안으로 다가온 다음 기간)의 회비 행을 만든다. 이미 있으면 건드리지 않는다.
--   대상: 승인된 회원 중 납부일까지 승인된 사람(이후 승인자는 다음 기간부터). 클럽장은 include_owner 일 때만.
--   행은 납부일 3일 전부터 그 기간이 끝나기 전까지 만들어진다.
create or replace function public.dues_ensure_rows(p_club_id uuid)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  pl record;
  per record;
  cur record;
  v_today date := public.dues_today();
  v_on date;
  v_due date;
  v_existing_due date;
  v_amount int;
  v_n int;
  v_count int := 0;
begin
  select * into pl from public.club_dues_plans where club_id = p_club_id for update;
  if not found or not pl.active then return 0; end if;
  if not public.dues_enabled_for(p_club_id) or not public.club_plan_usable(p_club_id, 'premium_plus') then return 0; end if;

  -- 예약된 금액 변경은 적용 기간이 실제로 시작된 날 규칙에 반영한다
  select * into cur from public.dues_period_of(pl.cycle, pl.start_month, v_today);
  if pl.next_amount is not null and pl.next_amount_from is not null and cur.period_start >= pl.next_amount_from then
    update public.club_dues_plans
       set amount = pl.next_amount, next_amount = null, next_amount_from = null, updated_at = now()
     where club_id = p_club_id;
    pl.amount := pl.next_amount;
    pl.next_amount := null;
    pl.next_amount_from := null;
  end if;

  foreach v_on in array array[v_today, v_today + 3] loop
    select * into per from public.dues_period_of(pl.cycle, pl.start_month, v_on);
    continue when per.period_start < pl.first_period_start;
    -- 그 기간에 적용되는 금액(다음 기간의 행을 미리 만들 때는 예약된 금액)
    v_amount := case when pl.next_amount is not null and pl.next_amount_from is not null and per.period_start >= pl.next_amount_from
                     then pl.next_amount else pl.amount end;
    -- 납부일: 그 기간의 행이 이미 있으면 그 납부일을 따른다(기간 중에 납부일 설정을 바꿔도 대상·납부일이 달라지지 않게)
    select min(d.due_date) into v_existing_due
      from public.club_dues d where d.club_id = p_club_id and d.period_key = per.period_key and d.status <> 'void';
    v_due := coalesce(v_existing_due, per.period_start + (pl.due_day - 1));
    continue when v_today < v_due - 3 or v_today >= per.period_end;

    -- 무효가 된 행(탈퇴했다가 납부일 전에 다시 승인된 회원 등)은 지금 대상이면 되살린다
    update public.club_dues d
       set status = 'open', void_reason = null, amount = v_amount, due_date = v_due, attempt_count = 0,
           last_fail_reason = null, notified_d3_at = null,
           next_attempt_at = public.dues_next_slot(v_due), updated_at = now()
      from public.club_members m
     where d.club_id = p_club_id and d.period_key = per.period_key and d.status = 'void'
       and m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved'
       and (pl.include_owner or m.role <> 'owner')
       and (coalesce(m.approved_at, m.joined_at) at time zone 'Asia/Seoul')::date <= v_due;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;

    insert into public.club_dues (club_id, user_id, period_key, period_start, period_end, due_date, amount, next_attempt_at)
    select p_club_id, m.user_id, per.period_key, per.period_start, per.period_end, v_due, v_amount,
           public.dues_next_slot(v_due)
      from public.club_members m
     where m.club_id = p_club_id and m.status = 'approved'
       and (pl.include_owner or m.role <> 'owner')
       and (coalesce(m.approved_at, m.joined_at) at time zone 'Asia/Seoul')::date <= v_due
    on conflict (club_id, user_id, period_key) do nothing;
    get diagnostics v_n = row_count;
    v_count := v_count + v_n;
  end loop;
  return v_count;
end;
$$;

-- 회비 화면이 쓰는 상태 요약. 수수료율은 운영진에게만, 정산 계좌 상태는 클럽장에게만.
create or replace function public.club_dues_status(p_club_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  v_owner boolean := exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid());
  v_manager boolean := public.is_club_manager(p_club_id);
begin
  return jsonb_build_object(
    'enabled', public.dues_enabled_for(p_club_id),
    'plus', public.club_plan_usable(p_club_id, 'premium_plus'),
    'plan_active', exists (select 1 from public.club_dues_plans p where p.club_id = p_club_id and p.active),
    'is_owner', v_owner,
    'is_manager', v_manager,
    'fee_bps', case when v_manager then public.club_fee_bps(p_club_id) end,
    'payout_registered', case when v_owner then exists (select 1 from public.club_payout_accounts a where a.club_id = p_club_id) end,
    'payout_verified', case when v_owner then coalesce((select a.verified from public.club_payout_accounts a where a.club_id = p_club_id), false) end
  );
end;
$$;

-- 회비 규칙 설정(클럽장). 켜져 있는 규칙의 금액 변경은 다음 기간부터, 주기 변경은 끄고 다시 설정.
--   결과: ok / not_found / forbidden / disabled(회비 기능 꺼짐) / plan_required(플러스 아님) /
--         payout_required(정산 계좌 없음) / invalid / cycle_locked
create or replace function public.club_dues_plan_set(
  p_club_id uuid, p_cycle text, p_amount int, p_due_day int, p_start_month int default 1, p_include_owner boolean default false
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  pl record;
  per record;
  v_found boolean;
  v_same_cycle boolean;
  v_today date := public.dues_today();
  v_due date;
  v_first date;
  v_last_end date;
  v_amount int;
  v_next int;
  v_next_from date;
  v_cycle_label text;
begin
  select owner_id, name into v_owner, v_name from public.clubs where id = p_club_id;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if not public.dues_enabled_for(p_club_id) then return 'disabled'; end if;
  if not public.club_plan_usable(p_club_id, 'premium_plus') then return 'plan_required'; end if;
  if p_cycle is null or p_cycle not in ('monthly', 'quarterly', 'yearly')
     or p_amount is null or p_amount < 1000 or p_amount > 1000000 or p_amount % 100 <> 0
     or p_due_day is null or p_due_day < 1 or p_due_day > 28
     or p_start_month is null or p_start_month < 1 or p_start_month > 12 then
    return 'invalid';
  end if;
  if not exists (select 1 from public.club_payout_accounts a where a.club_id = p_club_id) then return 'payout_required'; end if;

  v_cycle_label := case p_cycle when 'monthly' then '매월' when 'quarterly' then '분기마다' else '매년' end;
  select * into pl from public.club_dues_plans where club_id = p_club_id for update;
  v_found := found;

  -- ── 켜져 있는 규칙 수정: 납부일·클럽장 포함은 앞으로 만들어지는 행부터, 금액은 다음 기간부터
  if v_found and pl.active then
    if pl.cycle <> p_cycle or (p_cycle = 'yearly' and pl.start_month <> p_start_month) then return 'cycle_locked'; end if;
    select * into per from public.dues_period_of(pl.cycle, pl.start_month, v_today);
    update public.club_dues_plans
       set due_day = p_due_day, include_owner = coalesce(p_include_owner, false), updated_at = now()
     where club_id = p_club_id;
    if p_amount = pl.amount then
      -- 예약돼 있던 변경을 취소: 미리 만들어 둔 다음 기간 행도 원래 금액으로
      if pl.next_amount is not null then
        update public.club_dues
           set amount = pl.amount, notified_d3_at = null, updated_at = now()
         where club_id = p_club_id and period_start >= pl.next_amount_from and status = 'open' and attempt_count = 0;
      end if;
      update public.club_dues_plans set next_amount = null, next_amount_from = null where club_id = p_club_id;
    elsif not exists (select 1 from public.club_dues d where d.club_id = p_club_id and d.period_start >= pl.first_period_start and d.status <> 'void') then
      -- 아직 한 번도 청구한 적이 없으면 바로 적용
      update public.club_dues_plans set amount = p_amount, next_amount = null, next_amount_from = null where club_id = p_club_id;
    else
      update public.club_dues_plans set next_amount = p_amount, next_amount_from = per.period_end where club_id = p_club_id;
      -- 다음 기간 행이 (납부일 3일 전이라) 이미 만들어져 있었다면 아직 청구 전인 것만 새 금액으로 맞추고 안내를 다시 보낸다
      update public.club_dues
         set amount = p_amount, notified_d3_at = null, updated_at = now()
       where club_id = p_club_id and period_start >= per.period_end and status = 'open' and attempt_count = 0;
      perform public.dues_notify_members(
        p_club_id, v_name || ' 회비가 바뀌어요',
        to_char(per.period_end, 'FMMM"월" FMDD"일"') || ' 기간부터 ' || to_char(pl.amount, 'FM999,999,999') || '원 → ' || to_char(p_amount, 'FM999,999,999') || '원.'
          || case when p_amount > pl.amount then ' 자동결제를 계속하려면 회비 화면에서 다시 동의해주세요.' else '' end,
        auth.uid());
    end if;
    perform public.dues_ensure_rows(p_club_id);
    return 'ok';
  end if;

  -- ── 새로 켜기 / 껐다가 다시 켜기
  -- 이번 기간의 납부일이 아직 안 지났으면 이번 기간부터, 지났으면 다음 기간부터
  select * into per from public.dues_period_of(p_cycle, p_start_month, v_today);
  v_due := per.period_start + (p_due_day - 1);
  v_first := case when v_today <= v_due then per.period_start else per.period_end end;
  v_same_cycle := v_found and pl.cycle = p_cycle and (p_cycle <> 'yearly' or pl.start_month = p_start_month);
  v_amount := p_amount;
  v_next := null;
  v_next_from := null;

  if v_found and not v_same_cycle then
    -- 주기를 바꿔 다시 켤 때: 이미 회비를 받은(결제 중 포함) 옛 주기의 기간과 겹치지 않도록, 그 기간이 끝난 뒤에 시작하는 첫 기간부터 받는다
    select max(d.period_end) into v_last_end from public.club_dues d where d.club_id = p_club_id and d.status in ('paid', 'processing');
    while v_last_end is not null and v_first < v_last_end loop
      select k.period_end into v_first from public.dues_period_of(p_cycle, p_start_month, v_first) k;
    end loop;
  elsif v_same_cycle and p_amount <> pl.amount
        and exists (select 1 from public.club_dues d where d.club_id = p_club_id and d.period_start >= v_first) then
    -- 같은 주기로 다시 켜면서 금액을 바꾼 경우: 이미 청구가 시작된 기간은 원래 금액 그대로, 새 금액은 그다음 기간부터
    v_amount := pl.amount;
    v_next := p_amount;
    select max(d.period_end) into v_next_from from public.club_dues d where d.club_id = p_club_id and d.period_start >= v_first;
  end if;

  insert into public.club_dues_plans
    (club_id, active, cycle, amount, due_day, start_month, include_owner, first_period_start, next_amount, next_amount_from, created_by)
  values
    (p_club_id, true, p_cycle, v_amount, p_due_day, p_start_month, coalesce(p_include_owner, false), v_first, v_next, v_next_from, auth.uid())
  on conflict (club_id) do update
    set active = true, cycle = excluded.cycle, amount = excluded.amount, due_day = excluded.due_day,
        start_month = excluded.start_month, include_owner = excluded.include_owner,
        first_period_start = excluded.first_period_start, next_amount = excluded.next_amount,
        next_amount_from = excluded.next_amount_from, updated_at = now();

  -- 끄면서 무효 처리했던 행 되살리기: 같은 주기의 행(기간 키가 새 규칙과 같은 것)만, 납부일은 원래대로, 지금도 승인 회원인 사람만.
  -- 금액은 그 기간에 적용되는 규칙 금액으로 맞춘다(끄기 전에 예약돼 있던 금액이 남지 않게).
  update public.club_dues d
     set status = 'open', void_reason = null, attempt_count = 0, last_fail_reason = null, notified_d3_at = null,
         amount = case when v_next is not null and d.period_start >= v_next_from then v_next else v_amount end,
         next_attempt_at = public.dues_next_slot(d.due_date), updated_at = now()
   where d.club_id = p_club_id and d.status = 'void' and d.void_reason = 'plan_disabled' and d.period_start >= v_first
     and d.period_key = (select k.period_key from public.dues_period_of(p_cycle, p_start_month, d.period_start) k)
     and exists (select 1 from public.club_members m where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved');

  -- 주기(연 회비는 시작 월 포함)가 달라졌으면 예전 동의로는 청구하지 않는다(다시 동의)
  if v_found and not v_same_cycle then
    update public.club_dues_mandates
       set status = 'needs_reconsent', updated_at = now()
     where club_id = p_club_id and status = 'active';
  end if;

  perform public.dues_ensure_rows(p_club_id);
  perform public.dues_notify_members(
    p_club_id, v_name || ' 회비 안내',
    v_cycle_label || ' ' || to_char(v_amount, 'FM999,999,999') || '원, 첫 납부일은 ' || to_char(v_first + (p_due_day - 1), 'YYYY"년" FMMM"월" FMDD"일"')
      || '이에요. 회비 화면에서 카드를 등록하면 자동으로 납부돼요.',
    auth.uid());
  if v_next is not null then
    perform public.dues_notify_members(
      p_club_id, v_name || ' 회비가 바뀌어요',
      to_char(v_next_from, 'FMMM"월" FMDD"일"') || ' 기간부터 ' || to_char(v_amount, 'FM999,999,999') || '원 → ' || to_char(v_next, 'FM999,999,999') || '원.'
        || case when v_next > v_amount then ' 자동결제를 계속하려면 회비 화면에서 다시 동의해주세요.' else '' end,
      auth.uid());
  end if;
  return 'ok';
end;
$$;

-- 회비 끄기(클럽장). 이번·이후 기간의 미납 행은 무효 처리, 지난 기간의 미납 기록은 남긴다.
create or replace function public.club_dues_plan_disable(p_club_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.clubs where id = p_club_id;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  update public.club_dues_plans
     set active = false, next_amount = null, next_amount_from = null, updated_at = now()
   where club_id = p_club_id;
  if not found then return 'not_found'; end if;
  update public.club_dues
     set status = 'void', void_reason = 'plan_disabled', next_attempt_at = null, updated_at = now()
   where club_id = p_club_id and status in ('open', 'failed') and period_end > public.dues_today();
  -- 지난 기간의 미납 기록은 남기되 자동 청구 예정은 없앤다
  update public.club_dues
     set next_attempt_at = null, updated_at = now()
   where club_id = p_club_id and status in ('open', 'failed') and next_attempt_at is not null;
  return 'ok';
end;
$$;

-- 정산 계좌 등록·변경(클럽장). 계좌가 바뀌면 관리자 확인을 다시 받아야 한다.
--   결과: ok / not_found / forbidden / disabled(회비 기능 꺼짐) / plan_required(플러스 아님) / invalid
create or replace function public.club_payout_account_set(
  p_club_id uuid, p_holder_type text, p_holder_name text, p_bank_name text, p_account_number text,
  p_business_number text default null, p_contact_phone text default '', p_contact_email text default null
) returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_name text;
  v_account text := regexp_replace(coalesce(p_account_number, ''), '[^0-9]', '', 'g');
  v_biz text := nullif(regexp_replace(coalesce(p_business_number, ''), '[^0-9]', '', 'g'), '');
  v_phone text := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_holder text := btrim(coalesce(p_holder_name, ''));
  v_bank text := btrim(coalesce(p_bank_name, ''));
  old_row record;
  v_existed boolean;
  v_changed boolean;
begin
  select owner_id, name into v_owner, v_name from public.clubs where id = p_club_id;
  if v_owner is null then return 'not_found'; end if;
  if auth.uid() is null or v_owner <> auth.uid() then return 'forbidden'; end if;
  if not public.dues_enabled_for(p_club_id) then return 'disabled'; end if;
  if not public.club_plan_usable(p_club_id, 'premium_plus') then return 'plan_required'; end if;
  if p_holder_type is null or p_holder_type not in ('individual', 'business')
     or length(v_holder) < 2 or length(v_holder) > 40
     or length(v_bank) < 2 or length(v_bank) > 30
     or length(v_account) < 8 or length(v_account) > 16
     or length(v_phone) < 9 or length(v_phone) > 11
     or (p_holder_type = 'business' and (v_biz is null or length(v_biz) <> 10))
     or (p_holder_type = 'individual' and v_biz is not null and length(v_biz) <> 10) then
    return 'invalid';
  end if;

  select * into old_row from public.club_payout_accounts where club_id = p_club_id for update;
  v_existed := found;
  v_changed := not v_existed
    or old_row.holder_type <> p_holder_type or old_row.holder_name <> v_holder or old_row.bank_name <> v_bank
    or old_row.account_number <> v_account or old_row.business_number is distinct from v_biz;

  insert into public.club_payout_accounts
    (club_id, holder_type, holder_name, bank_name, account_number, business_number, contact_phone, contact_email, verified, updated_by, updated_at)
  values
    (p_club_id, p_holder_type, v_holder, v_bank, v_account, v_biz, v_phone, nullif(btrim(coalesce(p_contact_email, '')), ''), false, auth.uid(), clock_timestamp())
  on conflict (club_id) do update
    set holder_type = excluded.holder_type, holder_name = excluded.holder_name, bank_name = excluded.bank_name,
        account_number = excluded.account_number, business_number = excluded.business_number,
        contact_phone = excluded.contact_phone, contact_email = excluded.contact_email,
        verified = case when v_changed then false else public.club_payout_accounts.verified end,
        verified_by = case when v_changed then null else public.club_payout_accounts.verified_by end,
        verified_at = case when v_changed then null else public.club_payout_accounts.verified_at end,
        -- 계좌가 바뀐 실제 시각(now() 는 트랜잭션 시작 시각이라 쓰지 않는다) — 관리자 확인이 이 값으로 "본 계좌"를 식별한다
        updated_by = auth.uid(), updated_at = clock_timestamp();

  if v_changed then
    -- 본인 확인용 알림(계좌를 바꾼 사람 = 클럽장 본인에게도 보낸다)
    perform public.push_notify(
      v_owner, 'dues', v_name || ' 정산 계좌가 ' || case when v_existed then '변경' else '등록' end || '됐어요',
      v_bank || ' ****' || right(v_account, 4) || ' (' || v_holder || '). 직접 한 일이 아니면 바로 고객센터로 알려주세요.',
      'club_dues', p_club_id, null);
  end if;
  return 'ok';
end;
$$;

-- 정산 계좌 조회(클럽장·최고관리자) — 계좌번호·사업자번호는 끝 4자리만
create or replace function public.club_payout_account_get(p_club_id uuid)
returns jsonb
language plpgsql stable
security definer set search_path = public
as $$
declare
  a record;
begin
  if not (public.my_role() = 'super_admin'
          or exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid())) then
    return null;
  end if;
  select * into a from public.club_payout_accounts where club_id = p_club_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'holder_type', a.holder_type, 'holder_name', a.holder_name, 'bank_name', a.bank_name,
    'account_masked', '****' || right(a.account_number, 4),
    'business_masked', case when a.business_number is null then null else '****' || right(a.business_number, 4) end,
    'contact_phone', a.contact_phone, 'contact_email', a.contact_email,
    'verified', a.verified, 'updated_at', a.updated_at);
end;
$$;

-- 운영진의 납부 처리: 현금 납부 확인 / 면제 / 되돌리기
--   임원은 자기 회비를 처리할 수 없다(클럽장은 가능). 카드로 결제된 회비는 여기서 되돌릴 수 없다(환불로만).
--   결과: ok / not_found / forbidden / self_not_allowed / in_progress / already_paid / card_refund_only / invalid
create or replace function public.club_dues_mark(p_dues_id uuid, p_action text, p_note text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  d record;
  v_owner uuid;
  v_name text;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
  v_old jsonb;
  v_resume boolean;
begin
  select * into d from public.club_dues where id = p_dues_id for update;
  if not found then return 'not_found'; end if;
  if auth.uid() is null or not public.is_club_manager(d.club_id) then return 'forbidden'; end if;
  select owner_id, name into v_owner, v_name from public.clubs where id = d.club_id;
  if d.user_id = auth.uid() and auth.uid() <> v_owner then return 'self_not_allowed'; end if;
  if d.status = 'processing' then return 'in_progress'; end if;
  v_old := jsonb_build_object('status', d.status, 'paid_via', d.paid_via, 'note', d.note);

  if p_action = 'cash_paid' then
    if d.status = 'paid' then return 'already_paid'; end if;
    if d.status not in ('open', 'failed', 'refunded') then return 'invalid'; end if;
    update public.club_dues
       set status = 'paid', paid_via = 'cash', paid_at = now(), marked_by = auth.uid(), note = v_note,
           next_attempt_at = null, updated_at = now()
     where id = p_dues_id;
    perform public.push_notify(d.user_id, 'dues', v_name || ' 회비 납부 확인',
      to_char(d.amount, 'FM999,999,999') || '원 납부가 확인됐어요.', 'club_dues', d.club_id, auth.uid());
  elsif p_action = 'exempt' then
    if d.status = 'paid' then return 'already_paid'; end if;
    if d.status not in ('open', 'failed', 'refunded') then return 'invalid'; end if;
    update public.club_dues
       set status = 'exempt', paid_via = null, paid_at = null, marked_by = auth.uid(), note = v_note,
           next_attempt_at = null, updated_at = now()
     where id = p_dues_id;
    perform public.push_notify(d.user_id, 'dues', v_name || ' 회비 면제',
      '이번 회비는 면제 처리됐어요.', 'club_dues', d.club_id, auth.uid());
  elsif p_action = 'revert' then
    if d.status = 'paid' and d.paid_via = 'card' then return 'card_refund_only'; end if;
    if not (d.status = 'exempt' or (d.status = 'paid' and d.paid_via = 'cash')) then return 'invalid'; end if;
    -- 자동결제 대상으로 되돌리는 건 "기간이 안 끝났고, 회비가 켜져 있고, 지금도 승인 회원"일 때만
    v_resume := d.period_end > public.dues_today()
      and exists (select 1 from public.club_dues_plans p where p.club_id = d.club_id and p.active)
      and exists (select 1 from public.club_members m where m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved');
    update public.club_dues
       set status = 'open', paid_via = null, paid_at = null, marked_by = auth.uid(), note = v_note,
           next_attempt_at = case when v_resume then public.dues_next_slot(d.due_date) else null end,
           updated_at = now()
     where id = p_dues_id;
    perform public.push_notify(d.user_id, 'dues', v_name || ' 회비 처리 취소',
      '회비 ' || case when d.status = 'exempt' then '면제가' else '납부 확인이' end || ' 취소돼 다시 미납 상태가 됐어요.', 'club_dues', d.club_id, auth.uid());
  else
    return 'invalid';
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), public.my_role(), 'club_dues.' || p_action, 'club_dues', p_dues_id::text, v_old,
          jsonb_build_object('note', v_note, 'user_id', d.user_id, 'period_key', d.period_key, 'amount', d.amount));
  return 'ok';
end;
$$;

-- 자동결제 동의 해지(회원 본인). 이미 생긴 회비는 그대로 남고 자동 청구만 멈춘다.
create or replace function public.club_dues_mandate_revoke(p_club_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then return 'forbidden'; end if;
  update public.club_dues_mandates
     set status = 'revoked', revoked_at = now(), revoked_reason = 'member', updated_at = now()
   where club_id = p_club_id and user_id = auth.uid() and status <> 'revoked';
  if not found then return 'not_found'; end if;
  return 'ok';
end;
$$;

-- 기간별 납부 명단(운영진). 자동결제 여부는 "동의 + 카드 등록" 여부만 알려준다(카드 정보는 주지 않는다).
drop function if exists public.club_dues_roster(uuid, text);
create or replace function public.club_dues_roster(p_club_id uuid, p_period_key text)
returns table (
  dues_id uuid, user_id uuid, nickname text, avatar_url text, member_role text, status text, amount int, due_date date,
  paid_via text, paid_at timestamptz, note text, attempt_count int, last_fail_reason text, autopay boolean,
  paid_charge_id uuid, refundable boolean
)
language sql stable
security definer set search_path = public
as $$
  select d.id, d.user_id, p.nickname, p.avatar_url, coalesce(m.role, 'left'), d.status, d.amount, d.due_date,
         d.paid_via, d.paid_at, d.note, d.attempt_count, d.last_fail_reason,
         exists (select 1 from public.club_dues_mandates x where x.club_id = d.club_id and x.user_id = d.user_id and x.status = 'active')
           and exists (select 1 from public.member_billing_cards c where c.user_id = d.user_id),
         pc.id,                                             -- 카드로 결제된 건(환불할 때 쓴다)
         (pc.id is not null and pc.settlement_id is null)   -- 정산 확정 전이라 환불할 수 있는가
    from public.club_dues d
    join public.profiles p on p.id = d.user_id
    left join public.club_members m on m.club_id = d.club_id and m.user_id = d.user_id and m.status = 'approved'
    left join public.club_dues_charges pc on pc.dues_id = d.id and pc.status = 'paid'
   where d.club_id = p_club_id and d.period_key = p_period_key and public.is_club_manager(p_club_id)
   order by case d.status when 'failed' then 0 when 'open' then 1 when 'processing' then 2 when 'refunded' then 3 when 'paid' then 4 else 5 end, p.nickname;
$$;

-- 기간 목록과 납부 요약(운영진)
create or replace function public.club_dues_periods(p_club_id uuid)
returns table (period_key text, period_start date, due_date date, total int, paid int, exempt int, unpaid int, collected int)
language sql stable
security definer set search_path = public
as $$
  select d.period_key, min(d.period_start), min(d.due_date),
         (count(*) filter (where d.status <> 'void'))::int,
         (count(*) filter (where d.status = 'paid'))::int,
         (count(*) filter (where d.status = 'exempt'))::int,
         (count(*) filter (where d.status in ('open', 'failed', 'processing', 'refunded')))::int,
         coalesce(sum(d.amount) filter (where d.status = 'paid'), 0)::int
    from public.club_dues d
   where d.club_id = p_club_id and public.is_club_manager(p_club_id)
   group by d.period_key
   order by min(d.period_start) desc;
$$;

-- ── 10) 회원 탈퇴·클럽 삭제 ──────────
-- 회원이 클럽을 떠나면(탈퇴·내보내기) 자동결제 동의를 해지하고 미납 회비는 무효 처리한다.
create or replace function public.dues_on_member_removed()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- 승인 회원이 아니게 된 경우에만(탈퇴·내보내기·승인 취소)
  if tg_op = 'UPDATE' and not (old.status = 'approved' and new.status is distinct from 'approved') then
    return null;
  end if;
  update public.club_dues_mandates
     set status = 'revoked', revoked_at = now(), revoked_reason = 'left_club', updated_at = now()
   where club_id = old.club_id and user_id = old.user_id and status <> 'revoked';
  update public.club_dues
     set status = 'void', void_reason = 'left_club', next_attempt_at = null, updated_at = now()
   where club_id = old.club_id and user_id = old.user_id and status in ('open', 'failed');
  return null;
end;
$$;
drop trigger if exists on_club_member_removed_dues on public.club_members;
create trigger on_club_member_removed_dues
  after delete or update of status on public.club_members
  for each row execute function public.dues_on_member_removed();

-- 정산이 끝나지 않은 회비 결제가 있는 클럽은 삭제할 수 없다.
create or replace function public.dues_block_club_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1
      from public.club_dues_charges c
      left join public.club_dues_settlements s on s.id = c.settlement_id
     where c.club_id = old.id
       and (c.status = 'pending' or (c.status = 'paid' and coalesce(s.status, 'none') <> 'paid'))
  ) then
    raise exception '정산이 끝나지 않은 회비가 있어 클럽을 삭제할 수 없어요. 정산이 끝난 뒤 다시 시도해주세요.';
  end if;
  return old;
end;
$$;
drop trigger if exists on_club_delete_dues_guard on public.clubs;
create trigger on_club_delete_dues_guard
  before delete on public.clubs
  for each row execute function public.dues_block_club_delete();

-- ── 11) 관리자: 계좌 확인·정산 ──────────
drop function if exists public.dues_payout_account_verify(uuid, boolean);
create or replace function public.dues_payout_account_verify(p_club_id uuid, p_verified boolean, p_expected_updated_at timestamptz default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  a record;
  v_owner uuid;
  v_name text;
begin
  if not public.dues_is_admin_or_service() then return 'forbidden'; end if;
  select * into a from public.club_payout_accounts where club_id = p_club_id for update;
  if not found then return 'not_found'; end if;
  -- 확인 처리는 "관리자가 본 그 계좌"에만: 본 뒤에 계좌가 바뀌었으면 거절한다
  if coalesce(p_verified, false) and (p_expected_updated_at is null or a.updated_at is distinct from p_expected_updated_at) then
    return 'changed';
  end if;
  -- updated_at 은 계좌 내용이 바뀐 시각이라 여기서는 건드리지 않는다
  update public.club_payout_accounts
     set verified = coalesce(p_verified, false),
         verified_by = case when coalesce(p_verified, false) then auth.uid() else null end,
         verified_at = case when coalesce(p_verified, false) then now() else null end
   where club_id = p_club_id;
  if coalesce(p_verified, false) then
    select owner_id, name into v_owner, v_name from public.clubs where id = p_club_id;
    perform public.push_notify(v_owner, 'dues', v_name || ' 정산 계좌 확인 완료', '정산 계좌 확인이 끝났어요. 이제 회비가 이 계좌로 정산돼요.', 'club_dues', p_club_id, null);
  end if;
  return 'ok';
end;
$$;

-- 정산 금액 다시 계산(초안일 때만). 그 달(KST)에 결제된 건 기준: 합계 − 환불 − 수수료(환불 건 제외) = 정산액
create or replace function public.dues_settlement_recalc(p_settlement_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.club_dues_settlements where id = p_settlement_id for update;
  if not found or s.status <> 'draft' then return; end if;
  update public.club_dues_settlements t
     set gross_amount = x.gross, refund_amount = x.refunded, fee_amount = x.fee,
         net_amount = x.gross - x.refunded - x.fee, charge_count = x.cnt, updated_at = now()
    from (
      select coalesce(sum(c.amount), 0)::int as gross,
             coalesce(sum(c.amount) filter (where c.status = 'refunded'), 0)::int as refunded,
             coalesce(sum(c.fee_amount) filter (where c.status = 'paid'), 0)::int as fee,
             (count(*) filter (where c.status = 'paid'))::int as cnt
        from public.club_dues_charges c
       where c.club_id = s.club_id and c.status in ('paid', 'refunded')
         and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month
    ) x
   where t.id = p_settlement_id;
end;
$$;

-- 한 달치 정산 초안 만들기(이미 확정·지급된 정산은 건드리지 않는다). 만들거나 갱신한 건수를 돌려준다.
create or replace function public.dues_settlement_generate(p_month text)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
  v_id uuid;
  v_count int := 0;
begin
  if not public.dues_is_admin_or_service() then raise exception 'forbidden'; end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'invalid month: %', p_month; end if;
  -- 끝난 달만 정산한다(진행 중인 달을 확정하면 그 뒤의 결제가 어느 정산에도 들어가지 못한다)
  if p_month >= to_char(public.dues_today(), 'YYYY-MM') then raise exception 'month not finished: %', p_month; end if;
  for r in
    select c.club_id, max(c.club_name) as club_name
      from public.club_dues_charges c
     where c.club_id is not null and c.status in ('paid', 'refunded')
       and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = p_month
     group by c.club_id
  loop
    insert into public.club_dues_settlements (club_id, club_name, period_month)
    values (r.club_id, r.club_name, p_month)
    on conflict (club_id, period_month) do nothing;
    select id into v_id from public.club_dues_settlements
     where club_id = r.club_id and period_month = p_month and status = 'draft';
    continue when v_id is null;  -- 이미 확정·지급된 정산
    perform public.dues_settlement_recalc(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 정산 확정: 금액을 마지막으로 다시 계산해 잠그고, 그 달의 결제 건을 이 정산에 묶는다. 확정 뒤에는 환불할 수 없다.
--   결과: ok / forbidden / not_found / not_draft / month_not_finished / payout_unverified / pending_exists / refund_in_progress
create or replace function public.dues_settlement_confirm(p_settlement_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  a record;
  v_owner uuid;
begin
  if not public.dues_is_admin_or_service() then return 'forbidden'; end if;
  select * into s from public.club_dues_settlements where id = p_settlement_id for update;
  if not found then return 'not_found'; end if;
  if s.status <> 'draft' then return 'not_draft'; end if;
  if s.period_month >= to_char(public.dues_today(), 'YYYY-MM') then return 'month_not_finished'; end if;
  select * into a from public.club_payout_accounts where club_id = s.club_id;
  if not found or not a.verified then return 'payout_unverified'; end if;
  -- 결과를 모르는 결제 시도나 진행 중인 환불이 있으면 금액이 아직 확정되지 않은 것
  if exists (select 1 from public.club_dues_charges c
              where c.club_id = s.club_id and c.status = 'pending'
                and to_char(c.created_at at time zone 'Asia/Seoul', 'YYYY-MM') <= s.period_month) then
    return 'pending_exists';
  end if;
  -- 환불이 시작된 건은 끝날 때까지(환불 반영 또는 "취소되지 않음" 확인으로 표시가 지워질 때까지) 확정하지 않는다
  if exists (select 1 from public.club_dues_charges c
              where c.club_id = s.club_id and c.status = 'paid' and c.refund_requested_at is not null
                and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month) then
    return 'refund_in_progress';
  end if;

  perform public.dues_settlement_recalc(p_settlement_id);
  update public.club_dues_charges c
     set settlement_id = p_settlement_id
   where c.club_id = s.club_id and c.status in ('paid', 'refunded')
     and to_char(c.paid_at at time zone 'Asia/Seoul', 'YYYY-MM') = s.period_month;
  update public.club_dues_settlements
     set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), updated_at = now(),
         account_snapshot = jsonb_build_object(
           'holder_type', a.holder_type, 'holder_name', a.holder_name, 'bank_name', a.bank_name,
           'account_number', a.account_number, 'business_number', a.business_number)
   where id = p_settlement_id
   returning * into s;
  select owner_id into v_owner from public.clubs where id = s.club_id;
  perform public.push_notify(v_owner, 'dues', s.club_name || ' ' || right(s.period_month, 2)::int || '월 회비 정산 확정',
    '정산액 ' || to_char(s.net_amount, 'FM999,999,999') || '원 (수수료 ' || to_char(s.fee_amount, 'FM999,999,999') || '원 제외). 곧 등록된 계좌로 입금돼요.',
    'club_dues', s.club_id, null);
  return 'ok';
end;
$$;

-- 지급 완료 기록
create or replace function public.dues_settlement_mark_paid(p_settlement_id uuid, p_reference text default '')
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  s record;
  v_owner uuid;
begin
  if not public.dues_is_admin_or_service() then return 'forbidden'; end if;
  select * into s from public.club_dues_settlements where id = p_settlement_id for update;
  if not found then return 'not_found'; end if;
  if s.status <> 'confirmed' then return 'not_confirmed'; end if;
  update public.club_dues_settlements
     set status = 'paid', paid_by = auth.uid(), paid_at = now(), paid_reference = left(coalesce(p_reference, ''), 200), updated_at = now()
   where id = p_settlement_id;
  select owner_id into v_owner from public.clubs where id = s.club_id;
  perform public.push_notify(v_owner, 'dues', s.club_name || ' 회비 정산 입금',
    to_char(s.net_amount, 'FM999,999,999') || '원이 정산 계좌로 입금됐어요.', 'club_dues', s.club_id, null);
  return 'ok';
end;
$$;

-- ── 12) 권한 ──────────
-- 회비 표는 앱에서 쓸 수 없다(RLS 에 쓰기 정책이 없고, 표 권한도 회수한다). 설정·수수료 표는 최고관리자가 관리자 웹에서 고친다.
revoke insert, update, delete, truncate, references, trigger on public.club_dues_plans, public.club_payout_accounts, public.club_dues_mandates,
  public.club_dues, public.dues_job_runs from anon, authenticated;
revoke truncate, references, trigger on public.platform_billing_settings, public.club_fee_overrides from authenticated;
revoke all on public.platform_billing_settings, public.club_fee_overrides, public.club_payout_accounts, public.dues_job_runs from anon;

-- 내부용(다른 함수·서버만): 앱에서 직접 부를 수 없다
revoke all on function public.dues_ensure_rows(uuid) from public, anon, authenticated;
revoke all on function public.dues_notify_members(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.dues_settlement_recalc(uuid) from public, anon, authenticated;
revoke all on function public.club_fee_bps(uuid) from public, anon, authenticated;  -- 수수료율은 club_dues_status 로 운영진에게만
revoke all on function public.dues_enabled_for(uuid) from public, anon, authenticated;
revoke all on function public.dues_next_slot(date) from public, anon, authenticated;
grant execute on function public.dues_next_slot(date) to service_role;
revoke all on function public.dues_is_admin_or_service() from public, anon, authenticated;
grant execute on function public.club_fee_bps(uuid) to service_role;
grant execute on function public.dues_enabled_for(uuid) to service_role;
grant execute on function public.dues_is_admin_or_service() to service_role;
grant execute on function public.dues_ensure_rows(uuid) to service_role;
grant execute on function public.dues_notify_members(uuid, text, text, uuid) to service_role;
grant execute on function public.dues_settlement_recalc(uuid) to service_role;

-- 앱(로그인 사용자)이 부르는 함수 — 권한은 함수 안에서 검사한다
revoke all on function public.club_dues_status(uuid) from public, anon;
revoke all on function public.club_dues_plan_set(uuid, text, int, int, int, boolean) from public, anon;
revoke all on function public.club_dues_plan_disable(uuid) from public, anon;
revoke all on function public.club_payout_account_set(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.club_payout_account_get(uuid) from public, anon;
revoke all on function public.club_dues_mark(uuid, text, text) from public, anon;
revoke all on function public.club_dues_mandate_revoke(uuid) from public, anon;
revoke all on function public.club_dues_roster(uuid, text) from public, anon;
revoke all on function public.club_dues_periods(uuid) from public, anon;
grant execute on function public.club_dues_status(uuid) to authenticated, service_role;
grant execute on function public.club_dues_plan_set(uuid, text, int, int, int, boolean) to authenticated;
grant execute on function public.club_dues_plan_disable(uuid) to authenticated;
grant execute on function public.club_payout_account_set(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.club_payout_account_get(uuid) to authenticated;
grant execute on function public.club_dues_mark(uuid, text, text) to authenticated;
grant execute on function public.club_dues_mandate_revoke(uuid) to authenticated;
grant execute on function public.club_dues_roster(uuid, text) to authenticated;
grant execute on function public.club_dues_periods(uuid) to authenticated;

-- 관리자·서버용
revoke all on function public.dues_payout_account_verify(uuid, boolean, timestamptz) from public, anon;
revoke all on function public.dues_settlement_generate(text) from public, anon;
revoke all on function public.dues_settlement_confirm(uuid) from public, anon;
revoke all on function public.dues_settlement_mark_paid(uuid, text) from public, anon;
grant execute on function public.dues_payout_account_verify(uuid, boolean, timestamptz) to authenticated, service_role;
grant execute on function public.dues_settlement_generate(text) to authenticated, service_role;
grant execute on function public.dues_settlement_confirm(uuid) to authenticated, service_role;
grant execute on function public.dues_settlement_mark_paid(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

-- ── 적용 후 확인 ─────────────────────────────────────────────────────────────
select
  (select dues_enabled from public.platform_billing_settings where id) as dues_enabled_expect_false,
  (select default_fee_bps from public.platform_billing_settings where id) as default_fee_bps_expect_350,
  (select count(*) from information_schema.tables where table_schema = 'public'
     and table_name in ('platform_billing_settings', 'club_fee_overrides', 'club_dues_plans', 'club_payout_accounts', 'member_billing_cards',
                        'club_dues_mandates', 'club_dues', 'club_dues_charges', 'club_dues_settlements', 'dues_job_runs')) as tables_expect_10,
  (select count(*) from public.club_members where status = 'approved' and approved_at is null) as approved_without_time_expect_0,
  has_column_privilege('authenticated', 'public.member_billing_cards', 'billing_key', 'select') as app_reads_billing_key_expect_false,
  has_column_privilege('authenticated', 'public.club_dues_charges', 'toss_payment_key', 'select') as app_reads_payment_key_expect_false,
  has_table_privilege('authenticated', 'public.club_dues', 'insert, update, delete') as app_writes_dues_expect_false,
  has_table_privilege('authenticated', 'public.club_payout_accounts', 'insert') as app_writes_payout_expect_false,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'club_dues' and cmd <> 'SELECT') as dues_write_policies_expect_0,
  has_function_privilege('authenticated', 'public.dues_ensure_rows(uuid)', 'execute') as app_calls_internal_expect_false,
  has_function_privilege('anon', 'public.club_dues_plan_set(uuid, text, int, int, int, boolean)', 'execute') as anon_calls_plan_set_expect_false;
