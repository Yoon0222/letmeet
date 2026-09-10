-- 0093: 사용자 전화번호 수집 (온보딩 게이트)
--   · 전화번호는 개인정보 → profiles(공개 조회 using(true))에 넣지 않고 본인 전용 테이블에 저장
--   · 로그인 방식(이메일·구글·애플·카카오)과 무관하게 로그인 후 온보딩에서 1회 입력
--   · 본인만 조회·입력·수정 (service_role 은 RLS 우회 → 추후 알림톡/서버 발송에서 읽음)
--   · 지금은 형식 검증만(그냥 입력). SMS 인증은 추후 발송대행사 계약 시 phone_verified 로 확장.

create table if not exists public.user_contact (
  id         uuid primary key references public.profiles(id) on delete cascade,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_contact enable row level security;

-- 전화번호는 개인정보 — 공개 조회 금지, 본인만 접근
drop policy if exists "user_contact_select_own" on public.user_contact;
create policy "user_contact_select_own" on public.user_contact
  for select using (auth.uid() = id);

drop policy if exists "user_contact_insert_own" on public.user_contact;
create policy "user_contact_insert_own" on public.user_contact
  for insert with check (auth.uid() = id);

drop policy if exists "user_contact_update_own" on public.user_contact;
create policy "user_contact_update_own" on public.user_contact
  for update using (auth.uid() = id) with check (auth.uid() = id);
