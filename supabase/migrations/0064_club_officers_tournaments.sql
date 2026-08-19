-- 0064: 클럽 임원진(officer) + 클럽 월례대회(tournaments.club_id)
--   · 임원진: club_members.role 에 'officer' 사용(기존 컬럼, CHECK 없음). 임명=클럽장 전용,
--     가입 승인/거절=클럽장 또는 임원. 임원은 관리 도우미(승인/거절·경기결과 기록).
--   · 월례대회: tournaments.club_id 로 클럽에 연결. 클럽장이 자기 클럽 대회를 직접 생성.

-- 1) tournaments ↔ clubs 링크 (null = 일반 대회 / 값 = 클럽 월례대회)
alter table public.tournaments add column if not exists club_id uuid references public.clubs(id) on delete set null;
create index if not exists tournaments_club_idx on public.tournaments (club_id, start_at desc);

-- 2) 대회 생성 정책 확장: 기존 organizer/admin + "자기 클럽 대회를 만드는 클럽장"
drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer" on public.tournaments
  for insert with check (
    auth.uid() = organizer_id
    and (
      public.my_role() in ('organizer', 'court_manager', 'super_admin')
      or (club_id is not null and exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid()))
    )
  );

-- 3) 임원 임명/해제 (클럽장 전용). owner 는 변경 대상 아님.
create or replace function public.set_club_officer(p_club_id uuid, p_user_id uuid, p_make_officer boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.clubs where id = p_club_id and owner_id = auth.uid()) then
    raise exception 'forbidden: owner only';
  end if;
  update public.club_members
     set role = case when p_make_officer then 'officer' else 'member' end
   where club_id = p_club_id and user_id = p_user_id and role <> 'owner' and status = 'approved';
end $$;
grant execute on function public.set_club_officer(uuid, uuid, boolean) to authenticated;

-- 4) 가입 승인/거절 (클럽장 또는 임원). 승인=status 'approved', 거절=pending 행 삭제.
create or replace function public.review_club_member(p_club_id uuid, p_user_id uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_allowed boolean;
begin
  select exists (select 1 from public.clubs c where c.id = p_club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members m
                  where m.club_id = p_club_id and m.user_id = auth.uid()
                    and m.role = 'officer' and m.status = 'approved')
    into v_allowed;
  if not v_allowed then raise exception 'forbidden'; end if;

  if p_approve then
    update public.club_members set status = 'approved'
     where club_id = p_club_id and user_id = p_user_id and status = 'pending';
  else
    delete from public.club_members
     where club_id = p_club_id and user_id = p_user_id and status = 'pending';
  end if;
end $$;
grant execute on function public.review_club_member(uuid, uuid, boolean) to authenticated;
