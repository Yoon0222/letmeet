-- 0077: 정기모임 반복 스케줄 (매주 자동 개설·투표오픈)
--   클럽장이 요일/시각/투표 리드를 지정하면, 매주 해당 요일 세션을 자동 생성(status 'voting')한다.
--   생성 트리거 2중화: (a) pg_cron 일 1회(아래 주석) + (b) 앱 on-read RPC.
--   => cron 미설정이어도 앱 열람(홈·정기모임 목록) 시 밀린 회차가 보충된다.
--   세션 insert 시 0075 트리거가 클럽원에게 자동 푸시(=투표 유도).

-- 반복 규칙 (클럽장 관리)
create table if not exists public.club_session_schedules (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  weekday         int  not null check (weekday between 0 and 6),   -- 0=일 … 6=토 (Postgres dow / JS getDay 동일)
  start_time      time not null default '19:00',                  -- 정기모임 시작 시각(KST 벽시계)
  vote_open_days  int  not null default 5 check (vote_open_days between 0 and 21),  -- 세션 며칠 전 투표 오픈(=세션 생성)
  vote_close_days int  not null default 1 check (vote_close_days between 0 and 21), -- 세션 며칠 전 투표 마감
  title           text not null default '정기모임',
  location        text not null default '',
  court_count     int  not null default 2 check (court_count between 1 and 20),
  point_target    int  not null default 16 check (point_target between 1 and 99),
  format          text not null default 'americano' check (format in ('americano')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint css_vote_order_chk check (vote_open_days >= vote_close_days)
);
create index if not exists club_session_schedules_club_idx on public.club_session_schedules (club_id);

alter table public.club_session_schedules enable row level security;
-- 조회: 클럽 승인 멤버 또는 클럽장
drop policy if exists "css_select" on public.club_session_schedules;
create policy "css_select" on public.club_session_schedules for select using (
  exists (select 1 from public.club_members m
          where m.club_id = club_session_schedules.club_id and m.user_id = auth.uid() and m.status = 'approved')
  or exists (select 1 from public.clubs c
             where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
);
-- 쓰기: 클럽장만 (반복 정책은 클럽 정책이므로 오너 전용)
drop policy if exists "css_write_owner" on public.club_session_schedules;
create policy "css_write_owner" on public.club_session_schedules for all using (
  exists (select 1 from public.clubs c where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
) with check (
  exists (select 1 from public.clubs c where c.id = club_session_schedules.club_id and c.owner_id = auth.uid())
);

-- 세션 ↔ 스케줄 연결 (중복 생성 방지 + 자동/수동 구분)
alter table public.club_sessions add column if not exists schedule_id uuid references public.club_session_schedules(id) on delete set null;
create unique index if not exists club_sessions_schedule_date_uniq
  on public.club_sessions (schedule_id, session_date) where schedule_id is not null;

-- 도래한(투표 오픈 시점이 된) 회차를 생성. p_club_id 주면 해당 클럽만, null이면 전체(cron).
create or replace function public.generate_due_club_sessions(p_club_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int := 0;
  r record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_next date;
begin
  for r in
    select s.* from public.club_session_schedules s
    join public.clubs c on c.id = s.club_id
    where s.active
      and (p_club_id is null or s.club_id = p_club_id)
      and c.tier = 'premium'                       -- 프리미엄 사용 가능 클럽만
      and (c.premium_status = 'active'
           or (c.premium_status = 'trialing' and c.premium_trial_ends_at is not null and c.premium_trial_ends_at > now()))
  loop
    -- 오늘 포함, 다음 해당 요일
    v_next := v_today + ((r.weekday - extract(dow from v_today)::int + 7) % 7);
    -- 이번 회차 투표 마감이 이미 지났으면 다음 주 회차로
    if v_today > (v_next - r.vote_close_days) then
      v_next := v_next + 7;
    end if;
    -- 투표 오픈 시점 도달 & 아직 없으면 생성
    if v_today >= (v_next - r.vote_open_days)
       and not exists (select 1 from public.club_sessions where schedule_id = r.id and session_date = v_next) then
      begin
        insert into public.club_sessions
          (club_id, created_by, schedule_id, title, session_date, start_at, vote_deadline,
           location, court_count, point_target, format, status)
        values
          (r.club_id, r.created_by, r.id, r.title, v_next,
           (v_next + r.start_time) at time zone 'Asia/Seoul',
           ((v_next - r.vote_close_days) + r.start_time) at time zone 'Asia/Seoul',
           r.location, r.court_count, r.point_target, r.format, 'voting');
        v_count := v_count + 1;
      exception when unique_violation then
        null;  -- 동시 생성 경합 무시
      end;
    end if;
  end loop;
  return v_count;
end;
$$;

-- 앱(on-read)에서 호출: 자기 클럽 열람 시 밀린 회차 보충. 서비스롤/cron은 인자 없이 전체.
grant execute on function public.generate_due_club_sessions(uuid) to authenticated;

-- pg_cron 일 1회 자동 생성 (대시보드에서 pg_cron 확장 활성화 후 SQL Editor 1회 실행):
--   select cron.schedule('generate-club-sessions', '5 15 * * *',   -- 매일 00:05 KST (= 15:05 UTC)
--                        $$select public.generate_due_club_sessions()$$);
--   해제: select cron.unschedule('generate-club-sessions');
