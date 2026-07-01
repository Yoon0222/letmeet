-- ============================================================
-- 마이그레이션 0002 — 소셜 로그인(카카오) 대비 프로필 트리거 보완
--
-- 카카오 사용자는 이메일이 없을 수 있어, 메타데이터의 닉네임/이름/프로필
-- 이미지를 우선 사용하도록 handle_new_user 트리거 함수를 교체한다.
-- (이미 schema.sql 최신본을 실행했다면 이 파일은 실행 불필요)
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      '피클러'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
