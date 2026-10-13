-- 0100: 회원 탈퇴가 감사 기록 때문에 실패하던 문제 수정
--
-- 증상: 대회를 만들었거나 참가 신청한 적이 있는 회원은 탈퇴(delete_account)가 항상 실패했다.
--       ("insert or update on table audit_logs violates foreign key constraint audit_logs_actor_id_fkey")
-- 원인: 탈퇴 → 프로필 삭제 → 그 회원의 대회·참가·경기 행이 연쇄 삭제 → 감사 트리거(audit_trigger)가
--       "행위자 = 탈퇴하는 본인"으로 기록하려 하는데, 프로필이 이미 지워져 있어 외래키(audit_logs.actor_id)에 걸린다.
-- 수정:
--   · audit_trigger: 행위자의 프로필이 없으면 행위자를 비워 둔다
--     (0097 dues_audit_trigger·0099 challenges_touch 와 같은 방식 — 이 함수만 옛 방식으로 남아 있었다).
--   · delete_account: 탈퇴 자체를 감사 기록에 한 줄 남긴다(account.delete). 연쇄 삭제된 행들의 기록은
--     행위자가 비어 있지만, 같은 시각의 이 줄로 "누구의 탈퇴 때문인지" 알 수 있다.
--     닉네임·이메일 같은 개인정보는 남기지 않는다(회원 식별자와 당시 역할만).
-- 표·열·권한은 바뀌지 않는다. 여러 번 실행해도 된다.

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 회원 탈퇴로 연쇄 삭제될 때는 프로필이 이미 지워져 있다 → 그때는 행위자를 비워 둔다(외래키 오류 방지)
  v_actor uuid := (select p.id from public.profiles p where p.id = auth.uid());
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
  return null;
end;
$$;

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  select role into v_role from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;
  -- 탈퇴 기록: 개인정보 없이 회원 식별자와 당시 역할만. 행위자는 비운다(프로필이 이미 없다).
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id)
  values (null, v_role, 'account.delete', 'profiles', v_uid::text);
end;
$$;
revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
