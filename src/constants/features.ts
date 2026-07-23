// 기능 플래그
//
// 소셜 로그인: 코드는 붙어 있으나, 각 provider 를 Supabase Auth 대시보드에서
// 설정(클라이언트 ID/시크릿 등)해야 실제로 동작한다. 설정이 끝나면 아래 값을
// true 로 바꿔 로그인 화면에 버튼을 노출한다.

// 카카오: 배선·로그인 검증은 완료(2026-07-21)됐으나, account_email(필수 동의)은
// 비즈앱 전환(사업자 개업일 2026-08-03 이후) 전엔 "일반 사용자"가 못 받는다(팀원만 가능).
// → 2.0.0 출시엔 끄고(구글·애플만), 8/3 비즈앱 전환 후 true 로 켠다.
export const KAKAO_LOGIN_ENABLED = false;

// 구글: Google Cloud OAuth 클라이언트 + Supabase Google provider 설정 후 true 로.
// dev·prod Supabase 모두 Google provider 설정 완료 (2026-07-21).
export const GOOGLE_LOGIN_ENABLED = true;

// 애플: Apple Developer "Sign in with Apple" capability + Services ID/Key +
// Supabase Apple provider 설정 후 true 로. (iOS 전용 — 네이티브 버튼)
// dev·prod Supabase Apple provider 설정 완료 (2026-07-21). iOS 빌드에서만 버튼 노출.
export const APPLE_LOGIN_ENABLED = true;

// 결제(코트 예약 유료 결제): 토스페이먼츠 가맹점 심사 중(1~2개월). 라이브 키 나오기 전엔
// 유료 코트 결제를 숨긴다(무료 코트 예약은 그대로 동작). 심사 통과·라이브 키 등록 후 true 로.
export const PAYMENTS_ENABLED = false;
