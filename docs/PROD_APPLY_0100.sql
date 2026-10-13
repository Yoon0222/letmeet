-- ============================================================================
-- PROD 적용: 0100 회원 탈퇴가 감사 기록 때문에 실패하던 문제 수정
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj) — SQL Editor 에 이 파일 전체를 붙여 넣고 실행
--
-- 증상: 대회를 만들었거나 참가 신청한 적이 있는 회원은 앱에서 "회원 탈퇴"가 항상 실패한다.
--   2026-10-14 운영 조회 기준으로는 데모 대회를 지운 뒤라 해당 회원이 0명이다(지우기 전에는 심사용 계정 1개를 포함해 8명).
--   대회가 다시 열리고 누군가 참가 신청하면 그 회원부터 다시 탈퇴가 막힌다 → 대회를 열기 전에, 가능하면 심사 전에 적용 권장.
-- 원인: 탈퇴 → 프로필 삭제 → 그 회원의 대회·참가·경기 행이 연쇄 삭제 → 감사 트리거가 "행위자 = 탈퇴하는 본인"을
--   기록하려는데 프로필이 이미 없어 외래키(audit_logs.actor_id)에 걸린다.
--
-- 내용: 함수 2개의 본문만 바꾼다(표·열·권한·트리거 연결은 그대로).
--   · audit_trigger()  : 행위자의 프로필이 없으면 행위자를 비워 둔다
--   · delete_account() : 탈퇴를 감사 기록에 한 줄 남긴다(account.delete — 회원 식별자와 당시 역할만, 개인정보 없음)
--
-- 영향: 평소의 감사 기록(운영자의 대회·참가 처리 등)은 전과 똑같이 남는다. 앱·관리자 웹 배포와 무관하게
--   이 파일만 먼저 적용할 수 있다(앱이 부르는 방식은 그대로). 다른 마이그레이션(0094·0096~0099)과 순서 무관.
--   관리자 웹의 감사 로그에서 "회원 탈퇴" 라벨은 웹 배포 뒤에 보인다(그 전에는 account.delete 로 표시).
--
-- 안전성: 여러 번 실행해도 된다(create or replace). 데이터는 바꾸지 않는다.
-- 검증(DEV): 고치기 전 회원 54명 중 53명 탈퇴 실패 → 고친 뒤 54명 전원 성공(한 명씩 지워 보고 되돌리는 시험).
-- ============================================================================

begin;

-- 0100: 회원 탈퇴가 감사 기록 때문에 실패하던 문제 수정
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

commit;

-- 적용 뒤 확인(셋 다 true 여야 한다)
select position('from public.profiles p where p.id = auth.uid()' in pg_get_functiondef('public.audit_trigger()'::regprocedure)) > 0 as audit_trigger_fixed,
       position('account.delete' in pg_get_functiondef('public.delete_account()'::regprocedure)) > 0 as delete_account_logs,
       has_function_privilege('authenticated', 'public.delete_account()', 'execute') as authenticated_can_call;
