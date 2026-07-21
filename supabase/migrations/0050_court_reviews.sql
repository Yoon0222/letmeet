-- 0050: 코트 리뷰 — 별점 + 한줄평. 그 코트를 예약한 사람만 작성(플레이어 리뷰와 동일 신뢰 모델).

-- (A) 예약 이력 게이트 — 리뷰 작성 자격
create or replace function public.has_reserved_court(a uuid, c uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from court_reservations r
    where r.user_id = a and r.court_id = c and r.status = 'reserved'
  );
$$;

-- (B) 코트 리뷰 — 한 사람당 코트 1개(수정 가능)
create table if not exists public.court_reviews (
  id         uuid primary key default uuid_generate_v4(),
  court_id   uuid not null references public.courts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  rating     int  not null check (rating between 1 and 5),
  comment    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (court_id, user_id)
);
create index if not exists court_reviews_court_idx on public.court_reviews (court_id, created_at desc);

alter table public.court_reviews enable row level security;
-- 조회 공개
drop policy if exists "court_reviews_select" on public.court_reviews;
create policy "court_reviews_select" on public.court_reviews for select using (true);
-- 작성: 본인 + 그 코트 예약 이력
drop policy if exists "court_reviews_insert" on public.court_reviews;
create policy "court_reviews_insert" on public.court_reviews for insert
  with check (user_id = auth.uid() and public.has_reserved_court(auth.uid(), court_id));
-- 수정: 본인
drop policy if exists "court_reviews_update" on public.court_reviews;
create policy "court_reviews_update" on public.court_reviews for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- 삭제: 본인 + 운영자
drop policy if exists "court_reviews_delete" on public.court_reviews;
create policy "court_reviews_delete" on public.court_reviews for delete
  using (user_id = auth.uid() or public.my_role() in ('organizer','court_manager','super_admin'));

-- 리뷰 + 작성자 프로필
create or replace view public.court_reviews_with_author
with (security_invoker = true) as
select r.*, p.nickname as author_nickname, p.avatar_url as author_avatar_url, p.skill_level as author_skill
from public.court_reviews r
join public.profiles p on p.id = r.user_id;

-- 코트별 집계(평균·개수)
create or replace view public.court_review_stats
with (security_invoker = true) as
select court_id, count(*)::int as review_count, round(avg(rating)::numeric, 1) as avg_rating
from public.court_reviews
group by court_id;

-- (C) 신고 대상에 코트 리뷰 추가
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('meetup','club','profile','tournament','community_post','community_comment','court_review'));
