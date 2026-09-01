-- 0085: DUPR 경기 수정·삭제 요청 — 등록된 경기는 개인(호스트)이 직접 수정/삭제 불가,
--   운영자(super_admin)에게 요청 → web-admin 에서 검토 후 실행 (DUPR match/update·delete).
--   레이팅 조작 방지 + 관리자 매개 변경으로 감사 흔적 유지 (DUPR 통합 리뷰 요건과 정합).

-- 1) 수정/삭제 요청 테이블
create table if not exists public.match_change_requests (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'meetup' check (source in ('meetup')),
  match_id     uuid not null references public.meetup_matches(id) on delete cascade,
  meetup_id    uuid not null references public.meetups(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('edit', 'delete')),
  message      text not null default '',              -- 요청 사유(수정이면 바뀔 내용)
  status       text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  resolved_by  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.match_change_requests enable row level security;

-- 조회: 본인 요청 + 운영자
drop policy if exists match_change_requests_select on public.match_change_requests;
create policy match_change_requests_select on public.match_change_requests
  for select using (requester_id = auth.uid() or public.my_role() = 'super_admin');

-- 생성: 그 모임의 호스트 본인만
drop policy if exists match_change_requests_insert on public.match_change_requests;
create policy match_change_requests_insert on public.match_change_requests
  for insert with check (
    requester_id = auth.uid()
    and exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid())
  );

-- 처리(상태 변경): 운영자만
drop policy if exists match_change_requests_update on public.match_change_requests;
create policy match_change_requests_update on public.match_change_requests
  for update using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

-- 2) meetup_matches 쓰기 정책 강화 — DUPR 등록된(submitted) 경기는 호스트 직접 수정/삭제 불가.
--    insert=호스트 / update·delete=호스트(미제출 경기만) 또는 운영자.
drop policy if exists meetup_matches_write_host on public.meetup_matches;

drop policy if exists meetup_matches_insert_host on public.meetup_matches;
create policy meetup_matches_insert_host on public.meetup_matches
  for insert with check (
    exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
  );

drop policy if exists meetup_matches_update_host on public.meetup_matches;
create policy meetup_matches_update_host on public.meetup_matches
  for update using (
    public.my_role() = 'super_admin'
    or (
      dupr_status <> 'submitted'
      and exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
    )
  );

drop policy if exists meetup_matches_delete_host on public.meetup_matches;
create policy meetup_matches_delete_host on public.meetup_matches
  for delete using (
    public.my_role() = 'super_admin'
    or (
      dupr_status <> 'submitted'
      and exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
    )
  );
