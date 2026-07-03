-- 0009: 감사 로그(audit log)
-- 승인/거절/생성/수정/권한변경 등 주요 행위를 DB 트리거로 자동 기록.
-- 누가(actor_id/role) · 무엇을(action/entity) · 언제(created_at) · 어떻게(old→new).

create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id) on delete set null, -- 누가
  actor_role  text,                                                   -- 당시 역할 스냅샷
  action      text not null,          -- 무엇을 (예: tournament_entries.UPDATE)
  entity_type text not null,          -- 대상 테이블
  entity_id   text,                   -- 대상 식별자(복합키는 'tid:uid')
  old_data    jsonb,                  -- 변경 전
  new_data    jsonb,                  -- 변경 후
  created_at  timestamptz not null default now()  -- 언제
);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

-- 감사 기록 함수: 트리거가 붙은 테이블의 변경을 audit_logs 에 남긴다.
-- security definer 로 실행되어 RLS 를 우회해 무조건 기록(사용자가 위조/차단 불가).
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   jsonb := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
  v_entity text;
begin
  v_entity := coalesce(
    v_row->>'id',
    (v_row->>'tournament_id') || coalesce(':' || (v_row->>'user_id'), '')
  );

  insert into public.audit_logs(
    actor_id, actor_role, action, entity_type, entity_id, old_data, new_data
  ) values (
    v_actor,
    case when v_actor is null then null else public.my_role() end,
    TG_TABLE_NAME || '.' || TG_OP,
    TG_TABLE_NAME,
    v_entity,
    case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(OLD) else null end,
    case when TG_OP in ('INSERT', 'UPDATE') then to_jsonb(NEW) else null end
  );
  return null; -- AFTER 트리거
end;
$$;

-- 대상 테이블에 트리거 부착
drop trigger if exists audit_tournaments on public.tournaments;
create trigger audit_tournaments
  after insert or update or delete on public.tournaments
  for each row execute function public.audit_trigger();

drop trigger if exists audit_entries on public.tournament_entries;
create trigger audit_entries
  after insert or update or delete on public.tournament_entries
  for each row execute function public.audit_trigger();

drop trigger if exists audit_matches on public.tournament_matches;
create trigger audit_matches
  after insert or update or delete on public.tournament_matches
  for each row execute function public.audit_trigger();

-- 프로필은 역할 변경만 기록(일반 프로필 수정은 제외)
drop trigger if exists audit_profile_role on public.profiles;
create trigger audit_profile_role
  after update on public.profiles
  for each row when (old.role is distinct from new.role)
  execute function public.audit_trigger();

-- RLS: 조회는 슈퍼관리자만. 쓰기 정책 없음 → SECURITY DEFINER 트리거만 기록(불변 로그).
alter table public.audit_logs enable row level security;
drop policy if exists "audit_select_super" on public.audit_logs;
create policy "audit_select_super" on public.audit_logs
  for select using (public.my_role() = 'super_admin');
