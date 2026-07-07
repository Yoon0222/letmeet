-- 0017: 출전 신고(당일 체크인)
-- 대회 당일 선수가 출전 확인. null이면 미신고(노쇼 후보), 값이 있으면 신고 시각.
alter table public.tournament_entries
  add column if not exists checked_in_at timestamptz;
