-- 0091: 조추첨(대진 생성) 후 참가 잠금
--   · 대진이 생성된 대회의 '확정(approved)' 참가자는 스스로 취소 불가 (대진 파손 방지)
--     — 대기열·결제대기(pending)는 대진에 안 꼈으므로 계속 취소 가능, 만료 정리(expire)도 영향 없음
--   · 취소 주체: 주최자 / super_admin / 결제서버(service_role) 만
--   · 신규 신청 차단은 앱(canRegister)에서 처리 (status=registration && 대진 없음)

create or replace function public.protect_entry_after_draw()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  vorg uuid;
begin
  if pg_trigger_depth() > 1 then return old; end if;
  if coalesce(auth.jwt() ->> 'role', '') = 'service_role' then return old; end if;
  if auth.uid() is null then return old; end if; -- 서버측 세션(콘솔·크론)
  if old.status <> 'approved' then return old; end if; -- 대기열·결제대기는 허용
  if not exists (select 1 from public.tournament_matches m where m.tournament_id = old.tournament_id) then
    return old; -- 대진 생성 전이면 허용
  end if;
  select organizer_id into vorg from public.tournaments where id = old.tournament_id;
  if auth.uid() = vorg or public.my_role() = 'super_admin' then return old; end if;
  raise exception '대진 확정 후에는 참가를 취소할 수 없어요. 운영자에게 문의해 주세요.';
end;
$$;

drop trigger if exists on_protect_entry_after_draw on public.tournament_entries;
create trigger on_protect_entry_after_draw
  before delete on public.tournament_entries
  for each row execute function public.protect_entry_after_draw();
