-- 0015: 코트 배정 확정 상태
-- 코트가 배정돼도(예정) 운영자가 '확정'해야 최종(경기 시작)이 되도록 플래그 추가.
alter table public.tournament_matches
  add column if not exists court_confirmed boolean not null default false;
