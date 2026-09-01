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
