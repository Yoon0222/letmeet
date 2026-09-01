-- ============================================================
-- PROD 통합 반영: 0084 ~ 0088 (v3.2.0 필수) — 2026-09-02
-- 운영 Supabase SQL Editor 에서 이 파일 전체를 한 번에 실행.
-- 내용: DUPR+ 게이팅(0084) · 경기 수정삭제 요청(0085) · 모임 종목(0086)
--       · 목록 match_count(0087) · 클럽 게시판(0088)
-- 순서 의존: 뷰(meetups_with_counts)를 여러 번 재생성하지만 마지막(0087)이 최종형.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- ▼ 0084_dupr_premium_events
-- ────────────────────────────────────────────────────────────
-- 0084: DUPR+ 프리미엄 이벤트 게이팅 — DUPR 통합 리뷰 요건(2026-09-01).
--   "Any match or tournament should be gated as an option for DUPR+ users.
--    (check only Premium_L1 and Verified_L1 user allowed to enter)"
--   · profiles.dupr_verified_l1 — VERIFIED_L1 자격 보유(SSO subscriptions 에서 동기화)
--   · meetups/tournaments.dupr_premium — 생성 시 "DUPR+ 전용" 옵션.
--     참가 게이트 = dupr_premium(PREMIUM_L1) + dupr_verified_l1(VERIFIED_L1) 둘 다 보유.

-- 1) VERIFIED_L1 자격 플래그 (서버만 갱신 — protect_dupr_columns)
alter table public.profiles
  add column if not exists dupr_verified_l1 boolean not null default false;

comment on column public.profiles.dupr_verified_l1 is
  'DUPR VERIFIED_L1 자격 보유. DUPR+ 전용 이벤트 참가 조건(PREMIUM_L1 과 함께).';

-- 2) 이벤트 "DUPR+ 전용" 플래그 (생성 옵션)
alter table public.meetups
  add column if not exists dupr_premium boolean not null default false;
alter table public.tournaments
  add column if not exists dupr_premium boolean not null default false;

comment on column public.meetups.dupr_premium is
  'DUPR+ 전용 번개 — PREMIUM_L1 + VERIFIED_L1 보유 회원만 참가(dupr_certified 와 함께 사용).';
comment on column public.tournaments.dupr_premium is
  'DUPR+ 전용 대회 — PREMIUM_L1 + VERIFIED_L1 보유 선수만 참가(dupr_certified 와 함께 사용).';

-- 3) protect_dupr_columns 에 dupr_verified_l1 포함 (service_role 만 변경)
create or replace function public.protect_dupr_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.dupr_id        := old.dupr_id;
    new.dupr_rating    := old.dupr_rating;
    new.dupr_doubles   := old.dupr_doubles;
    new.dupr_singles   := old.dupr_singles;
    new.dupr_verified  := old.dupr_verified;
    new.dupr_status    := old.dupr_status;
    new.dupr_synced_at := old.dupr_synced_at;
    new.dupr_basic     := old.dupr_basic;
    new.dupr_premium   := old.dupr_premium;
    new.dupr_verified_l1 := old.dupr_verified_l1;
    new.dupr_entitlements_synced_at := old.dupr_entitlements_synced_at;
  end if;
  return new;
end;
$$;

-- 4) 뷰 재생성 — m.*/t.* 고정이라 새 컬럼 포함하려면 drop 후 create (42P16 회피)
drop view if exists public.meetups_with_counts;
create view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count
from public.meetups m
join public.profiles p on p.id = m.host_id;

drop view if exists public.tournaments_with_counts;
create view public.tournaments_with_counts
with (security_invoker = true)
as
select
  t.*,
  p.nickname   as organizer_nickname,
  p.avatar_url as organizer_avatar_url,
  (select count(*) from public.tournament_entries e
     where e.tournament_id = t.id and e.status = 'approved') as approved_count,
  (select count(*) from public.tournament_entries e
     where e.tournament_id = t.id and e.status = 'pending') as pending_count
from public.tournaments t
join public.profiles p on p.id = t.organizer_id;

-- ────────────────────────────────────────────────────────────
-- ▼ 0085_match_change_requests
-- ────────────────────────────────────────────────────────────
-- 0085: DUPR 경기 수정·삭제 요청 — 등록된 경기는 개인(호스트)이 직접 수정/삭제 불가,
--   운영자(super_admin)에게 요청 → web-admin 에서 검토 후 실행 (DUPR match/update·delete).
--   레이팅 조작 방지 + 관리자 매개 변경으로 감사 흔적 유지 (DUPR 통합 리뷰 요건과 정합).

-- 1) 수정/삭제 요청 테이블
create table if not exists public.match_change_requests (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'meetup' check (source in ('meetup')),
  match_id     uuid not null references public.meetup_matches(id) on delete cascade,
  meetup_id    uuid not null references public.meetups(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  kind         text not null check (kind in ('edit', 'delete')),
  message      text not null default '',              -- 요청 사유(수정이면 바뀔 내용)
  status       text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  resolved_by  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.match_change_requests enable row level security;

-- 조회: 본인 요청 + 운영자
drop policy if exists match_change_requests_select on public.match_change_requests;
create policy match_change_requests_select on public.match_change_requests
  for select using (requester_id = auth.uid() or public.my_role() = 'super_admin');

-- 생성: 그 모임의 호스트 본인만
drop policy if exists match_change_requests_insert on public.match_change_requests;
create policy match_change_requests_insert on public.match_change_requests
  for insert with check (
    requester_id = auth.uid()
    and exists (select 1 from public.meetups m where m.id = meetup_id and m.host_id = auth.uid())
  );

-- 처리(상태 변경): 운영자만
drop policy if exists match_change_requests_update on public.match_change_requests;
create policy match_change_requests_update on public.match_change_requests
  for update using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

-- 2) meetup_matches 쓰기 정책 강화 — DUPR 등록된(submitted) 경기는 호스트 직접 수정/삭제 불가.
--    insert=호스트 / update·delete=호스트(미제출 경기만) 또는 운영자.
drop policy if exists meetup_matches_write_host on public.meetup_matches;

drop policy if exists meetup_matches_insert_host on public.meetup_matches;
create policy meetup_matches_insert_host on public.meetup_matches
  for insert with check (
    exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
  );

drop policy if exists meetup_matches_update_host on public.meetup_matches;
create policy meetup_matches_update_host on public.meetup_matches
  for update using (
    public.my_role() = 'super_admin'
    or (
      dupr_status <> 'submitted'
      and exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
    )
  );

drop policy if exists meetup_matches_delete_host on public.meetup_matches;
create policy meetup_matches_delete_host on public.meetup_matches
  for delete using (
    public.my_role() = 'super_admin'
    or (
      dupr_status <> 'submitted'
      and exists (select 1 from public.meetups m where m.id = meetup_matches.meetup_id and m.host_id = auth.uid())
    )
  );

-- ────────────────────────────────────────────────────────────
-- ▼ 0086_meetup_discipline
-- ────────────────────────────────────────────────────────────
-- 0086: 번개 모임 종목(discipline) — 복식/단식/자유. 생성 시 선택, 상세에 표시.
--   경기 기록 화면의 형식 기본값으로도 사용(자유면 복식 기본).

alter table public.meetups
  add column if not exists discipline text not null default 'any'
    check (discipline in ('any', 'singles', 'doubles'));

comment on column public.meetups.discipline is
  '모임 종목: any=자유(단복식 무관) / singles=단식 / doubles=복식';

-- 뷰 재생성 — m.* 고정이라 새 컬럼 포함하려면 drop 후 create
drop view if exists public.meetups_with_counts;
create view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count
from public.meetups m
join public.profiles p on p.id = m.host_id;

-- ────────────────────────────────────────────────────────────
-- ▼ 0087_meetup_match_count
-- ────────────────────────────────────────────────────────────
-- 0087: meetups_with_counts 에 경기 기록 수(match_count) 추가.
--   경기 기록이 입력된 모임은 번개 목록/추천에서 숨기기 위한 필터 컬럼.

drop view if exists public.meetups_with_counts;
create view public.meetups_with_counts
with (security_invoker = true)
as
select
  m.*,
  p.nickname    as host_nickname,
  p.avatar_url  as host_avatar_url,
  (select count(*) from public.meetup_participants mp where mp.meetup_id = m.id and mp.status = 'approved') as participant_count,
  (select count(*) from public.meetup_matches mm where mm.meetup_id = m.id) as match_count
from public.meetups m
join public.profiles p on p.id = m.host_id;

-- ────────────────────────────────────────────────────────────
-- ▼ 0088_club_board
-- ────────────────────────────────────────────────────────────
-- 0088: 클럽 게시판 — 클럽원 전용 글/댓글 + 공지(운영진).
--   조회/작성 = 승인 멤버·클럽장만(RLS). 공지(is_notice)는 클럽장/임원만 지정.

create table if not exists public.club_posts (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text not null default '',
  is_notice  boolean not null default false,   -- 공지(클럽장/임원만)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists club_posts_club_time on public.club_posts (club_id, is_notice desc, created_at desc);

create table if not exists public.club_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.club_posts(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade, -- RLS 단순화를 위한 비정규화
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists club_post_comments_post_time on public.club_post_comments (post_id, created_at);

alter table public.club_posts enable row level security;
alter table public.club_post_comments enable row level security;

-- 조회: 승인 멤버 또는 클럽장
drop policy if exists club_posts_select on public.club_posts;
create policy club_posts_select on public.club_posts
  for select using (
    exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
  );

-- 작성: 본인 + 승인 멤버/클럽장. 공지는 클럽장/임원만.
drop policy if exists club_posts_insert on public.club_posts;
create policy club_posts_insert on public.club_posts
  for insert with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
    )
    and (
      is_notice = false
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
    )
  );

-- 수정: 작성자 본인만 (공지 지정 조건은 insert 와 동일하게 유지)
drop policy if exists club_posts_update on public.club_posts;
create policy club_posts_update on public.club_posts
  for update using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (
      is_notice = false
      or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
    )
  );

-- 삭제: 작성자 본인 또는 클럽장/임원(운영 정리)
drop policy if exists club_posts_delete on public.club_posts;
create policy club_posts_delete on public.club_posts
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_posts.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
  );

-- 댓글: 조회/작성 = 멤버·클럽장, 삭제 = 본인 또는 클럽장/임원
drop policy if exists club_post_comments_select on public.club_post_comments;
create policy club_post_comments_select on public.club_post_comments
  for select using (
    exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_post_comments.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
  );

drop policy if exists club_post_comments_insert on public.club_post_comments;
create policy club_post_comments_insert on public.club_post_comments
  for insert with check (
    author_id = auth.uid()
    and (
      exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
      or exists (select 1 from public.club_members cm where cm.club_id = club_post_comments.club_id and cm.user_id = auth.uid() and cm.status = 'approved')
    )
  );

drop policy if exists club_post_comments_delete on public.club_post_comments;
create policy club_post_comments_delete on public.club_post_comments
  for delete using (
    author_id = auth.uid()
    or exists (select 1 from public.clubs c where c.id = club_id and c.owner_id = auth.uid())
    or exists (select 1 from public.club_members cm where cm.club_id = club_post_comments.club_id and cm.user_id = auth.uid() and cm.status = 'approved' and cm.role = 'officer')
  );

-- 목록용 뷰 — 작성자 + 댓글 수 (security_invoker: 기반 RLS 그대로 적용)
drop view if exists public.club_posts_with_authors;
create view public.club_posts_with_authors
with (security_invoker = true)
as
select
  p.*,
  pr.nickname   as author_nickname,
  pr.avatar_url as author_avatar_url,
  (select count(*) from public.club_post_comments cc where cc.post_id = p.id) as comment_count
from public.club_posts p
join public.profiles pr on pr.id = p.author_id;

-- ── 반영 확인 ──
select
  (select count(*) from information_schema.columns where table_name='profiles' and column_name='dupr_verified_l1') as c_0084,
  (select count(*) from information_schema.tables  where table_name='match_change_requests') as c_0085,
  (select count(*) from information_schema.columns where table_name='meetups' and column_name='discipline') as c_0086,
  (select count(*) from information_schema.columns where table_name='meetups_with_counts' and column_name='match_count') as c_0087,
  (select count(*) from information_schema.tables  where table_name='club_posts') as c_0088; -- 전부 1 이면 성공
