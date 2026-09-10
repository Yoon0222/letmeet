-- ⚠️ PROD 적용용 — 0093 원본과 동일. 전화번호 온보딩 게이트가 포함된 앱 빌드 배포와 함께 실행.
--    적용 후 기존 사용자는 다음 앱 실행 시 전화번호 입력 화면(온보딩)을 한 번 거친다(무해).
--    ⚠️ 앱만 먼저 배포되고 이 테이블이 없으면 전화번호 저장이 실패하므로 반드시 함께.

-- 0093: 사용자 전화번호 수집 (온보딩 게이트)
--   · 전화번호는 개인정보 → 공개 조회(using(true))인 profiles 대신 본인 전용 테이블에 저장
--   · 로그인 방식(이메일·구글·애플·카카오)과 무관하게 로그인 후 1회 입력
--   · 본인만 조회·입력·수정 (service_role 은 RLS 우회 → 추후 알림톡/서버 발송에서 읽음)

create table if not exists public.user_contact (
  id         uuid primary key references public.profiles(id) on delete cascade,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_contact enable row level security;

drop policy if exists "user_contact_select_own" on public.user_contact;
create policy "user_contact_select_own" on public.user_contact
  for select using (auth.uid() = id);

drop policy if exists "user_contact_insert_own" on public.user_contact;
create policy "user_contact_insert_own" on public.user_contact
  for insert with check (auth.uid() = id);

drop policy if exists "user_contact_update_own" on public.user_contact;
create policy "user_contact_update_own" on public.user_contact
  for update using (auth.uid() = id) with check (auth.uid() = id);
