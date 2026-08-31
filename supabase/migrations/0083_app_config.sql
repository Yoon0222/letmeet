-- 0083: 앱 버전 게이트 설정 (app_config, 단일 행).
--   앱이 실행 시 현재 버전과 비교해 강제/권장 업데이트를 띄운다.
--   min_version 미만 = 강제(차단), latest_version 미만 = 권장(안내). 기본 '0.0.0' = 게이트 비활성.
create table if not exists public.app_config (
  id             int primary key default 1 check (id = 1),   -- 단일 행 강제
  min_version    text not null default '0.0.0',              -- 이 미만은 강제 업데이트
  latest_version text not null default '0.0.0',              -- 이 미만은 권장 안내
  ios_url        text not null default '',
  android_url    text not null default 'https://play.google.com/store/apps/details?id=com.pinut.app',
  notice         text not null default '',
  updated_at     timestamptz not null default now()
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;
drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read" on public.app_config for select using (true);
drop policy if exists "app_config_write" on public.app_config;
create policy "app_config_write" on public.app_config for all
  using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
