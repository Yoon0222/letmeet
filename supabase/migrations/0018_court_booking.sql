-- 0018: 코트 예약 (사용자 예약)
-- courts: 예약 가능한 코트 시설. court_reservations: 시간(1시간) 단위 슬롯 예약.

create table if not exists public.courts (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  region       text not null default '',
  address      text not null default '',
  description  text not null default '',
  indoor       boolean not null default true,
  hourly_price int not null default 0,      -- 시간당 요금(원)
  open_hour    int not null default 6,       -- 운영 시작 시(0-23)
  close_hour   int not null default 22,      -- 운영 종료 시(0-23)
  image_url    text,
  owner_id     uuid references public.profiles(id) on delete set null, -- 코트 관리자
  created_at   timestamptz not null default now()
);
create index if not exists courts_region_idx on public.courts (region);

alter table public.courts enable row level security;
drop policy if exists "courts_facility_select" on public.courts;
create policy "courts_facility_select" on public.courts for select using (true);
drop policy if exists "courts_facility_write" on public.courts;
create policy "courts_facility_write" on public.courts
  for all using (
    public.my_role() in ('court_manager', 'super_admin') or auth.uid() = owner_id
  )
  with check (
    public.my_role() in ('court_manager', 'super_admin') or auth.uid() = owner_id
  );

create table if not exists public.court_reservations (
  id         uuid primary key default uuid_generate_v4(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  slot_date  date not null,
  hour       int not null,                  -- 예약 시각(0-23), 해당 1시간
  status     text not null default 'reserved', -- reserved | cancelled
  created_at timestamptz not null default now()
);
create index if not exists court_reservations_court_date_idx on public.court_reservations (court_id, slot_date);
create index if not exists court_reservations_user_idx on public.court_reservations (user_id);
-- 같은 코트·날짜·시각의 유효 예약 중복 방지
create unique index if not exists court_reservations_slot_uniq
  on public.court_reservations (court_id, slot_date, hour)
  where status = 'reserved';

alter table public.court_reservations enable row level security;
drop policy if exists "reservations_select" on public.court_reservations;
create policy "reservations_select" on public.court_reservations for select using (true);
drop policy if exists "reservations_insert_self" on public.court_reservations;
create policy "reservations_insert_self" on public.court_reservations
  for insert with check (auth.uid() = user_id);
drop policy if exists "reservations_update_self" on public.court_reservations;
create policy "reservations_update_self" on public.court_reservations
  for update using (auth.uid() = user_id);
drop policy if exists "reservations_delete_self" on public.court_reservations;
create policy "reservations_delete_self" on public.court_reservations
  for delete using (auth.uid() = user_id);
