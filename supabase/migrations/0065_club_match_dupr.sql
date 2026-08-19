-- 0065: 클럽 경기결과(club_match_results) DUPR 등록 대비 컬럼
--   · 클럽 내부 경기결과도 DUPR 에 제출(match/create) → 레이팅 반영.
--     번개/대회와 동일한 dupr_* 상태 컬럼을 둔다(엣지함수 dupr-match 의 source='club').
--   · 단일 게임 스코어(team1_score:team2_score)를 1게임으로 매핑해 제출.

alter table public.club_match_results
  add column if not exists dupr_identifier   text unique,                   -- 'club:'||id
  add column if not exists dupr_match_code    text,                          -- DUPR matchCode(수정/삭제용)
  add column if not exists dupr_status         text not null default 'pending'
    check (dupr_status in ('pending', 'submitted', 'failed', 'skipped')),
  add column if not exists dupr_submitted_at   timestamptz,
  add column if not exists dupr_error          text;
