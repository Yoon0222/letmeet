-- 0094: 출전 확인은 대회 운영자만 변경할 수 있다.
-- 참가자의 파트너 변경 등 기존 본인 수정 권한은 유지하되 checked_in_at 변경만 차단한다.
create or replace function public.enforce_tournament_checkin_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
begin
  if new.checked_in_at is not distinct from old.checked_in_at then
    return new;
  end if;

  -- 마이그레이션·서버 관리 작업은 허용하고, 로그인 사용자의 변경만 검사한다.
  if auth.uid() is null then
    return new;
  end if;

  select organizer_id into v_organizer_id
    from public.tournaments
   where id = new.tournament_id;

  if auth.uid() is distinct from v_organizer_id then
    raise exception '출전 확인은 대회 운영자만 할 수 있어요.';
  end if;

  return new;
end;
$$;

drop trigger if exists tournament_checkin_organizer_only on public.tournament_entries;
create trigger tournament_checkin_organizer_only
before update of checked_in_at on public.tournament_entries
for each row execute function public.enforce_tournament_checkin_organizer();
