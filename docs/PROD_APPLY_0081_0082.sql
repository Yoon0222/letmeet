-- ============================================================
-- PROD 반영 번들 — 0081·0082 DUPR SSO-only 강화 + 계정 1:1
-- 운영 Supabase(jbvtdthtmrlndduqiikj) SQL Editor 에서 1회 실행. 멱등.
-- (함수 dupr-verify 는 별도 배포됨: supabase functions deploy dupr-verify --project-ref jbvtdthtmrlndduqiikj)
-- ============================================================

-- 0081: dupr_id 도 service_role(Edge) 만 변경 — 사용자 자가입력 차단(SSO-only)
create or replace function public.protect_dupr_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    new.dupr_id        := old.dupr_id;
    new.dupr_rating    := old.dupr_rating;
    new.dupr_doubles   := old.dupr_doubles;
    new.dupr_singles   := old.dupr_singles;
    new.dupr_verified  := old.dupr_verified;
    new.dupr_status    := old.dupr_status;
    new.dupr_synced_at := old.dupr_synced_at;
    new.dupr_basic     := old.dupr_basic;
    new.dupr_premium   := old.dupr_premium;
    new.dupr_entitlements_synced_at := old.dupr_entitlements_synced_at;
  end if;
  return new;
end;
$$;

-- 0082: 한 DUPR 계정(dupr_id)은 한 프로필에만. (prod 중복 없음 확인됨 2026-08-28)
--   혹시 중복이 있으면 이 인덱스 생성이 실패하니, 먼저 중복 정리 필요:
--     select dupr_id, count(*) from public.profiles where dupr_id is not null group by dupr_id having count(*) > 1;
create unique index if not exists profiles_dupr_id_uniq
  on public.profiles (dupr_id) where dupr_id is not null;

-- ============================================================
-- 검증 (모두 true 기대)
-- ============================================================
select
  exists (select 1 from pg_indexes where indexname = 'profiles_dupr_id_uniq') as unique_index_ok,
  (select count(*) from public.profiles p1
     join public.profiles p2 on p1.dupr_id = p2.dupr_id and p1.id <> p2.id
   where p1.dupr_id is not null) = 0 as no_duplicates_ok;
