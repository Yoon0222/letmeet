-- 0045: 번개모임 항상 승인제 + 플레이어 리뷰(같이 친 사람만, 별점+한줄평).

-- (A) 번개 참여는 항상 호스트 승인 필요 (클럽 0042와 동일 정책)
update public.meetups set require_approval = true where require_approval = false;
alter table public.meetups alter column require_approval set default true;

-- (B) 함께 플레이 여부 — 리뷰 작성 자격 게이트.
--     같은 모임에 둘 다 승인 참가했거나, 한쪽이 호스트고 다른쪽이 그 모임 승인 참가자.
create or replace function public.have_played_together(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and (
    exists (
      select 1 from meetup_participants p1
      join meetup_participants p2 on p1.meetup_id = p2.meetup_id
      where p1.user_id = a and p1.status = 'approved'
        and p2.user_id = b and p2.status = 'approved'
    )
    or exists (
      select 1 from meetups m
      join meetup_participants p on p.meetup_id = m.id and p.status = 'approved'
      where (m.host_id = a and p.user_id = b) or (m.host_id = b and p.user_id = a)
    )
  );
$$;

-- (C) 플레이어 리뷰 — 한 사람당(reviewer) 상대(reviewee)에 리뷰 1개(수정 가능)
create table if not exists public.player_reviews (
  id           uuid primary key default uuid_generate_v4(),
  reviewer_id  uuid not null references public.profiles(id) on delete cascade,
  reviewee_id  uuid not null references public.profiles(id) on delete cascade,
  rating       int  not null check (rating between 1 and 5),
  comment      text not null default '',
  meetup_id    uuid references public.meetups(id) on delete set null,  -- 함께 친 모임(맥락)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (reviewer_id <> reviewee_id),
  unique (reviewer_id, reviewee_id)
);
create index if not exists player_reviews_reviewee_idx on public.player_reviews (reviewee_id);

alter table public.player_reviews enable row level security;
-- 조회는 공개(호스트가 신청자 리뷰를 봐야 함)
drop policy if exists "player_reviews_select" on public.player_reviews;
create policy "player_reviews_select" on public.player_reviews for select using (true);
-- 작성: 본인만, 그리고 상대와 함께 친 이력이 있어야
drop policy if exists "player_reviews_insert" on public.player_reviews;
create policy "player_reviews_insert" on public.player_reviews for insert
  with check (reviewer_id = auth.uid() and public.have_played_together(auth.uid(), reviewee_id));
drop policy if exists "player_reviews_update" on public.player_reviews;
create policy "player_reviews_update" on public.player_reviews for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
drop policy if exists "player_reviews_delete" on public.player_reviews;
create policy "player_reviews_delete" on public.player_reviews for delete
  using (reviewer_id = auth.uid());

-- 리뷰 + 리뷰어 프로필
create or replace view public.player_reviews_with_reviewer
with (security_invoker = true) as
select r.*, p.nickname as reviewer_nickname, p.avatar_url as reviewer_avatar_url, p.skill_level as reviewer_skill
from public.player_reviews r
join public.profiles p on p.id = r.reviewer_id;

-- 리뷰 집계(평균·개수)
create or replace view public.player_review_stats
with (security_invoker = true) as
select reviewee_id, count(*)::int as review_count, round(avg(rating)::numeric, 1) as avg_rating
from public.player_reviews
group by reviewee_id;
