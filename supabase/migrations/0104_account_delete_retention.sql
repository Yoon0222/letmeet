-- 0104: 회원 탈퇴 후속 — 결제 기록 5년 보관 · 대기열 승격 · 남은 유료 예약이 있으면 탈퇴 막기 (2026-10-20 사용자 결정)
--
-- ① 결제 기록 보관: 전자상거래법(시행령 제6조)상 대금결제·재화 공급 기록은 5년 보관해야 한다.
--    지금은 회원이 탈퇴하면 payments 가 함께 지워졌고(코트가 지워져도 마찬가지), 클럽이 지워지면
--    (클럽장 탈퇴 포함) club_subscription_charges 도 지워졌다 → 연결만 끊고 행은 남긴다(on delete set null).
--    · payments: user_id·court_id 를 비운다. 탈퇴한 결제자는 former_user_id(회원 번호만 — 프로필 정보 없음)로 남긴다.
--      주문명(코트·대회 이름)·날짜·시간·금액·환불액·토스 결제키는 결제 행에 이미 있다.
--    · club_subscription_charges: club_id·subscription_id 를 비운다. 클럽 이름·결제자(구독 등록한 회원 번호)를
--      결제 때 서버가 함께 적는다(엣지함수는 그대로).
--    · club_dues_charges 는 처음부터 이렇게 만들어져 있다(0097).
--    탈퇴 회원의 결제 행은 user_id 가 비어 본인 화면에서는 사라지고 운영자(와 그 코트 주인)만 본다(RLS 그대로).
--    5년이 지난 뒤 파기는 따로(가장 이른 실결제 2026-09 → 2031-09 전까지 정기 작업으로).
-- ② 대기열 승격: 탈퇴로 신청이 연쇄 삭제될 때 승격 트리거가 깊이 검사(pg_trigger_depth() > 1)에 걸려 돌지 않았다
--    → delete_account 가 접수 중인 대회의 내 신청을 먼저 직접 지운다(트리거가 돈다).
--    진행 중·끝난 대회는 지금처럼 승격하지 않는다(조 편성 뒤라서).
-- ③ 남은 유료 예약이 있으면 탈퇴를 막는다: 앞으로의 유료 코트 예약, 끝나지 않은 유료 대회 참가.
--    먼저 취소하면 지금처럼 환불 규정대로 처리된다. 서버 문구를 앱이 그대로 보여 준다(옛 앱 포함).

-- ── ① payments ───────────────────────────────────────────────
alter table public.payments add column if not exists former_user_id uuid;
comment on column public.payments.former_user_id is
  '탈퇴한 결제자의 회원 번호(프로필은 지워짐). 결제 기록은 전자상거래법에 따라 5년 보관';
alter table public.payments alter column user_id drop not null;

do $$
declare c record;
begin
  for c in
    select distinct con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
     where con.conrelid = 'public.payments'::regclass and con.contype = 'f'
       and att.attname in ('user_id', 'court_id')
  loop
    execute format('alter table public.payments drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.payments
  add constraint payments_user_id_fkey foreign key (user_id) references public.profiles(id) on delete set null,
  add constraint payments_court_id_fkey foreign key (court_id) references public.courts(id) on delete set null;

-- 회원이 지워질 때(탈퇴): 결제 행에 회원 번호를 먼저 남긴다 — 그 뒤 연결이 끊겨 user_id 가 비워진다
create or replace function public.profiles_keep_payment_records()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.payments set former_user_id = old.id where user_id = old.id and former_user_id is null;
  return old;
end;
$$;
drop trigger if exists profiles_keep_payment_records on public.profiles;
create trigger profiles_keep_payment_records
  before delete on public.profiles
  for each row execute function public.profiles_keep_payment_records();
revoke all on function public.profiles_keep_payment_records() from public, anon, authenticated;

-- ── ① club_subscription_charges ─────────────────────────────
alter table public.club_subscription_charges add column if not exists club_name text not null default '';
alter table public.club_subscription_charges add column if not exists payer_id uuid;   -- 결제자(구독 등록 회원) 번호 — 탈퇴해도 남는다(FK 없음)
alter table public.club_subscription_charges alter column club_id drop not null;

do $$
declare c record;
begin
  for c in
    select distinct con.conname
      from pg_constraint con
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any(con.conkey)
     where con.conrelid = 'public.club_subscription_charges'::regclass and con.contype = 'f'
       and att.attname in ('club_id', 'subscription_id')
  loop
    execute format('alter table public.club_subscription_charges drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.club_subscription_charges
  add constraint club_subscription_charges_club_id_fkey foreign key (club_id) references public.clubs(id) on delete set null,
  add constraint club_subscription_charges_subscription_id_fkey foreign key (subscription_id) references public.club_subscriptions(id) on delete set null;

-- 결제 행을 쓸 때 클럽 이름·결제자를 함께 적는다(엣지함수가 넣지 않아도 서버가 채움)
create or replace function public.club_subscription_charges_snapshot()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.club_id is not null then
    if coalesce(new.club_name, '') = '' then
      select c.name into new.club_name from public.clubs c where c.id = new.club_id;
      new.club_name := coalesce(new.club_name, '');
    end if;
    if new.payer_id is null then
      select coalesce(s.owner_id, c.owner_id) into new.payer_id
        from public.clubs c
        left join public.club_subscriptions s on s.club_id = c.id
       where c.id = new.club_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists club_subscription_charges_snapshot on public.club_subscription_charges;
create trigger club_subscription_charges_snapshot
  before insert on public.club_subscription_charges
  for each row execute function public.club_subscription_charges_snapshot();
revoke all on function public.club_subscription_charges_snapshot() from public, anon, authenticated;

-- 이미 있는 결제 행도 채운다
update public.club_subscription_charges ch
   set club_name = c.name
  from public.clubs c
 where c.id = ch.club_id and ch.club_name = '';
update public.club_subscription_charges ch
   set payer_id = coalesce(s.owner_id, c.owner_id)
  from public.clubs c
  left join public.club_subscriptions s on s.club_id = c.id
 where c.id = ch.club_id and ch.payer_id is null;

-- ── ②③ delete_account ──────────────────────────────────────
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- ③ 남은 유료 예약이 있으면 막는다 — 먼저 취소하면 환불 규정대로 처리된다
  if exists (
    select 1
      from public.court_reservations r
      join public.payments p on p.id = r.payment_id
     where r.user_id = v_uid and r.status = 'reserved' and r.expires_at is null
       and p.status = 'paid'
       and r.slot_date + make_interval(hours => r.hour) > (now() at time zone 'Asia/Seoul')
  ) then
    raise exception '앞으로 남은 코트 예약이 있어요. 예약을 먼저 취소한 뒤 탈퇴해 주세요.';
  end if;
  if exists (
    select 1
      from public.tournament_entries e
      join public.tournaments t on t.id = e.tournament_id
     where e.user_id = v_uid and e.status in ('pending', 'approved')
       and t.status in ('registration', 'ongoing')
       and exists (select 1 from public.payments p
                    where p.user_id = v_uid and p.order_type = 'tournament' and p.target_id = t.id and p.status = 'paid')
  ) then
    raise exception '참가 중인 유료 대회가 있어요. 참가를 취소하거나 대회가 끝난 뒤 탈퇴해 주세요.';
  end if;

  select role into v_role from public.profiles where id = v_uid;

  -- ② 접수 중인 대회의 내 신청을 먼저 지운다 → 대기열 승격 트리거가 돈다
  --    (회원 삭제의 연쇄 삭제로 지우면 트리거 깊이 검사에 걸려 승격이 안 된다)
  delete from public.tournament_entries e
   using public.tournaments t
   where t.id = e.tournament_id and e.user_id = v_uid and t.status = 'registration';

  delete from auth.users where id = v_uid;
  -- 탈퇴 기록: 개인정보 없이 회원 식별자와 당시 역할만. 행위자는 비운다(프로필이 이미 없다).
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id)
  values (null, v_role, 'account.delete', 'profiles', v_uid::text);
end;
$$;
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
