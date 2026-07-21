-- 0046: 번개 장소를 등록 코트에 연결(court_id) + 미등록 코트 등록 요청.

-- (A) 모임 → 등록 코트 연결 (선택). 없으면 location_name 자유입력 유지.
alter table public.meetups add column if not exists court_id uuid references public.courts(id) on delete set null;

-- (B) 코트 등록 요청 — 검색에 없는 코트를 유저가 요청 → 운영자가 승인 시 courts 에 추가
create table if not exists public.court_registration_requests (
  id           uuid primary key default uuid_generate_v4(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  address      text not null default '',
  region       text not null default '',
  note         text not null default '',
  status       text not null default 'pending' check (status in ('pending','approved','rejected')),
  court_id     uuid references public.courts(id) on delete set null,  -- 승인 시 생성된 코트
  created_at   timestamptz not null default now()
);
create index if not exists court_reg_req_status_idx on public.court_registration_requests (status);

alter table public.court_registration_requests enable row level security;
-- 조회: 본인 요청 + 운영자/코트관리자/최고관리자
drop policy if exists "court_reg_req_select" on public.court_registration_requests;
create policy "court_reg_req_select" on public.court_registration_requests for select
  using (requester_id = auth.uid() or public.my_role() in ('organizer','court_manager','super_admin'));
-- 등록: 로그인 사용자가 본인 명의로
drop policy if exists "court_reg_req_insert" on public.court_registration_requests;
create policy "court_reg_req_insert" on public.court_registration_requests for insert
  with check (requester_id = auth.uid());
-- 처리(상태 변경): 코트관리자/최고관리자
drop policy if exists "court_reg_req_update" on public.court_registration_requests;
create policy "court_reg_req_update" on public.court_registration_requests for update
  using (public.my_role() in ('court_manager','super_admin'))
  with check (public.my_role() in ('court_manager','super_admin'));
