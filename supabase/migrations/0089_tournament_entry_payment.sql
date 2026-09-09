-- 0089: 대회 참가비 결제 (선착순 확정 모델)
--   · 유료(fee>0): 신청 = '결제 대기'(pending, 정원 점유) + 24h 결제 마감(payment_deadline)
--     → 결제 완료(toss-confirm, service_role)가 approved 확정 + paid_at/payment_id 기록
--     → 기한 초과는 expire_unpaid_tournament_entries() 가 삭제(→ 대기열 자동 승격)
--   · 무료(fee=0): 신청 즉시 approved (운영자 승인 단계 제거, 선착순)
--   · 대기열: 무결제 대기 → 승격 시 유료면 24h 마감 부여 + 알림, 무료면 즉시 확정 + 알림
--   · 보안: 참가자 본인이 결제 없이 status/결제 컬럼을 조작하는 것을 트리거로 차단

-- (A) 결제 추적 컬럼
alter table public.tournament_entries add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.tournament_entries add column if not exists paid_at timestamptz;
alter table public.tournament_entries add column if not exists payment_deadline timestamptz;

-- (B) 신청 트리거 확장 (0016 enforce_waitlist 대체)
--   정원 내 pending 신청: 무료면 즉시 approved, 유료면 24h 결제 마감 부여.
--   정원 초과면 기존대로 waitlist. (운영자가 명시적으로 approved 를 넣는 경우는 그대로 통과)
create or replace function public.enforce_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap int;
  occupied int;
  vfee int;
begin
  if new.status = 'pending' then
    select max_participants, fee into cap, vfee from public.tournaments where id = new.tournament_id;
    select count(*) into occupied from public.tournament_entries
      where tournament_id = new.tournament_id and status in ('pending', 'approved');
    if cap is not null and occupied >= cap then
      new.status := 'waitlist';
      new.payment_deadline := null;
    elsif coalesce(vfee, 0) > 0 then
      new.payment_deadline := now() + interval '24 hours';
    else
      new.status := 'approved';
    end if;
  end if;
  return new;
end;
$$;

-- (C) 대기열 승격 트리거 확장 (0016 promote_waitlist 대체)
--   유료: waitlist → pending + 24h 결제 마감 + 알림 / 무료: waitlist → approved + 알림
create or replace function public.promote_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap int;
  vfee int;
  vtitle text;
  occupied int;
  tid uuid;
  nextw uuid;
begin
  -- 내부 승격 update로 인한 재귀는 무시
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  tid := coalesce(new.tournament_id, old.tournament_id);
  select max_participants, fee, title into cap, vfee, vtitle from public.tournaments where id = tid;
  if cap is null then
    return null;
  end if;
  loop
    select count(*) into occupied from public.tournament_entries
      where tournament_id = tid and status in ('pending', 'approved');
    exit when occupied >= cap;
    select user_id into nextw from public.tournament_entries
      where tournament_id = tid and status = 'waitlist'
      order by created_at asc
      limit 1;
    exit when nextw is null;
    if coalesce(vfee, 0) > 0 then
      update public.tournament_entries
        set status = 'pending', payment_deadline = now() + interval '24 hours'
        where tournament_id = tid and user_id = nextw;
      insert into public.notifications (user_id, type, title, body, target_type, target_id)
        values (nextw, 'system', '대기열 승격 🎉',
                coalesce(vtitle, '대회') || ' 자리가 났어요! 24시간 안에 참가비를 결제하면 참가가 확정됩니다.',
                'tournament', tid);
    else
      update public.tournament_entries
        set status = 'approved'
        where tournament_id = tid and user_id = nextw;
      insert into public.notifications (user_id, type, title, body, target_type, target_id)
        values (nextw, 'system', '참가 확정 🎉',
                coalesce(vtitle, '대회') || ' 대기열에서 승격되어 참가가 확정됐어요.',
                'tournament', tid);
    end if;
  end loop;
  return null;
end;
$$;

-- (D) 결제 기한 만료 정리 — 앱이 대회 상세 로드 시 호출(on-read) + (선택) pg_cron
create or replace function public.expire_unpaid_tournament_entries(p_tournament_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int;
begin
  with victims as (
    select e.tournament_id, e.user_id
    from public.tournament_entries e
    join public.tournaments t on t.id = e.tournament_id
    where t.fee > 0
      and e.status = 'pending'
      and e.paid_at is null
      and e.payment_deadline is not null
      and e.payment_deadline < now()
      and (p_tournament_id is null or e.tournament_id = p_tournament_id)
  ), del as (
    delete from public.tournament_entries e
    using victims v
    where e.tournament_id = v.tournament_id and e.user_id = v.user_id
    returning e.tournament_id, e.user_id
  ), noti as (
    insert into public.notifications (user_id, type, title, body, target_type, target_id)
    select d.user_id, 'system', '대회 신청 만료',
           '결제 기한(24시간)이 지나 참가 신청이 자동 취소됐어요. 자리가 남아 있으면 다시 신청할 수 있어요.',
           'tournament', d.tournament_id
    from del d
    returning 1
  )
  select count(*) into v_count from del;
  return coalesce(v_count, 0);
end;
$$;
revoke execute on function public.expire_unpaid_tournament_entries(uuid) from public, anon;
grant execute on function public.expire_unpaid_tournament_entries(uuid) to authenticated, service_role;

-- (E) 결제 우회 차단 — 참가자 본인은 결제 컬럼·유료 대회 확정 상태를 직접 바꿀 수 없다
--   (승인 주체: 결제 서버(service_role) / 주최자 / super_admin. 체크인 등 다른 컬럼은 그대로 허용)
create or replace function public.protect_entry_payment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  vfee int;
  vorg uuid;
begin
  -- 내부 트리거(대기열 승격 등)·결제 서버(service_role)·서버측 세션(auth 컨텍스트 없음)은 통과
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return new; end if;
  if auth.uid() is null then return new; end if;

  select fee, organizer_id into vfee, vorg from public.tournaments where id = new.tournament_id;
  if auth.uid() = vorg or public.my_role() = 'super_admin' then return new; end if;

  if new.paid_at is distinct from old.paid_at
     or new.payment_id is distinct from old.payment_id
     or new.payment_deadline is distinct from old.payment_deadline then
    raise exception 'payment fields are server-managed';
  end if;
  if coalesce(vfee, 0) > 0 and new.status = 'approved' and old.status is distinct from 'approved' then
    raise exception 'paid tournament entries are confirmed by payment';
  end if;
  return new;
end;
$$;

drop trigger if exists on_protect_entry_payment on public.tournament_entries;
create trigger on_protect_entry_payment
  before update on public.tournament_entries
  for each row execute function public.protect_entry_payment();

-- (F) 백필: 기존 유료 대회의 미결제 pending 신청에 24h 마감 부여
update public.tournament_entries e
   set payment_deadline = now() + interval '24 hours'
  from public.tournaments t
 where t.id = e.tournament_id
   and t.fee > 0
   and e.status = 'pending'
   and e.paid_at is null
   and e.payment_deadline is null;
