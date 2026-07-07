-- 0014: 대회 코트 구성
-- 대회마다 코트 목록이 제각각(1~10번 / A~E / 센터코트 / 실내·외 혼합)이라
-- 자유롭게 코트 목록을 정의해 저장한다. 코트명 + 실내/실외.

create table if not exists public.tournament_courts (
  id            uuid primary key default uuid_generate_v4(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  name          text not null,                 -- 예: '1', 'A', '센터코트'
  indoor        boolean not null default true, -- true=실내, false=실외
  sort          int not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists tournament_courts_tid_idx on public.tournament_courts (tournament_id);

alter table public.tournament_courts enable row level security;

-- 조회는 공개, 쓰기는 주최자 또는 최고관리자
drop policy if exists "courts_select" on public.tournament_courts;
create policy "courts_select" on public.tournament_courts for select using (true);

drop policy if exists "courts_write_organizer" on public.tournament_courts;
create policy "courts_write_organizer" on public.tournament_courts
  for all using (
    public.my_role() = 'super_admin'
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  )
  with check (
    public.my_role() = 'super_admin'
    or auth.uid() = (select t.organizer_id from public.tournaments t where t.id = tournament_id)
  );

-- 경기에 배정 코트(선택) — 어느 코트에서 열리는 경기인지 (추후 배정 UI 대비)
alter table public.tournament_matches
  add column if not exists court_id uuid references public.tournament_courts(id) on delete set null;
