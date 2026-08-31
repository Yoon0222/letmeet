-- ============================================================
-- PROD 반영 번들 — 0083 앱 버전 게이트(app_config)
-- 운영 Supabase(jbvtdthtmrlndduqiikj) SQL Editor 에서 1회 실행. 멱등.
-- 실행만으로는 게이트 비활성('0.0.0'). 아래 UPDATE 로 값 넣으면 활성화.
-- ============================================================
create table if not exists public.app_config (
  id             int primary key default 1 check (id = 1),
  min_version    text not null default '0.0.0',
  latest_version text not null default '0.0.0',
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

-- 검증
select id, min_version, latest_version, android_url from public.app_config;

-- ============================================================
-- (나중에) 게이트 켜기 예시 — 스토어 URL 넣고 버전 지정:
--   update public.app_config set
--     latest_version = '3.1.2',                        -- 권장(닫기 가능) 안내 기준
--     min_version    = '3.1.0',                        -- 강제 업데이트 기준(이 미만 차단)
--     ios_url        = 'https://apps.apple.com/app/id<앱스토어ID>',
--     notice         = '새 기능과 개선이 있어요. 업데이트해 주세요.',
--     updated_at     = now()
--   where id = 1;
-- (iOS URL 은 App Store 출시 후 앱스토어ID 로 채우기)
-- ============================================================
