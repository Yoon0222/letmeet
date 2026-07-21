-- 0049: 커뮤니티 — 전체 공개 게시판(카테고리별) + 글·사진·댓글·좋아요.
--   신고/차단은 기존 reports·user_blocks 재사용(App Store UGC 1.2).

-- (A) 게시글
create table if not exists public.community_posts (
  id         uuid primary key default uuid_generate_v4(),
  author_id  uuid not null references public.profiles(id) on delete cascade,
  category   text not null default 'free'
             check (category in ('free','question','market','review','tip')), -- 자유/질문/장터/후기/팁·정보
  title      text not null,
  body       text not null default '',
  images     text[] not null default '{}',   -- 여러 장, 첫 장이 커버 (대회 사진과 동일 패턴)
  is_pinned  boolean not null default false,  -- 운영자 공지 고정(향후)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists community_posts_category_idx on public.community_posts (category, created_at desc);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);

-- (B) 댓글 (1단계 평면 구조)
create table if not exists public.community_comments (
  id         uuid primary key default uuid_generate_v4(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);

-- (C) 좋아요
create table if not exists public.community_post_likes (
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists community_post_likes_user_idx on public.community_post_likes (user_id);

-- RLS ---------------------------------------------------------------
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_post_likes enable row level security;

-- 글: 조회 공개, 작성 본인, 수정·삭제 본인(+운영자 삭제)
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts for select using (true);
drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts for insert with check (auth.uid() = author_id);
drop policy if exists "community_posts_update" on public.community_posts;
create policy "community_posts_update" on public.community_posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);
drop policy if exists "community_posts_delete" on public.community_posts;
create policy "community_posts_delete" on public.community_posts for delete
  using (auth.uid() = author_id or public.my_role() in ('organizer','court_manager','super_admin'));

-- 댓글: 조회 공개, 작성 본인, 삭제 본인·글쓴이·운영자
drop policy if exists "community_comments_select" on public.community_comments;
create policy "community_comments_select" on public.community_comments for select using (true);
drop policy if exists "community_comments_insert" on public.community_comments;
create policy "community_comments_insert" on public.community_comments for insert with check (auth.uid() = author_id);
drop policy if exists "community_comments_delete" on public.community_comments;
create policy "community_comments_delete" on public.community_comments for delete
  using (
    auth.uid() = author_id
    or public.my_role() in ('organizer','court_manager','super_admin')
    or exists (select 1 from public.community_posts p where p.id = post_id and p.author_id = auth.uid())
  );

-- 좋아요: 조회 공개(집계용), 추가·삭제 본인
drop policy if exists "community_post_likes_select" on public.community_post_likes;
create policy "community_post_likes_select" on public.community_post_likes for select using (true);
drop policy if exists "community_post_likes_insert" on public.community_post_likes;
create policy "community_post_likes_insert" on public.community_post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "community_post_likes_delete" on public.community_post_likes;
create policy "community_post_likes_delete" on public.community_post_likes for delete using (auth.uid() = user_id);

-- 편의 뷰: 글 + 작성자 + 좋아요/댓글 수
create or replace view public.community_posts_with_counts
with (security_invoker = true)
as
select
  cp.*,
  p.nickname    as author_nickname,
  p.avatar_url  as author_avatar_url,
  p.skill_level as author_skill,
  (select count(*) from public.community_post_likes l where l.post_id = cp.id) as like_count,
  (select count(*) from public.community_comments  c where c.post_id = cp.id) as comment_count
from public.community_posts cp
join public.profiles p on p.id = cp.author_id;

-- (D) 신고 대상에 커뮤니티 글·댓글 추가
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('meetup','club','profile','tournament','community_post','community_comment'));

-- (E) 커뮤니티 이미지 버킷
insert into storage.buckets (id, name, public) values ('community-images', 'community-images', true) on conflict (id) do nothing;
drop policy if exists "community_images_read" on storage.objects;
create policy "community_images_read" on storage.objects for select using (bucket_id = 'community-images');
drop policy if exists "community_images_insert" on storage.objects;
create policy "community_images_insert" on storage.objects for insert with check (bucket_id = 'community-images' and auth.uid() is not null);
