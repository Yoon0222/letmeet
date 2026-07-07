-- 0013: 대회 중복 참가 방지
-- 한 사람이 같은 대회에 두 번(직접 신청 + 남의 파트너로) 들어가지 못하게 막는다.
-- 신청(insert) 시: 신청자·파트너가 이미 그 대회의 신청자 또는 파트너면 거부.

create or replace function public.enforce_no_double_entry()
returns trigger
language plpgsql
as $$
begin
  -- 자기 자신을 파트너로 지정 불가
  if new.partner_id is not null and new.partner_id = new.user_id then
    raise exception '본인을 파트너로 지정할 수 없어요.';
  end if;

  -- 신청자가 이미 이 대회에 참가(신청자 또는 파트너)면 거부
  if exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and (e.user_id = new.user_id or e.partner_id = new.user_id)
  ) then
    raise exception '이미 이 대회에 참가 신청되어 있어요.';
  end if;

  -- 파트너가 이미 이 대회에 참가(신청자 또는 파트너)면 거부
  if new.partner_id is not null and exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and (e.user_id = new.partner_id or e.partner_id = new.partner_id)
  ) then
    raise exception '선택한 파트너는 이미 이 대회에 참가 중이에요.';
  end if;

  return new;
end;
$$;

drop trigger if exists on_no_double_entry on public.tournament_entries;
create trigger on_no_double_entry
  before insert on public.tournament_entries
  for each row execute function public.enforce_no_double_entry();
