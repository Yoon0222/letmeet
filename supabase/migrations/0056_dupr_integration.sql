-- 0056: DUPR 연동 — 레이팅 표시(A) + 소유 인증(B) 지원 + 보안.
--
--   기존: dupr_id(자가입력) · dupr_rating · dupr_verified.
--   추가: 복식/단식 분리 저장 + 연동 상태 + 동기화 시각.
--
--   🔒 보안 핵심: dupr_rating/verified/status 는 서버(Edge Function=service_role)만
--   쓸 수 있어야 한다. 안 그러면 사용자가 프로필 업데이트로 dupr_verified=true 를
--   스스로 켜서 "인증 배지"를 위조할 수 있다. 아래 트리거가 이를 막는다.

alter table public.profiles
  add column if not exists dupr_doubles  numeric(3,1),
  add column if not exists dupr_singles  numeric(3,1),
  add column if not exists dupr_status   text not null default 'none'
    check (dupr_status in ('none', 'linked', 'verified')),
  add column if not exists dupr_synced_at timestamptz;

comment on column public.profiles.dupr_status is
  'none=미연동 / linked=레이팅만 표시(A) / verified=DUPR 로그인 소유인증(B)';

-- 기존에 dupr_verified=true 인 행(없겠지만)을 status 와 정합화
update public.profiles set dupr_status = 'verified'
  where dupr_verified = true and dupr_status = 'none';

-- 🔒 DUPR 결과 컬럼은 service_role 만 변경 가능. 일반 사용자 업데이트는 이전 값 유지.
--    dupr_id 는 사용자가 입력하는 조회 키라 변경 허용.
create or replace function public.protect_dupr_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.dupr_rating    := old.dupr_rating;
    new.dupr_doubles   := old.dupr_doubles;
    new.dupr_singles   := old.dupr_singles;
    new.dupr_verified  := old.dupr_verified;
    new.dupr_status    := old.dupr_status;
    new.dupr_synced_at := old.dupr_synced_at;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_protect_dupr on public.profiles;
create trigger on_profile_protect_dupr
  before update on public.profiles
  for each row execute function public.protect_dupr_columns();
