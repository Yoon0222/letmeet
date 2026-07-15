-- 0042: 클럽 가입은 항상 운영자 승인제로 통일 (토글 제거).
-- 기존 클럽도 승인제로 전환하고, 기본값도 true 로.
update public.clubs set require_approval = true where require_approval = false;
alter table public.clubs alter column require_approval set default true;
