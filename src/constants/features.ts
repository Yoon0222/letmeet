// 기능 플래그
//
// 소셜 로그인: 코드는 붙어 있으나, 각 provider 를 Supabase Auth 대시보드에서
// 설정(클라이언트 ID/시크릿 등)해야 실제로 동작한다. 설정이 끝나면 아래 값을
// true 로 바꿔 로그인 화면에 버튼을 노출한다.

// 카카오: account_email 동의항목은 카카오 "비즈앱 전환"(사업자 등록)이 있어야 열림.
// 배선(버튼→Supabase→카카오 로그인) 검증 완료(2026-07-21). 비즈앱 전환은 개업일
// 2026-08-03 이후 가능 → 그때 account_email 필수 동의 켜고 이 값을 true 로.
export const KAKAO_LOGIN_ENABLED = false;

// 구글: Google Cloud OAuth 클라이언트 + Supabase Google provider 설정 후 true 로.
// dev·prod Supabase 모두 Google provider 설정 완료 (2026-07-21).
export const GOOGLE_LOGIN_ENABLED = true;

// 애플: Apple Developer "Sign in with Apple" capability + Services ID/Key +
// Supabase Apple provider 설정 후 true 로. (iOS 전용 — 네이티브 버튼)
// dev·prod Supabase Apple provider 설정 완료 (2026-07-21). iOS 빌드에서만 버튼 노출.
export const APPLE_LOGIN_ENABLED = true;
