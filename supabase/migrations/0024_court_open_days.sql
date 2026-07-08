-- 0024: 코트 영업일(오픈일)
-- 코트관리자(owner)/최고관리자가 연 날짜만 사용자에게 예약 가능일로 노출된다.
create table if not exists public.court_open_days (
  court_id   uuid not null references public.courts(id) on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  primary key (court_id, day)
);
create index if not exists court_open_days_court_idx on public.court_open_days (court_id, day);

alter table public.court_open_days enable row level security;

-- 조회는 공개(사용자가 예약 가능일 확인)
drop policy if exists "open_days_select" on public.court_open_days;
create policy "open_days_select" on public.court_open_days for select using (true);

-- 쓰기: 최고관리자 또는 해당 코트의 owner(코트관리자)
drop policy if exists "open_days_write" on public.court_open_days;
create policy "open_days_write" on public.court_open_days
  for all using (
    public.my_role() = 'super_admin'
    or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  )
  with check (
    public.my_role() = 'super_admin'
    or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  );
