-- 0012: 회원 탈퇴 (계정 삭제) — 앱 스토어 심사 필수
-- 클라이언트(anon)는 auth.users 를 직접 삭제할 수 없으므로, SECURITY DEFINER RPC 로
-- 로그인한 본인 계정을 삭제한다. auth.users 삭제 시 profiles(on delete cascade)로 이어지고,
-- profiles 를 참조하는 meetups/meetup_participants/clubs/club_members/tournaments/
-- tournament_entries 등도 각 FK 규칙(cascade/set null)에 따라 정리된다.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
