-- 0016: 대회 참가 대기열(waitlist)
-- 정원(max_participants) = 슬롯. 슬롯 점유 = status in ('pending','approved').
-- 정원이 차면 신규 신청은 자동으로 'waitlist'. 슬롯이 비면 대기열 맨 앞을 자동 승격.

-- 신규 신청 시 정원 초과면 대기열로
create or replace function public.enforce_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap int;
  occupied int;
begin
  -- 기본(pending) 신청만 대상 (운영자가 명시적으로 approved 넣는 경우는 제외)
  if new.status = 'pending' then
    select max_participants into cap from public.tournaments where id = new.tournament_id;
    select count(*) into occupied from public.tournament_entries
      where tournament_id = new.tournament_id and status in ('pending', 'approved');
    if cap is not null and occupied >= cap then
      new.status := 'waitlist';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_waitlist_insert on public.tournament_entries;
create trigger on_waitlist_insert
  before insert on public.tournament_entries
  for each row execute function public.enforce_waitlist();

-- 슬롯이 비면 대기열 맨 앞(신청 순)을 pending으로 자동 승격
create or replace function public.promote_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap int;
  occupied int;
  tid uuid;
  nextw uuid;
begin
  -- 내부 승격 update로 인한 재귀는 무시
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  tid := coalesce(new.tournament_id, old.tournament_id);
  select max_participants into cap from public.tournaments where id = tid;
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
    update public.tournament_entries set status = 'pending'
      where tournament_id = tid and user_id = nextw;
  end loop;
  return null;
end;
$$;

drop trigger if exists on_waitlist_promote on public.tournament_entries;
create trigger on_waitlist_promote
  after update or delete on public.tournament_entries
  for each row execute function public.promote_waitlist();
