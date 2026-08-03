-- 0061: DUPR 운영요건 — 엔티틀먼트(자격) + SSO 토큰 저장.
--   DUPR RaaS 운영키 심사 요건:
--     · 경기 참가/등록 전 선수가 BASIC_L1 자격 보유(active)인지 확인
--     · SSO 의 user access/refresh token 저장(엔티틀먼트 재조회·갱신용)
--
--   보안: 토큰은 사용자 본인의 자격증명이라 profiles(전체 공개 조회)에 두면 안 된다
--   → 조회 정책이 전혀 없는 별도 테이블(dupr_credentials)에 두어 service_role(Edge)만 접근.

-- 1) 엔티틀먼트 플래그(공개 안전 — 불리언). 서버만 갱신(protect_dupr).
alter table public.profiles
  add column if not exists dupr_basic   boolean not null default false,  -- BASIC_L1(정상 회원) 보유+active
  add column if not exists dupr_premium boolean not null default false,  -- PREMIUM_L1(DUPR+) 보유
  add column if not exists dupr_entitlements_synced_at timestamptz;

comment on column public.profiles.dupr_basic is
  'DUPR BASIC_L1 자격 보유(active). 인증 경기 참가/등록의 최소 조건.';

-- 2) protect_dupr_columns 에 엔티틀먼트도 포함(service_role 만 변경)
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
    new.dupr_basic     := old.dupr_basic;
    new.dupr_premium   := old.dupr_premium;
    new.dupr_entitlements_synced_at := old.dupr_entitlements_synced_at;
  end if;
  return new;
end;
$$;

-- 3) SSO 토큰 저장소 — 아무도 조회 못 함(service_role 만). RLS 정책 없음 = 전면 차단.
create table if not exists public.dupr_credentials (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  updated_at       timestamptz not null default now()
);
alter table public.dupr_credentials enable row level security;
-- (일부러 어떤 정책도 만들지 않는다: authenticated/anon 은 전부 거부, service_role 만 우회)
