// 소셜 로그인 기능 플래그.
// 각 provider는 Supabase Auth 대시보드와 네이티브 설정이 모두 준비된 뒤 켠다.

// 카카오: 비즈 앱 전환 및 필수 동의 항목 설정 완료.
export const KAKAO_LOGIN_ENABLED = true;

// Google: dev/prod Supabase Google provider 설정 완료.
export const GOOGLE_LOGIN_ENABLED = true;

// Apple: iOS 빌드에서만 버튼 노출. Supabase Apple provider 설정 완료.
export const APPLE_LOGIN_ENABLED = true;

// 프리미엄 클럽 구독 결제(Toss 빌링) 노출 여부 — 킬스위치.
// 2026-08 App Store·Play 심사 모두 통과해 현재 ON. 단, Toss 외부결제는
// 애플 IAP(3.1.1)·구글 Play Billing 정책상 사후 단속 여지가 있어, 문제 시
// 이 값만 false 로 바꿔 즉시 구독 UI 차단(무료 체험은 유지). 실결제 전환 시
// 한국 외부결제 권한(entitlement) 또는 IAP 로 정식 정리 검토.
export const CLUB_SUBSCRIPTION_ENABLED: boolean = true;
