-- 0060: DUPR 등록 경기의 matchCode 저장 — 이후 수정(match/update)/삭제(match/delete)에 필요.
--   create 응답의 result.matchCode 를 보관해야 나중에 점수 수정·경기 삭제를 DUPR 에 반영할 수 있다.

alter table public.meetup_matches
  add column if not exists dupr_match_code text;
alter table public.tournament_matches
  add column if not exists dupr_match_code text;
