-- 0058: DUPR 레이팅 그래프 — 공개 설정 + 히스토리 캐시.
--
--   dupr_public : 사용자가 자신의 DUPR 그래프를 공개 프로필에 노출할지 선택(기본 비공개).
--                 이건 사용자 취향값이라 protect_dupr_columns 보호 대상이 아니다(직접 수정 허용).
--   dupr_rating_history : DUPR /history(경기별 레이팅 변화) 스냅샷 캐시.
--                 서버(Edge Function=service_role)만 채우고, 앱은 여기서 빠르게 그래프를 그린다.

-- 1) 공개 설정 (사용자 편집 가능)
alter table public.profiles
  add column if not exists dupr_public boolean not null default false;

comment on column public.profiles.dupr_public is
  'DUPR 레이팅 그래프를 공개 프로필(player)에서 남에게 보일지 여부. 본인은 항상 봄.';

-- 2) 히스토리 캐시 테이블
create table if not exists public.dupr_rating_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    bigint,                    -- DUPR matchId (없을 수 있음)
  doubles     numeric(4,3),              -- 해당 시점 복식 레이팅
  singles     numeric(4,3),              -- 해당 시점 단식 레이팅
  recorded_at timestamptz not null,      -- DUPR created(경기/변화 시각)
  created_at  timestamptz not null default now(),
  -- 같은 유저의 같은 경기 중복 저장 방지(match_id 없을 땐 시각으로 구분)
  unique (user_id, match_id, recorded_at)
);

create index if not exists dupr_rating_history_user_time
  on public.dupr_rating_history (user_id, recorded_at);

alter table public.dupr_rating_history enable row level security;

-- 조회: 본인 것은 항상, 남의 것은 그 프로필이 공개(dupr_public)일 때만.
drop policy if exists dupr_history_select on public.dupr_rating_history;
create policy dupr_history_select on public.dupr_rating_history
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = dupr_rating_history.user_id and p.dupr_public = true
    )
  );

-- 쓰기: service_role(Edge Function) 전용 — authenticated/anon 은 정책 없음 → 거부.
--       (service_role 은 RLS 를 우회하므로 별도 정책 불필요.)
