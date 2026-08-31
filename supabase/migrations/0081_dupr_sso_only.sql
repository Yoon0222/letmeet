-- 0081: DUPR SSO-only 강화 — dupr_id 도 service_role(Edge) 만 변경 가능.
--   연결은 SSO(dupr-verify)로만 처리하므로, 사용자가 클라이언트에서 profiles.dupr_id 를
--   직접 써넣는 수동 경로를 차단한다(자가 위조 방지). dupr-verify 는 service_role 로
--   기록하므로 트리거를 우회한다. dupr_public(공개 토글)은 계속 사용자 편집 허용.
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
