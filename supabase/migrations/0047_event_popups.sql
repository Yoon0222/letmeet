-- 0047: 이벤트 팝업 — 관리자 웹에서 등록/수정, 올리기·내리기(active), 노출 기간 설정.
create table if not exists public.event_popups (
  id         uuid primary key default uuid_generate_v4(),
  title      text not null,
  body       text not null default '',
  active     boolean not null default false,        -- 올리기/내리기
  starts_at  timestamptz,                           -- null = 즉시 시작
  ends_at    timestamptz,                           -- null = 종료 없음
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists event_popups_active_idx on public.event_popups (active, starts_at, ends_at);

alter table public.event_popups enable row level security;
-- 조회: 공개 (앱이 노출 대상 팝업을 읽어야 함)
drop policy if exists "event_popups_select" on public.event_popups;
create policy "event_popups_select" on public.event_popups for select using (true);
-- 쓰기: 최고관리자만
drop policy if exists "event_popups_insert" on public.event_popups;
create policy "event_popups_insert" on public.event_popups for insert
  with check (public.my_role() = 'super_admin');
drop policy if exists "event_popups_update" on public.event_popups;
create policy "event_popups_update" on public.event_popups for update
  using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
drop policy if exists "event_popups_delete" on public.event_popups;
create policy "event_popups_delete" on public.event_popups for delete
  using (public.my_role() = 'super_admin');
