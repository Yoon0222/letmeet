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

// 프리미엄 플러스(월 9,900원 — 프리미엄 + 회비 자동결제) 노출 — 앱 쪽 킬스위치. 지금은 숨김(2026-10-13 결정).
// false 면 서버에서 플러스를 판매 중(club_plans.active)으로 켜도 앱에서 새로 고를 수 없다(클럽 만들기·플랜 관리).
// 이미 플러스인 클럽의 플랜 관리(다운그레이드·해지·카드 변경)는 그대로 된다 — 쓰던 클럽을 가두지 않는다.
// 다시 켤 때: 이 값과 아래 CLUB_DUES_ENABLED 를 함께 true 로.
export const CLUB_PLUS_ENABLED: boolean = false;

// 클럽 회비(카드 자동결제) 화면 노출 — 앱 쪽 킬스위치. 플러스 전용 기능이라 플러스와 함께 숨긴다.
// 켜더라도 실제 노출은 서버 스위치(platform_billing_settings.dues_enabled 또는 시범 클럽)까지 켜져 있어야 한다.
// 운영은 출시 조건(토스 지급대행 계약 등)이 갖춰질 때까지 서버 쪽도 꺼져 있다.
export const CLUB_DUES_ENABLED: boolean = false;
