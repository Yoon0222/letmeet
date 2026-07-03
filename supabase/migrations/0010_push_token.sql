-- 0010: 푸시 알림용 Expo 푸시 토큰 저장
-- 로그인한 기기에서 앱이 자신의 토큰을 profiles.push_token 에 저장한다.
-- (profiles 수정은 본인만 가능 — 기존 RLS 로 충분)

alter table public.profiles
  add column if not exists push_token text;
