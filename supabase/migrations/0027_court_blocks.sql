-- 0027: 코트 연대관(정기 대관) — 매주 반복되는 예약 차단 시간대.
-- 예: 매주 화요일 19~21시는 A클럽 연대관 → 자동 오픈일이어도 그 시간은 예약 불가.
-- 시간 구간은 [start_hour, end_hour) (end 미포함). 예: 19~21 → 19,20시 슬롯 차단.
create table if not exists public.court_blocks (
  id         uuid primary key default uuid_generate_v4(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  weekday    int not null check (weekday between 0 and 6),   -- 0=일 ~ 6=토 (매주 반복)
  start_hour int not null check (start_hour between 0 and 23),
  end_hour   int not null check (end_hour between 1 and 24),
  label      text not null default '',                        -- 대관자(클럽명 등)
  created_at timestamptz not null default now(),
  constraint court_blocks_range_chk check (start_hour < end_hour)
);
create index if not exists court_blocks_court_idx on public.court_blocks (court_id);

alter table public.court_blocks enable row level security;
drop policy if exists "blocks_select" on public.court_blocks;
create policy "blocks_select" on public.court_blocks for select using (true);
drop policy if exists "blocks_write" on public.court_blocks;
create policy "blocks_write" on public.court_blocks
  for all using (
    public.my_role() = 'super_admin' or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  )
  with check (
    public.my_role() = 'super_admin' or auth.uid() = (select c.owner_id from public.courts c where c.id = court_id)
  );

-- 연대관 시간대 예약 차단(서버 강제) — UI 우회 방지.
create or replace function public.enforce_court_block()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.court_blocks b
    where b.court_id = new.court_id
      and b.weekday = extract(dow from new.slot_date)::int   -- 0=일 ~ 6=토 (JS getDay 와 동일)
      and new.hour >= b.start_hour and new.hour < b.end_hour
  ) then
    raise exception '연대관(정기 대관) 시간대는 예약할 수 없습니다.';
  end if;
  return new;
end;
$$;
drop trigger if exists court_reservations_block_check on public.court_reservations;
create trigger court_reservations_block_check
  before insert on public.court_reservations
  for each row execute function public.enforce_court_block();
