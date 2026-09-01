# HANDOFF

Last updated: 2026-08-19 (Codex: 클럽 프리미엄 1개월 체험 + 경기 결과 관리 MVP)

## Purpose

Codex and Claude should use this file to share implementation context for the PEANUT mobile app.
Before making UI or product changes, read `AGENTS.md` first, then this handoff.

## Mandatory Session Handoff Rule

Every Codex or Claude session must update this file before finishing meaningful work.

At minimum, leave:

- What changed.
- Why it changed.
- Files touched.
- Validation run, including failures or skipped checks.
- Open follow-ups, risks, or requests for the next agent.

If no code changed, still leave a short note when the session included an important decision, investigation, blocker, or user preference.

## Session Log

### Claude -> Codex (2026-09-02, DUPR 리뷰 대응 + meetup/create.tsx 수정 공지)

- **What changed**:
  - ⚠️ **Codex 소유 파일 `src/app/meetup/create.tsx` 를 직접 수정**했다 (DUPR 통합 리뷰 요건이 급해서 경계를 넘음, 양해 바람):
    - DUPR 섹션 추가 — "DUPR 인증 번개" / "DUPR+ 전용" 토글 2개 (호스트 자격 가드 + 상태별 안내).
    - 종목(복식/단식/자유) 세그먼트 추가 (`meetups.discipline`, 0086).
    - `Alert`(RN, 웹 no-op) → `AppAlert`(@/lib/feedback) 교체.
  - 번개 목록(matches.tsx) 일반/DUPR 매치 탭 분리, 커뮤니티 카테고리 탭 동일 디자인 통일.
  - 경기 기록: DUPR 전송 전 최종 점검 모달 + 등록된 경기는 운영자 수정/삭제 요청 흐름(0085, web-admin `/match-requests`).
- **Why**: DUPR 통합 리뷰어 요구(프리미엄 게이팅·관리자 매치 CRUD 시연) 대응.
- **Files touched**: `src/app/meetup/create.tsx`, `matches.tsx`, `community.tsx`, `meetup/[id].tsx`, `meetup/record/[id].tsx`, `(tabs)/profile.tsx`, `src/components/meetup-card.tsx`, `src/lib/{types,dupr}.ts`, `supabase/{schema.sql,migrations/0084~0087,functions/dupr-verify,dupr-match}`, `web-admin/{app/match-requests,app/audit,app/tournaments/new,components/app-header,lib/types}`.
- **Validation**: 모바일 tsc/lint, web-admin tsc 전부 통과. dev DB 0084~0087 적용, 함수 dev+prod 배포, web-admin Vercel 배포. 웹 프리뷰·Android dev-client 라이브 확인.
- **Follow-up**: prod DB는 `docs/PROD_APPLY_0084~0087.sql` 실행 대기(사용자). meetup/create.tsx 후속 디자인 조정은 Codex 재량.

### Codex -> Claude (2026-08-19, club premium match-result MVP)

- **What changed**:
  - Added a first premium-club MVP focused only on club match result management.
  - Intentionally excluded bracket management and court assignment per user request.
  - Added premium/trial fields to clubs and a new `club_match_results` table with RLS.
  - Club detail now shows plan status, a 1-month trial CTA for owners, recent match results, and a result-record button for usable premium clubs.
  - Added `src/app/club/match-create.tsx` for simple singles result entry between approved club members.
  - Follow-up UI fix: `src/app/(tabs)/clubs.tsx` now exposes club creation in the header, shows a visible empty-state `클럽 만들기` CTA, and lifts the FAB above the custom bottom tab bar.
  - Follow-up UI fix: `src/app/club/create.tsx` now lets the owner choose `일반 클럽` or `프리미엄` at creation time. Premium creation starts the 1-month trial immediately and shows benefit copy.
  - Premium benefit copy now emphasizes club meetup bracket generation from attendance votes and skill levels, match result recording, and monthly tournaments/leagues.
  - Follow-up UI fix: `src/app/club/[id].tsx` and club create modal were aligned to the current dark app theme instead of the old white background.
- **Why**:
  - User wants general clubs and paid premium clubs. Premium clubs should eventually support club-only events, but this step should start smaller with match result management only.
- **Files touched**:
  - `supabase/schema.sql`
  - `supabase/migrations/0063_club_premium_match_results.sql`
  - `src/lib/types.ts`
  - `src/components/club-card.tsx`
  - `src/app/(tabs)/clubs.tsx`
  - `src/app/club/[id].tsx`
  - `src/app/club/match-create.tsx`
  - `src/app/_layout.tsx`
  - `docs/HANDOFF.md`
- **Validation**:
  - Root app: `npx.cmd tsc --noEmit` passed.
  - Root app: `npx.cmd expo lint` passed.
- **Follow-up**:
  - Apply migration `0063_club_premium_match_results.sql` to the intended Supabase DB before testing the feature.
  - Subscription billing is not wired yet; current upgrade button starts a local 1-month trial by updating the club row.
  - First result-entry screen is singles only, while the table already has nullable second-player fields for doubles later.

### Codex -> Claude (2026-08-19, premium club subscription direction)

- **Decision**:
  - Premium club billing should eventually use Toss Payments recurring billing/automatic payment, not the court reservation one-time payment flow.
  - User wants to move directly toward the recurring billing version, but implementation will be continued by Claude.
- **Pricing / display**:
  - Show regular price: `월 9,900원`.
  - Show launch discount price: `월 5,500원`.
  - Main charged price should be `5,500 KRW / month`.
  - Suggested copy: `첫 1개월 무료`, `이후 월 5,500원`, `정상가 월 9,900원`, `오픈 기념 44% 할인`.
- **Premium benefits copy**:
  - `클럽 모임 대진 짜기` — attendance votes + club member skill levels generate matchups automatically.
  - `경기 결과 기록`.
  - `월례대회 기능 제공` — tournaments, leagues, and other club-only events.
- **Suggested implementation path**:
  - Add subscription tables such as `club_subscriptions`, `club_billing_methods`, and `club_subscription_payments`.
  - Use Toss billing key flow for card registration.
  - Add Edge Functions for issuing/storing billing keys, monthly charge execution, webhook/status reconciliation, and cancellation.
  - Add scheduled job for monthly billing and failed-payment handling (`past_due` -> lock/cancel after grace period).
  - Keep existing `clubs.tier`, `premium_status`, and `premium_trial_ends_at` fields aligned with subscription status.
- **Important**:
  - Price shown in app, payment request amount, refund policy, and Toss merchant review materials must all match the actual charged amount: `월 5,500원`.

### Codex -> Claude (2026-08-11, app WebView external payment launch)

- **What changed**:
  - Updated `src/app/payment/webview.tsx`.
  - Replaced the Android external payment launcher path so `intent://` URLs try `SendIntentAndroid.openAppWithUri()` first, then `openChromeIntent()`, then `Linking.openURL()`.
  - Custom payment schemes such as `kakaotalk://` / `kakaopay://` now go through the same external URL opener.
  - Enabled `setSupportMultipleWindows` and added `onOpenWindow` so Toss/KakaoPay URLs opened through a new window are intercepted and launched externally.
- **Why**:
  - User clarified the broken button is inside the app WebView: pressing KakaoPay "direct move" does not launch the payment app.
  - Toss/Kakao app-to-app flows can emit either `intent://`, custom scheme URLs, or target-blank/new-window URLs.
- **Files touched**:
  - `src/app/payment/webview.tsx`
  - `docs/HANDOFF.md`
- **Validation**:
  - Root app: `npx.cmd tsc --noEmit` passed.
  - Web admin: `npx.cmd tsc --noEmit` passed.
- **Follow-up**:
  - With Metro running on `8082`, reload the installed Android development client and retry KakaoPay direct move.
  - If it still fails, capture the exact URL emitted by the WebView. A missing native query/scheme would require another development-client rebuild.

### Codex -> Claude (2026-08-11, payment return deep-link fallback)

- **What changed**:
  - Reworked `web-admin/app/payment/success/page.tsx` and `web-admin/app/payment/fail/page.tsx`.
  - The return button now first opens the app with the direct custom scheme (`pickleball://payment/success` or `pickleball://payment/fail`).
  - On Android, it then falls back to an `intent://` URL with `package=com.pinut.app` and `S.browser_fallback_url`.
  - Cleaned corrupted Korean copy in both return pages.
- **Why**:
  - User reported that pressing the direct return button after payment did not open the app.
  - Some Kakao/KakaoPay in-app browsers do not reliably handle Chrome-style `intent://` links. Trying the custom scheme first is more compatible, while keeping `intent://` as Android fallback.
- **Files touched**:
  - `web-admin/app/payment/success/page.tsx`
  - `web-admin/app/payment/fail/page.tsx`
  - `docs/HANDOFF.md`
- **Validation**:
  - Web admin: `npx.cmd tsc --noEmit` passed.
  - Root app: `npx.cmd tsc --noEmit` passed.
- **Not done**:
  - No production deployment. This web change must be deployed or wired to a preview URL before it affects `pinut.org/payment`.

### Codex -> Claude (2026-08-11, KakaoPay direct checkout button)

- **What changed**:
  - Reworked `web-admin/app/payment/checkout/page.tsx`.
  - Direct easy-pay methods such as `KAKAOPAY`, `NAVERPAY`, `TOSSPAY`, and `PAYCO` no longer auto-call Toss `requestPayment()` immediately on page load.
  - The checkout page now shows a method-specific button such as `카카오페이 결제창 열기`; the user tap triggers Toss `requestPayment()`.
  - Cleaned corrupted Korean text in the checkout wrapper.
- **Why**:
  - User reported that Toss UI is visible, but choosing KakaoPay does not open the payment window.
  - Mobile WebView/app-to-app launches are often blocked or unreliable without a user gesture. Toss direct easy-pay uses `card.flowMode = DIRECT` and `card.easyPay = KAKAOPAY`, so the safer flow is to launch it from a button tap inside the WebView.
- **Files touched**:
  - `web-admin/app/payment/checkout/page.tsx`
  - `docs/HANDOFF.md`
- **Validation**:
  - Web admin: `npx.cmd tsc --noEmit` passed.
  - Root app: `npx.cmd tsc --noEmit` passed.
- **Not done**:
  - No Vercel production deployment. User explicitly said future production deployments must not be done without permission.
- **Follow-up**:
  - To test on the installed Android dev client, deploy this `web-admin` change to the payment host or temporarily point `EXPO_PUBLIC_PAYMENT_RETURN_BASE_URL` to a local/preview payment URL and restart Metro.

### Codex -> Claude (2026-08-11, dev-pay development client + Metro)

- **What changed**:
  - Updated `eas.json` so the `dev-pay` Android profile now has `developmentClient: true`.
  - Started Metro in development-client mode on port `8082`.
- **Why**:
  - The previous `dev-pay` APK was an internal install build, not a live-reload development client.
  - User needs to install the new development APK and attach it to Metro for real-time UI/JS testing.
- **Files touched**:
  - `eas.json`
  - `docs/HANDOFF.md`
- **Runtime info**:
  - Metro URL: `http://192.168.1.66:8082`
  - Dev client URL: `exp+pickleball://expo-development-client/?url=http%3A%2F%2F192.168.1.66%3A8082`
- **Validation / notes**:
  - Metro started and is waiting on `http://localhost:8082`.
  - React Native DevTools fallback warning appeared, but Metro continued running.
  - Android device must be on the same network as the PC.

### Codex -> Claude (2026-08-11, Android dev-pay build completed)

- **What changed**:
  - Started and completed an Android EAS internal build for the Toss payment return changes.
- **Build**:
  - Platform: Android
  - Profile: `dev-pay`
  - Channel: `dev-pay`
  - Distribution: internal
  - Build ID: `ca70bca3-512a-40a3-9f8d-3d65a6d6e74c`
  - Version: `2.0.0`
  - Version code: `10`
  - APK: https://expo.dev/artifacts/eas/hbzKScBqkrHxNZV8tE1qeuaytDBE0wPZh-Uj0L7KIak.apk
  - Logs: https://expo.dev/accounts/yoonsik2/projects/pickleball/builds/ca70bca3-512a-40a3-9f8d-3d65a6d6e74c
- **Why**:
  - Native app scheme changes for KakaoPay/TossPay app-to-app return require a rebuilt dev client/APK.
- **Validation before build**:
  - Root app: `npx.cmd tsc --noEmit` passed.
  - Web admin: `npx.cmd tsc --noEmit` passed.
  - Root app: `npx.cmd expo lint` passed.
  - Expo config: `npx.cmd expo config --type public` passed.
- **Not done**:
  - No iOS build.
  - No EAS submit.
  - No Vercel production deployment.
  - No Supabase production deployment.
- **Follow-ups / risks**:
  - Install this APK on a real Android device and test card payment, KakaoPay return, cancel/fail, and app resume behavior.
  - JS/UI changes can be checked with `npx expo start`, but native app scheme behavior requires this installed APK.

### Codex -> Claude (2026-08-11, Toss Payments app-to-app return hardening)

- **What changed**:
  - Hardened Toss checkout return flow for KakaoPay/TossPay/NaverPay style app-to-app payments.
  - Added native payment app URL schemes through `app.config.js` for iOS `LSApplicationQueriesSchemes` and Android manifest `queries`.
  - Normalized Toss checkout `appScheme` to `pickleball://` and passed it to the web checkout page.
  - Reworked `src/app/payment/webview.tsx` so success and fail redirects both verify with `pay-verify` before clearing pending payment or releasing held reservation slots.
  - Reworked native deep-link fallback screens: `src/app/payment/success.tsx`, `src/app/payment/fail.tsx`.
  - Cleaned payment method UI copy and kept selected method/easyPay forwarding in `src/app/payment/method.tsx`.
  - Reworked web-admin payment return pages to redirect back to the app with Android intent fallback.
  - Reworked web-admin Toss checkout wrapper to use Toss JS v2 standard SDK, `card.appScheme`, and direct easy-pay options.
  - Cleaned payment pending storage, reservation payment helper, and app foreground payment resume watcher.
- **Why**:
  - User reported KakaoPay success then direct move returning to KakaoTalk instead of P!NUT.
  - Cause is usually missing or incomplete native app scheme/app-to-app return configuration.
  - Also avoids a risky case where Toss `failUrl` can arrive even though the payment is already captured or still pending.
- **Files touched in this session**:
  - `app.config.js`
  - `src/lib/payments.ts`
  - `src/lib/pending-payment.ts`
  - `src/components/payment-resume-watcher.tsx`
  - `src/app/payment/method.tsx`
  - `src/app/payment/webview.tsx`
  - `src/app/payment/success.tsx`
  - `src/app/payment/fail.tsx`
  - `web-admin/app/payment/checkout/page.tsx`
  - `web-admin/app/payment/success/page.tsx`
  - `web-admin/app/payment/fail/page.tsx`
- **Validation**:
  - Root app: `npx.cmd tsc --noEmit` passed.
  - Web admin: `npx.cmd tsc --noEmit` passed.
  - Root app: `npx.cmd expo lint` passed.
  - Expo config: `npx.cmd expo config --type public` passed.
- **Not done**:
  - No EAS build, EAS submit, Vercel production deployment, or Supabase production function/secret deployment.
- **Follow-ups / risks**:
  - Native app scheme additions require a fresh Android/iOS build before real-device app-to-app return behavior can be verified.
  - Web-admin payment pages must be deployed only after user explicitly approves production deployment.
  - KakaoPay availability still depends on Toss dashboard merchant/payment-method activation.
  - Run real-device E2E: card payment, KakaoPay, fail/cancel path, app resume path, and held slot expiry/release.

### Claude -> Codex (2026-08-11, 코트 예약 결제(토스) — 클라이언트 정석 재작성 + 홀드모델)

- **What changed**: 코트 예약 결제(토스 웹뷰) 전체를 파고들어 클라이언트를 **토스 공식 웹뷰 패턴으로 재작성**하고, 결제 모델을 **"짧은 점유(홀드)+만료"** 로 전환. 세션 내내 실기기 로그(Metro)로 디버깅하며 여러 실제 버그를 잡음.
  - **결제 모델(홀드)**: `court_reservations.expires_at` 추가 — `NULL`=확정(영구) / 미래=활성 홀드 / 과거=만료. 결제 시작 시 슬롯을 **3분 점유**(HOLD_MINUTES=3), 결제 성공 시 `expires_at=null` 로 확정. 동시 선택은 유니크 인덱스가 한 명만 통과시킴.
  - **pay-verify(엣지, dev 배포됨)**: paymentKey 있어도 **항상 orderId lookup 우선** → 이미 DONE이면 confirm 없이 확정. `NOT_FOUND_PAYMENT_SESSION`·`IDEMPOTENT_REQUEST_PROCESSING`는 재시도(pending, 삭제 안 함). 확정 시 예약 upsert(경합으로 지워져도 복구), 슬롯 충돌 시 **자동 환불**(refundToss). 진단필드 `resv/lookStatus/at` 응답 포함.
  - **toss-webhook(엣지, dev 배포됨)**: 결제완료 시 `expires_at=null` 확정 추가. 취소/만료 삭제는 **미완료 홀드만**(확정 예약 보호).
  - **webview.tsx 대재작성**: `react-native-send-intent` 도입 → `intent://` 는 `openAppWithData(package, scheme://data)` 로 **앱 직접 실행**(로그 `[pay] openApp com.kakao.talk true` 로 app2app 실행 성공 확인). `successUrl/failUrl` 가로채 pay-verify 재시도, **appScheme=`pickleball://`(콜론 필수 — 없으면 토스 retAppScheme 에러)**, WebView props 추가(`javaScriptCanOpenWindowsAutomatically`·`sharedCookiesEnabled`·`thirdPartyCookiesEnabled`·`mixedContentMode=always`). 3분 카운트다운 UI.
  - **court/[id]**: 우리 결제수단 화면 스킵하고 **토스 기본 결제창 직행**(method=CARD, easyPay=''). 홀드모델 반영. **내예약/홈**은 `expires_at IS NULL`(확정)만 표시.
- **Why**: 기존 결제가 실기기에서 안 됨 — 파고드니 (1)appScheme 콜론 누락으로 토스 retAppScheme 거부, (2)동시 승인 IDEMPOTENT를 실패로 오판해 예약 삭제, (3)intent를 단순 스킴 치환으로 열어 app2app 복귀가 홈으로 튐 — 이 세 개가 실제 원인이었음. 홀드모델은 "결제 안 하면 예약 안 됨 + 먼저 결제한 사람이 예약" 요구를 안전하게 구현.
- **⚠️ dev-client 재빌드 함**(send-intent 네이티브): **빌드 완료 → https://expo.dev/accounts/yoonsik2/projects/pickleball/builds/3a68d428-6abd-47d4-ac10-b3ff60fd0c49** (이 빌드 설치해야 새 결제 동작).
- **Files touched (내 경계)**: `src/lib/payments.ts`, `src/lib/types.ts`(expires_at + reserve_court_hold/release_expired RPC 타입), `supabase/migrations/0062_court_hold_expiry.sql`(신규), `supabase/schema.sql`, `supabase/functions/pay-verify/index.ts`, `supabase/functions/toss-webhook/index.ts`, `src/app/payment/webview.tsx`(재작성), `src/app/payment/success.tsx`, `src/app/payment/fail.tsx`, `src/app/payment/method.tsx`(이제 미사용, 파일은 남김), `src/app/court/[id].tsx`, `src/app/court/reservations.tsx`, `src/app/(tabs)/index.tsx`, `package.json`(react-native-send-intent).
- **Validation**: tsc 0. pay-verify·toss-webhook dev 배포됨. 실기기: app2app 실행·appScheme·IDEMPOTENT 재시도·홀드·예약 로직 확인됨. **카드/토스페이는 테스트에서 승인**. 카카오페이는 계속 `READY`(승인 안 올라감) — 원인은 "테스트라 원래 안 됨"이 **아니라** 이 test_ck(`test_ck_[redacted]`) 상점에 **카카오페이가 활성화 안 돼 있을 가능성**(토스 FAQ: 카카오페이는 계약 후 발급 테스트키 필요). **토스 대시보드에서 카카오페이 활성화 확인 필요.**
- **⚠️ Follow-ups / 남은 것**:
  - (a) **카드로 결제 E2E 최종 확인**(복귀→confirm→예약 확정→내예약/홈 표시)까지 아직 사용자 최종검증 전.
  - (b) **카카오페이**: 토스 개발자센터에서 이 상점 카카오페이 결제수단 **활성화 여부 확인**(안 켜져 있으면 신청).
  - (c) **프로덕션 빌드 전 디버그 로그 정리**: `[pay]`(webview), `[watcher]`(payment-resume-watcher), `[pay-verify:deeplink]`(success.tsx), webview의 상세로그, checkout `console.error`(web-admin) 등.
  - (d) **마이그레이션 0062를 운영(prod) DB에도 적용** 필요(현재 dev만).
  - (e) `src/constants/features.ts`의 **`PAYMENTS_ENABLED=true`는 결제 테스트용 임시** — 프로덕션 빌드 전 원복 정책 확인. `.env`의 `EXPO_PUBLIC_PAYMENT_PROVIDER=toss`도 테스트용.
- **경계 주의**: 이번에 **코덱스 미커밋 파일 일부를 로직 목적으로 건드림**(`_layout.tsx`의 네비 테마 다크고정, `(tabs)/index.tsx` 홈 쿼리·로딩 Modal, `court/*`, `(tabs)/_layout.tsx` sceneStyle 등). **나는 커밋 안 했음** — 코덱스가 자기 파일 커밋할 때 이 변경들 확인 요망. 결제 관련 내 소유 파일은 위 목록.

### Claude -> Codex (2026-08-03, DUPR 인증 경기 — 번개 생성 토글 요청)

- **What / Why**: DUPR 인증 번개/대회 기능을 붙이는 중. 인증 번개는 연결(verified)자만 참가하고, 경기결과를 DUPR 에 등록(→레이팅 반영→그래프 자동갱신). DB·게이트·경기기록 화면·제출함수는 내가 다 했다.
- **요청(코덱스 담당)**: **번개 생성 화면 `src/app/meetup/create.tsx`(코덱스 소유·미커밋이라 내가 안 건드림)에 "DUPR 인증 경기" 토글 추가.** 스펙:
  - 스위치/토글 하나 (기본 OFF). 켜면 insert payload 에 `dupr_certified: true` 포함(현재는 컬럼만 있고 UI 없음 → 항상 false 로 생성됨).
  - 안내문 예: "연결된 회원만 참가 · 결과가 DUPR 공식 레이팅에 반영돼요."
  - 컬럼은 이미 있음(`meetups.dupr_certified`, 0059). 타입 `Meetup.dupr_certified: boolean` 도 반영됨.
- **내가 만든 것**: `meetup/[id]`(게이트+배지+호스트 진입), `meetup/record/[id]`(신규 점수기록), `dupr-match` 엣지함수, `dupr.ts.submitMatchToDupr`, 0059(컬럼+`meetup_matches`+뷰 재생성).
- **Validation**: tsc 0 · lint 0. 실제 DUPR 등록은 연결계정 2명 필요(테스트 계정 부족).
- **대회 토글**은 관리자웹(`web-admin/app/tournaments/new`)이라 내가 직접 붙일 예정(3단계).

### Claude -> Codex (2026-07-24, 인앱 알림 센터)

- **What changed**: 인앱 알림 센터 신설 (커밋 `c7b7b71`, 마이그레이션 `0053`). 지금까지 푸시가 "쏘고 끝"이라 안읽음 숫자를 못 셌음 → 중앙 `notifications` 테이블에 저장 + Expo 푸시 동시 발송.
- **Why**: 홈에서 종모양 + 안읽음 뱃지 요구. 기록이 남아야 종 숫자를 셀 수 있음.
- **Files touched (전부 내 경계 — UI 비주얼 코덱스 파일 안 건드림)**: `supabase/migrations/0053_notifications.sql`, `supabase/schema.sql`, `src/lib/types.ts`(AppNotification 타입+Database), `src/contexts/notifications.tsx`(신규 Provider/훅), `src/components/ui/notification-bell.tsx`(신규), `src/app/notifications.tsx`(신규 목록화면), `src/app/_layout.tsx`(Provider 주입+라우트).
- **Validation**: tsc 0 · lint 0 · ios 번들 export 성공.
- **✅ 위 요청 완료됨 (2026-07-24 추가, 커밋 `597deb4`)** — 사용자 요청으로 **내가 직접 홈 종을 연결**했다. 홈 우상단 종이 종 모양만 하고 누르면 `/(tabs)/profile` 로 가고 있었음(알림 미연결) → `<NotificationBell size={22}/>` 로 교체, 44x44 흰 원형(`styles.iconBtn`) 디자인은 유지. **코덱스는 이 부분 다시 건드리지 말 것**(중복 작업 방지). 디자인 조정은 자유.
  - ⚠️ 그 커밋에 **코덱스의 미커밋 작업도 함께 들어갔다**: 홈 초기 로딩 개선(`load()` try/catch/finally + `initialLoading` + `BootScreen`). 완성·동작 검증된 상태여서 같이 커밋함. `boot-screen.tsx`·`meetup/create.tsx`·`landing/page.tsx` 는 **손대지 않고 미커밋 그대로 뒀다**.
- **🙋 (완료된) 원래 요청 — 홈 헤더에 종 배치**:
  - 홈(`src/app/(tabs)/index.tsx`, **코덱스가 미커밋 편집 중이라 내가 안 건드림**) 우측 상단에 `<NotificationBell/>` 하나만 넣어줘.
  - `import { NotificationBell } from '@/components/ui/notification-bell';`
  - props: `color?`(헤더 배경에 맞춤, 기본 `#111827`) · `size?`(기본 24). **상태 전달 불필요** — 자체적으로 `useNotifications()` 로 안읽음 수 구독. 탭하면 `/notifications` 이동.
  - 종/목록 **디자인 다듬는 건 자유** (로직은 `useNotifications()` 훅에서 옴 — `items`·`unread`·`markAllRead`·`openTarget`). 뱃지 빨강은 `Brand.danger`.
- **⚠️ Follow-ups**:
  - `0053` 마이그레이션 **dev/prod 양쪽 실행 필요**(아직 미실행). prod 는 0043~0052 와 함께 `scratchpad/PROD_v2.0_migrations.sql` 뒤에 이어 실행하면 됨. `notifications` 는 realtime publication 에 등록됨.
  - 이 기능은 **순수 JS+DB → OTA 배포 가능**. 단 홈에 종 배치(코덱스)까지 돼야 사용자가 접근 가능.
  - 알림 발생 지점: 신청(기존 0035)·승인(pending→approved)·커뮤니티 댓글. 대회 차례(notify-turn)·타이(notify-tie)는 별도 Edge Function 이라 아직 이 테이블에 안 쌓임 — 원하면 후속으로 통합 가능.

### Claude -> Codex (2026-07-15, 클럽 가입 항상 승인제)

- **클럽 가입을 항상 운영자 승인제로 변경** (커밋 3f3c93a, 0042). 생성폼 '가입 승인제' 토글 제거→안내문구, 가입 로직 항상 `status:'pending'`(플래그 무관 하드코딩), 상세 버튼 '가입 신청하기' 고정. 0042: 기존 클럽 require_approval=true 전환 + 기본값 true.
- **DB 반영 검증**: 개발·운영 양쪽 0042 실행됨 — require_approval=false 클럽 0개(개발 2/운영 11 전부 true).
- ⚠️ 이 변경은 **다음 빌드**부터 반영(현재 배포된 1.1.0 build7/5엔 토글 남아있음).

### Claude -> Codex (2026-07-14, 1.1.0 빌드 + Edge Function 배포)

- **버전 1.1.0** (커밋+태그 v1.1.0). 프로덕션 빌드 큐: Android versionCode 7(56c7e1a9), iOS buildNumber 5(63294abc). 이번 빌드에 대회 진행방식(KDK·단체전·오더·코트배정)+클럽/번개 개선+부팅 크래시 수정 전부 포함.
- **Edge Function 배포 완료**: `notify-turn`(개인/KDK 차례알림), `notify-tie`(단체전 타이 알림) → 운영·개발 DB 양쪽 배포됨(사용자가 `supabase functions deploy` 실행). 라이브 검증: notify-tie 호출 200 `{sent:0, no push tokens}`(테스트팀 토큰없음이라 정상). 실기기 push_token 등록 선수에게 실제 발송됨.
- **운영 DB 마이그레이션 0036~0041 실행 완료** (사용자, 검증됨 — 테이블/컬럼/뷰/RPC 전부 200). 개발·운영 모두 동기화.
- **빌드 상태**: iOS 1.1.0(build 5) FINISHED, Android 1.1.0(build 7) 진행중.
- **남은 출시 작업**: 빌드 완료 후 Play(AAB)·App Store Connect(`eas submit -p ios`) 업로드 + 심사 제출.


### Claude -> Codex (2026-07-14, 대회 진행 방식 KDK/단체전/지금)

What changed (전부 로직 파일, 디자인 파일 안 건드림):

- **진행 방식 토대 (0036, 커밋 09279ea)**: `tournaments.format` = group_knockout | kdk | team + check. web-admin 생성폼에 '진행 방식' 선택, 모바일 상세·관리자 헤더에 방식 배지. `TOURNAMENT_FORMAT_LABELS/DESC` (모바일·web-admin 양쪽 types).
- **KDK 엔진 (커밋 6cbfd12)**: 단식 개인 풀리그. 기존 `buildGroups`+`standings` 재사용(조별 라운드로빈+개인순위, 본선 없음). 관리자 탭 KDK=신청현황+순위전. prelim 페이지에 KDK 분기. 모바일은 '순위' 탭. 라이브 검증(KDK 대회 생성→순위전 렌더).
- **단체전 1단계 데이터모델 (0037, 커밋 f3b0a75)**: `tournament_teams`(팀명·주장·상태·시드), `tournament_team_members`. tournaments에 team_min_size/tie_singles/tie_doubles. RLS 포함. types 동기화.

단체전 확정 규칙: 팀명+가입유저 검색해 팀단위 신청 · 팀당 최소인원 · **오더 싸움**(타이 전 주장 라인업) · 타이 구성(단식/복식 수) 생성시 선택 · 예선리그→토너먼트.

- **단체전 2단계 모바일 팀신청 (커밋 d7c0ff4)**: `src/components/team-register.tsx`(팀명+유저검색→팀단위 신청, 내팀 상태/취소, 참가팀 목록). `tournament/[id]` team 방식이면 개인 UI 대신 렌더. **0038**: tournaments_with_counts 뷰 재생성(0037 컬럼이 뷰 t.* 에 안 잡히던 것 수정). 라이브 검증(팀+팀원 insert RLS 통과).

- **단체전 3단계 생성폼 설정 (커밋 288630d)**: web-admin 생성폼 team 선택 시 '단체전 설정'(팀최소인원·타이 단식/복식 수) 노출, 타이 구성 동적 안내. 검증 완료.

현재 사용 가능: 단체전 대회 생성 ✅ + 모바일 팀 신청 ✅(pending 팀 생성). **아직 없음**: 관리자 팀 승인 UI(신청현황 탭은 tournament_entries 기준이라 팀 안 보임), 팀 진행(타이 경기).

- **단체전 4a~4c 진행엔진 (커밋 ffd7da6·7bb3b83·75d3747)**:
  - 0039: tournament_ties + tie_matches (서브매치, 오더용 team1/2_players 컬럼 포함) + RLS(쓰기=주최자).
  - 4b 관리자 팀승인: `web-admin/components/team-roster.tsx`, 신청현황 탭 team이면 렌더. 승인→확정 검증.
  - 4c 예선: `web-admin/app/tournaments/[id]/team/page.tsx` + `lib/team-bracket.ts`(tieWinner 다승, teamStandings). buildGroups 재사용→tie+서브매치(단식 tie_singles+복식 tie_doubles) 생성→서브매치 승자 입력→tie 승자·팀순위. **라이브 검증 완료**(2팀 예선, tie 2:0 종료, 순위 반영). layout에 team '팀 대진' 탭.
  - **0039 개발DB 실행됨.**

- **4c 본선 (커밋 28d1a12)**: advanceTeamKnockout(knockout.ts) + 팀 페이지 본선 생성·라운드 표시. 라이브 검증(결승 tie 0:2 종료).
- **4d 모바일 표시 (커밋 42d1d33)**: `team-bracket-view.tsx` — 조 순위+타이·서브매치 결과+본선. 라이브 검증.
- **5 오더 (커밋 dcc2124)**: 0040 `set_tie_lineup` RPC(주장만 자기팀 라인업) + `team-lineup.tsx`(주장 서브매치별 선수 배정) + bracket-view 오더 표시. **라이브 검증 완료**(주장이 테스트1을 단식1에 배정→RPC 저장→대진에 '테스트1 vs 미정' 표시).

**단체전 1~5 전 기능 구현·검증 완료.**

- **오더 개선 (커밋 2cf7902, 0041)**: 동시제출·블라인드 공개 + 대진뷰 자동 새로고침.
  - `submit_tie_lineup` RPC(라인업 완성 시 제출·잠금), `set_tie_lineup`에 제출후 수정불가 가드.
  - team-lineup: 경기별 배정→'오더 제출(잠금)', 제출 후 읽기전용, 상대 대기중/공개됨 뱃지.
  - team-bracket-view: 양 팀 제출 전 '오더 미공개'(블라인드), refreshKey 로 자동 갱신.
  - 라이브 검증: 배정→제출(team1_ready)→수정잠금('already submitted')→블라인드('미공개')→양팀 제출 시 공개(테스트1/관리자/관리자·테스트1). *웹 한계: RN Alert 확인창 onPress 웹 미발동 → 실기기 정상, RPC로 검증.*

- **단체전 코트배정 + 타이 알림 (커밋 29fda6c)**: 팀 대진 탭에서 타이별 코트 배정(tournament_ties.court_id) + '차례 알림' 버튼(notify-tie). 모바일 대진뷰에 배정 코트(🏟) 표시. 개인전용 코트배정 탭은 단체전에서 숨김. **KDK는 tournament_matches 재사용으로 코트배정 이미 동작**(대회에 코트 있으면 코트배정 탭). 검증 완료(코트1 배정→DB저장→알림버튼→모바일 🏟1). ⚠️ **Edge Function `notify-turn`·`notify-tie` 배포 필요**(task #31) — 배포 전엔 차례알림 버튼이 function-not-found.
- **단체전 상세 탭 분리 (커밋 3b24330)**: 모바일 대회상세(team)를 정보/참가/대진 탭으로 분리(기존엔 한 화면에 다 쌓임). tab 상태에 'register'|'bracket' 추가, isTeam 이면 tab바 노출. TeamBracketView는 탭 전용이라 빈 대진에 placeholder. 검증: 탭 전환 정상(정보=정보카드/참가=팀신청·오더/대진=순위·대진).
- **서브매치 스코어·득실 (커밋 f8bc8ad)**: 팀 서브매치를 승자버튼 대신 **점수 입력**(score1:score2)으로 기록, 승자 자동 도출. `teamStandings`가 득실(pf/pa/diff) 합산 → 정렬 승→득실→득점 (3팀 1승1패 등 동률 시 득실 판정). 관리자 순위표·모바일 대진뷰에 득실·점수 표시. 라이브 검증(6:3 저장→tie 3:0·순위 +3/-3). *마이그레이션 불필요(score 컬럼 기존).*

Follow-ups (마이그레이션):
- 개발 DB: 0036~0041 전부 실행됨.
- 운영 DB: **0036~0041 전부 아직** — 출시 전 일괄 실행 필요.

Follow-ups:

- **마이그레이션 0036, 0037, 0038 을 개발·운영 DB 양쪽에 실행 필요**. (개발엔 0036·0037 실행됨, **0038 아직** — 안 하면 team_min_size 등이 뷰에 안 잡혀 기본값으로 동작. 운영엔 0036~0038 모두 아직.)
- group_knockout(지금방식)·KDK는 완성. 단체전은 데이터모델만 됨 — 아직 신청/진행 불가(생성 시 team 고르면 진행 탭 '준비 중').

### Claude -> Codex (2026-07-14, 부팅 무한로딩 수정 + DB 점검)

What changed:

- **부팅 무한로딩(스플래시 멈춤) 수정** (커밋 a219d10, `src/contexts/auth.tsx`):
  - 원인: `onAuthStateChange` 콜백이 async 로 supabase 쿼리(loadProfile)를 await → supabase-js auth 락 + 토큰갱신 타이밍과 겹치면 교착. `getSession().then` 이 안 끝나 `setInitializing(false)` 미호출 → 무한 스플래시. getSession `.catch` 부재도 원인.
  - 수정: initializing 을 프로필 로드와 분리(세션 확인 즉시 해제) · onAuthStateChange 콜백에서 supabase await 제거(세션만 동기) · 프로필은 별도 effect 백그라운드 로드 · getSession `.catch/.finally` + 8초 안전 타임아웃.
  - 검증: 웹 프리뷰 세션복원 리로드 4회 연속 홈 정상.
- **DB 점검**: 사용자가 0031~0035 를 개발·운영 DB 양쪽에 실행 완료 확인(anon PostgREST 프로브). 테이블/뷰 19/19, 최근 컬럼·버킷 모두 반영됨.

Files touched: `src/contexts/auth.tsx`.

Validation: `npx tsc --noEmit` 통과, `npx expo lint` 통과, 웹 프리뷰 부팅 4회 확인.

Follow-ups:

- 이 수정은 native 토큰갱신 타이밍 버그라 웹 100% 재현은 어렵지만 구조적으로 3개 실패경로 다 차단 → 다음 프로덕션 빌드에 포함 필요.
- 다음 단계: 프로덕션 재빌드(Android versionCode↑ / iOS buildNumber↑) — 그동안의 클럽/번개/파트너/부팅 수정 전부 포함.

### Claude -> Codex (2026-07-11, tester feedback fixes + club photo/approval)

What changed:

- 클럽 사진·가입승인 기능 추가 (커밋 925baf9):
  - `clubs.image_url`(대표 사진), `clubs.require_approval`, `club_members.status`('pending'|'approved') 컬럼 추가.
  - `src/app/club/[id].tsx`: 사진 표시/운영자 업로드, 가입 신청→승인 대기, 운영자 승인/거절 UI. **파일 전체를 재작성**했으니 여기 디자인 손볼 때 참고.
  - `src/app/club/create.tsx`: '가입 승인제' 토글 추가.
  - `src/components/club-card.tsx`: image_url 있으면 썸네일 표시(디자인 파일 — 최소 변경만).
- 앞선 테스터 피드백 수정들도 **디자인 파일을 건드렸음** (충돌 주의):
  - `src/components/meetup-card.tsx`: 시간 텍스트 폰트 20→14, 색 #16C784.
  - `src/app/(auth)/sign-up.tsx`: 비밀번호 확인 입력 추가.
  - `src/app/(tabs)/_layout.tsx`: 탭바 `useSafeAreaInsets()` 로 안드로이드 3버튼 내비 가림 해결.
  - `src/app/(tabs)/clubs.tsx`: 검색창 추가.
  - `src/app/(tabs)/index.tsx`: 10명 클럽 필터 제거(최근 3개).

Files touched: 위 목록 참고.

Validation: `npx tsc --noEmit` 통과, `npx expo lint` 통과. 라이브 동작 확인은 미실시(빌드 필요 기능 — expo-image-picker).

추가 작업 (같은 날, 커밋 9b48dfd · c70c7d9):

- **번개모임 게스트비 + 참가 승인제 (0033)**: meetups.fee / meetups.require_approval / meetup_participants.status 추가.
  - `src/app/meetup/create.tsx`: 게스트비 입력 + 승인제 토글.
  - `src/app/meetup/[id].tsx`: 게스트비·승인제 표시, 신청→대기, 호스트 승인/거절.
  - `src/components/meetup-card.tsx`(디자인 파일): 게스트비 pill 추가, **기존 실력 pill을 게스트비 pill로 교체**(카드 공간상). 실력 범위는 상세화면에 있음 — 디자인상 다시 넣고 싶으면 조정 가능.
- **대회 복식 파트너 발견성**: `src/app/tournament/[id].tsx` 파트너 검색을 정보 카드 바로 아래로 이동 + 강조 카드.
- **번개 코트/장소 사진 (0034)**: meetups.image_url + meetup-images 버킷. `meetup/create.tsx`(첨부), `meetup/[id].tsx`(표시·호스트 업로드), `meetup-card.tsx`(상단 배너 — 디자인 파일).
- **신청 알림 (0035)**: 클럽 가입·번개 참가 pending 시 주최자에게 Expo 푸시. **DB 트리거(pg_net)** 로 자동 발송 — 앱 코드 아님, `supabase/migrations/0035`. push_token 있는 실기기 빌드에서만 도달.

Follow-ups / requests:

- **운영 DB 마이그레이션 실행 필요**: 0031·0032 완료. **0033·0034·0035 아직**(개발 DB에도 미실행 → meetup status/image 쿼리 degrade). 0035는 `pg_net` 확장 필요(Supabase 기본 제공).
- 다음 프로덕션 빌드(Android versionCode↑ / iOS buildNumber↑)에 위 수정 전부 포함해야 함.
- 알림 도달 테스트는 실기기 2대(신청자/호스트) + push_token 등록 필요. notify-turn Edge Function은 여전히 미배포(task #31).
- club-card·club/[id] 사진, meetup-card pill/배너 디자인 다듬을 여지 있음 — Codex가 원하면 손봐도 됨(로직 건드리지 말 것).

### Codex -> Claude (2026-07-10, first court partner email)

Context:

- User visited a court to introduce P!NUT.
- The court contact asked for related materials and showed interest in a meeting.

Guidance given:

- Send a polite intro email with the landing URL and short app summary.
- Position P!NUT as preparing for opening, then collecting early user/court feedback before scheduling a more concrete meeting.
- Avoid sounding like a hard sales pitch; frame it as an early partner / pilot discussion.
- Suggested including `https://pinut.org` and offering to send additional materials after the initial open/feedback round.

### Codex -> Claude (2026-07-10, iPhone test build readiness)

What changed:

- No source code changes.
- Checked whether the Expo app can be built for iPhone testing.

Findings:

- Project is Expo / React Native, not Flutter.
- `expo-dev-client` is installed.
- `eas.json` has `development`, `preview`, and `production` build profiles.
- EAS login is active as `yoonsik2` / `troy.yoonsik.shin@gmail.com`.
- Recent iOS build list is empty, so a new iOS build is needed for device testing.

Recommended paths:

- Quick device testing during development: `npx.cmd eas-cli@latest build -p ios --profile development`.
- App-like install without dev client: `npx.cmd eas-cli@latest build -p ios --profile preview`.
- TestFlight/internal beta: `npx.cmd eas-cli@latest build -p ios --profile production --submit`.

Notes:

- iOS internal/ad hoc builds may require registering the iPhone device in Apple Developer.
- TestFlight is usually easiest for non-technical testers once App Store Connect setup is ready.

Validation:

- `npx.cmd eas-cli@latest whoami`: logged in, Owner role.
- `npx.cmd eas-cli@latest build:list --platform ios --limit 3`: no existing iOS builds listed.

### Codex -> Claude (2026-07-10, Kakao Login verification note)

Decision / guidance:

- Basic Kakao Login setup does not appear to require business verification by itself.
- Kakao Login must be enabled in Kakao Developers and redirect URIs must be configured.
- If P!NUT needs Kakao-provided personal information such as email, phone number, name, birth year, or similar consent items, Kakao may require Biz App conversion, eligibility checks, and business information review.
- For the current MVP, defer Kakao Login until business registration / verification and Apple Sign in parity are ready, or implement it with only minimal profile data.

References checked:

- Kakao Developers Kakao Login overview and setup docs.

### Codex -> Claude (2026-07-10, store review readiness checklist)

What changed:

- No source code changes.
- Reviewed current readiness for Android + iOS store review submission.

Confirmed:

- App is Expo / React Native, not Flutter.
- `app.json` parses correctly as UTF-8 via Node.
- App display name: `피넛`.
- iOS bundle ID: `com.pinut.app`.
- Android package: `com.pinut.app`.
- Version: `1.0.0`.
- Production EAS env points to Supabase production project `jbvtdthtmrlndduqiikj`.
- `pinut.org`: HTTP 200.
- `admin.pinut.org`: HTTP 307 to `/login`.
- `npx.cmd tsc --noEmit`: passed.
- `npx.cmd expo lint`: passed.
- Latest Android production EAS build exists:
  - Build ID `40503615-014a-44e5-ad38-c98bd55efe05`
  - AAB URL available from EAS.
  - Version code `2`.
- No iOS EAS builds exist yet.
- iPhone 6.5 screenshot set exists in `docs/appstore-screenshots/iphone-6-5/`.
- Additional screenshot set exists in `iphone-screenshots/`.

Important blockers / tomorrow work:

- Create iOS production build.
- Submit iOS build to TestFlight/App Store Connect.
- Confirm App Store Connect app record for `com.pinut.app`.
- Prepare privacy policy URL before Apple/Google review.
- Prepare support URL, likely `https://pinut.org`.
- Prepare reviewer demo account and verify it works on production DB.
- Complete Google Play developer identity verification if still pending.
- Upload Android production AAB to Google Play Console if not already done.
- Complete Google Play app content forms: data safety, privacy policy, target audience, ads/no ads, app access.
- Confirm UGC moderation stance: app has user-created meetups/clubs/profile data, so review notes should mention reporting/blocking/operations if implemented, or keep launch scope conservative.

### Codex -> Claude (2026-07-10, Google Play release errors)

Context:

- User showed Google Play Console release page with 3 errors and 1 warning.

Guidance given:

- The errors mean the internal test release currently has no APK/AAB attached.
- Use the existing Android production AAB from EAS Build ID `40503615-014a-44e5-ad38-c98bd55efe05`, versionCode `2`.
- Upload/attach the AAB to the current internal testing release; do not create an empty release.
- If Play Console says an old version cannot be released, discard the empty/old draft release and create a fresh internal testing release with the latest AAB.
- The Android 13 advertising ID warning is handled in Play Console App content / Advertising ID declaration. If P!NUT does not use ads or advertising ID, declare that it does not use advertising ID.

### Codex -> Claude (2026-07-10, account deletion URL for Google Play)

What changed:

- Added a public account/data deletion instruction page for Google Play app content requirements.
- Hid the admin header on `/account-delete`.
- Deployed the page to Vercel production.

URL to use in Google Play Console:

- `https://pinut.org/account-delete`

Files touched:

- `web-admin/app/account-delete/page.tsx`
- `web-admin/components/app-header.tsx`
- `docs/HANDOFF.md`

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- Vercel production build passed.
- `https://pinut.org/account-delete`: HTTP 200.
- Production HTML contains `계정 및 데이터 삭제 요청` and `troy.yoonsik.shin@gmail.com`.

### Codex -> Claude (2026-07-10, Play Store icon)

What changed:

- Created a Google Play store listing icon from the existing app icon.

File:

- `assets/images/play-store-icon.png`

Details:

- Size: 512x512 PNG.
- File size: about 333 KB, below the 1 MB Play Console limit.
- Source: `assets/images/icon.png` (1024x1024 app icon).

Use:

- Upload `assets/images/play-store-icon.png` to the Google Play Console app icon field.

### Codex -> Claude (2026-07-10, pinut.org production routing fix)

What changed:

- Redeployed `web-admin` to Vercel production with `web-admin/proxy.ts` included.
- Fixed production routing so `pinut.org/` renders the landing page.
- Kept `admin.pinut.org/` redirecting to `/login`.

Root cause:

- Previous production deployment for the account deletion page did not include the host-aware proxy routing, so both `pinut.org` and `admin.pinut.org` showed the same admin/root behavior.

Deployment:

- Production deployment URL: `https://web-admin-kpwvew2z7-troyyoonsikshin-2301s-projects.vercel.app`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/Ejkk2APPFKmNaxprKPspfZEprF4u`

Validation:

- Vercel remote production build passed and output includes `Proxy (Middleware)`.
- `https://pinut.org/`: landing HTML confirmed via `PLAY INSTANT`.
- `https://admin.pinut.org/`: HTTP 307 with `Location: /login`.
- `https://pinut.org/account-delete`: HTTP 200.
- `npx.cmd vercel alias ls`: `pinut.org` and `admin.pinut.org` both point to the fixed deployment.

### Codex -> Claude (2026-07-09, web landing route)

What changed:

- Added a separate Next.js landing page at `/landing`.
- Added `web-admin/app/landing/page.tsx` with a full-bleed P!NUT marketing page.
- Updated `web-admin/components/app-header.tsx` so the admin header is hidden only on `/landing`.

Why:

- User asked for a separate web route landing page.
- Kept existing admin routes and root redirect behavior intact.

Files touched:

- `web-admin/app/landing/page.tsx`
- `web-admin/components/app-header.tsx`
- `docs/HANDOFF.md`

Validation:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `npm.cmd run build` from `web-admin/`: first failed because Google Fonts fetch was blocked by sandbox network restrictions; rerun with approved escalation and passed.
- `http://localhost:3000/landing`: returned HTTP 200.

Notes / follow-ups:

- Browser screenshot automation failed because the node REPL kernel hit an `EPERM` while trying to access `C:\Users\SEPC\AppData`; no page code issue was observed.
- Dev server was started with `npm.cmd run dev`; URL is `http://localhost:3000/landing`.

### Codex -> Claude (2026-07-09, dev server restart)

What changed:

- No source code changes beyond this handoff entry.
- Restarted the `web-admin` Next dev server because the user reported `http://localhost:3000/landing` was not running.

Why:

- Previous background server command did not persist reliably.
- `Start-Process` failed in this environment with duplicate `Path/PATH` environment key errors.

Validation:

- Started Next via `Invoke-CimMethod Win32_Process.Create` after approval.
- Server log: `web-admin/.next-dev.cim.log`.
- `http://127.0.0.1:3000/landing`: HTTP 200.
- `http://localhost:3000/landing`: HTTP 200.

Follow-up:

- If 3000 stops again, use the same direct Next command from `web-admin`:
  `node .\node_modules\next\dist\bin\next dev --hostname 127.0.0.1 --port 3000`

### Codex -> Claude (2026-07-09, landing brand expression)

What changed:

- Updated `web-admin/app/landing/page.tsx` copy and structure to explicitly express `PLAY / INSTANT / NUT`.
- Hero now leads with `PLAY INSTANT. GO NUTS.` and `Play now, instantly.`
- Added repeated brand pillars for PLAY, INSTANT, and NUT across hero, feature cards, and final community section.

Why:

- User asked to express "play / instant / nut" on the landing page.

Files touched:

- `web-admin/app/landing/page.tsx`
- `docs/HANDOFF.md`

Validation:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `http://localhost:3000/landing`: HTTP 200.

### Codex -> Claude (2026-07-09, landing download CTA)

What changed:

- Changed the landing hero primary CTA from `/login` to `#download`.
- Added a `DOWNLOAD` nav link.
- Added a download section with App Store and Google Play button placeholders.
- Added `downloadLinks` constants in `web-admin/app/landing/page.tsx`; replace these with real store URLs when available.

Why:

- User said the "시작하기" button should go to a download link, not admin login.

Files touched:

- `web-admin/app/landing/page.tsx`
- `docs/HANDOFF.md`

Validation:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `http://localhost:3000/landing`: HTTP 200.

### Codex -> Claude (2026-07-09, landing work complete)

Status:

- Landing v1 is complete at `/landing`.
- Keep this as the current approved landing direction unless the user asks for another visual pass.

Final scope:

- Separate web landing route: `web-admin/app/landing/page.tsx`.
- Admin header is hidden on `/landing` via `web-admin/components/app-header.tsx`.
- Brand message expresses `PLAY INSTANT. GO NUTS.`, with supporting `PLAY`, `INSTANT`, and `NUT` sections.
- Primary hero CTA goes to `#download`.
- Download section has App Store / Google Play placeholder buttons through the `downloadLinks` constants.

Validation already run during landing work:

- `npx.cmd tsc --noEmit` from `web-admin/`: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- `npm.cmd run build` from `web-admin/`: passed after approved network access for Google Fonts.
- `http://localhost:3000/landing`: returned HTTP 200.

Follow-ups:

- Replace the placeholder download URLs with real App Store / Google Play links when available.
- Add privacy/support/legal pages before store submission if App Store metadata needs public URLs.
- Do not rework landing visuals unless the user explicitly requests it.

### Codex -> Claude (2026-07-09, landing deployment readiness)

What changed:

- No source code changes.
- Checked deployment readiness for the Next.js landing page in `web-admin`.

Findings:

- The landing page is part of the `web-admin` Next.js app, not the Expo mobile app.
- EAS Hosting is better suited for Expo web exports; Vercel is the recommended deployment target for this Next.js landing/admin app.
- `web-admin/.vercel` does not exist yet, so the Vercel project has not been linked from this machine.

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in the sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- Build output includes `/landing` as a static route.

Blocked:

- Vercel deploy was not executed because it would upload local project code to an external service and requires explicit user approval/account connection.

Recommended next step:

- If the user approves external deployment, run Vercel preview deploy from `web-admin`, then promote to production after checking the preview URL.

### Codex -> Claude (2026-07-09, landing Vercel preview deploy)

What changed:

- No source code changes.
- Linked `web-admin` to Vercel project `web-admin`.
- Deployed the Next.js landing/admin app to Vercel.

Deployment:

- Preview URL: `https://web-admin-1mxfeyj43-troyyoonsikshin-2301s-projects.vercel.app`
- Landing URL: `https://web-admin-1mxfeyj43-troyyoonsikshin-2301s-projects.vercel.app/landing`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/GxPsb3RnS5o1yAum3GhHBieQYGeS`
- Project: `troyyoonsikshin-2301s-projects/web-admin`

Validation:

- Vercel remote build passed.
- Remote build output includes `/landing` as a static route.
- `https://web-admin-1mxfeyj43-troyyoonsikshin-2301s-projects.vercel.app/landing`: HTTP 200.

Notes:

- The first Vercel deploy created a production alias as part of initial project setup:
  `https://web-admin-gamma-seven.vercel.app`
- The explicit preview deployment above is the URL to share for review.
- `web-admin/.vercel/project.json` exists locally for future deploys, but it is not shown in Git status.

Follow-ups:

- If the preview is approved, run `npx.cmd vercel deploy --prod` from `web-admin`.
- Add a custom domain later if needed.
- Replace landing download placeholder URLs with real App Store / Google Play URLs when available.

### Codex -> Claude (2026-07-09, root renders landing)

What changed:

- Changed `web-admin/app/page.tsx` so `/` renders the same landing page as `/landing`.
- Kept `/landing` available.
- Updated the landing logo link from `/landing` to `/`.
- Updated `AppHeader` so the admin header is hidden on both `/` and `/landing`.

Why:

- User asked for the root route to be the landing page.

Files touched:

- `web-admin/app/page.tsx`
- `web-admin/app/landing/page.tsx`
- `web-admin/components/app-header.tsx`
- `docs/HANDOFF.md`

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- Build output includes both `/` and `/landing` as static routes.
- `http://localhost:3000/`: HTTP 200.

Follow-ups:

- Redeploy Vercel if the deployed preview/production URL should also show the landing page at `/`.

### Codex -> Claude (2026-07-09, root landing Vercel redeploy)

What changed:

- No source code changes in this step.
- Redeployed `web-admin` to Vercel preview after changing `/` to render the landing page.

Deployment:

- Preview URL: `https://web-admin-e5zh7mp9w-troyyoonsikshin-2301s-projects.vercel.app`
- Root landing URL: `https://web-admin-e5zh7mp9w-troyyoonsikshin-2301s-projects.vercel.app/`
- Legacy landing URL: `https://web-admin-e5zh7mp9w-troyyoonsikshin-2301s-projects.vercel.app/landing`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/DYoNb4vPbRcAVCAxuua8po5SxKqD`

Validation:

- Vercel remote build passed.
- Remote build output includes both `/` and `/landing` as static routes.
- Preview root `/`: HTTP 200.
- Preview `/landing`: HTTP 200.

Follow-ups:

- If this preview is approved, promote/redeploy to production with `npx.cmd vercel deploy --prod` from `web-admin`.

### Codex -> Claude (2026-07-09, branch policy)

Decision:

- `pinut-v2.0` is the deployment branch.
- `pinut-v2.0-dev` is the active development branch.

Current state:

- Current branch is already `pinut-v2.0-dev`.
- `pinut-v2.0` also exists locally.
- Do not switch to or edit directly on `pinut-v2.0` unless the user explicitly asks for deployment/release work.

Validation:

- `git branch --show-current`: `pinut-v2.0-dev`.
- `git branch --list pinut-v2.0 pinut-v2.0-dev`: both branches exist.

### Codex -> Claude (2026-07-09, root landing production deploy)

What changed:

- No source code changes in this step.
- Temporarily switched from `pinut-v2.0-dev` to deployment branch `pinut-v2.0`.
- Deployed `web-admin` to Vercel production.
- Switched back to `pinut-v2.0-dev` after deployment.

Deployment:

- Production alias: `https://web-admin-gamma-seven.vercel.app`
- Production deployment URL: `https://web-admin-q0him3ci0-troyyoonsikshin-2301s-projects.vercel.app`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/DYZrvu5WRTDP9QbJ8eZJFYGsaaeq`

Validation:

- Vercel remote build passed.
- Remote build output includes both `/` and `/landing` as static routes.
- `https://web-admin-gamma-seven.vercel.app/`: HTTP 200.
- `https://web-admin-gamma-seven.vercel.app/landing`: HTTP 200.
- Root HTML contains landing copy (`PLAY INSTANT`), confirming it is no longer the login page.

Current branch after deployment:

- `pinut-v2.0-dev`.

### Codex -> Claude (2026-07-09, landing D-day stats and contact)

What changed:

- Added a landing D-day countdown for the 2026-07-17 launch goal.
- Added landing community metric cards for current member count and onboarded court count.
- Added a contact section with a mail link to `troy.yoonsik.shin@gmail.com`.
- Added `CONTACT` to the landing navigation.

Implementation notes:

- New countdown component: `web-admin/components/landing-countdown.tsx`.
- Landing stats try to read public Supabase counts from `profiles` and `courts`.
- If Supabase environment values are missing or count queries fail, the landing shows safe fallback text instead of breaking.
- `web-admin/app/landing/page.tsx` now uses `revalidate = 300` for periodic stat refresh.

Files touched:

- `web-admin/app/landing/page.tsx`
- `web-admin/components/landing-countdown.tsx`
- `docs/HANDOFF.md`

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- Local `http://localhost:3000/` HTML contains `D-DAY`, `현재 회원수`, `입점 코트수`, and `troy.yoonsik.shin@gmail.com`.

Follow-ups:

- Redeploy Vercel preview/production if these landing updates should go live.
- Confirm whether the D-day target should remain `2026-07-17T00:00:00+09:00`.

### Codex -> Claude (2026-07-09, landing D-day emphasis)

What changed:

- Moved the D-day countdown from the small hero metric grid to a large top hero banner directly under the landing nav.
- Increased countdown typography and card size so visitors can see the launch goal immediately.
- Kept current member count and onboarded court count as separate hero metric cards below the main CTA.

Files touched:

- `web-admin/app/landing/page.tsx`
- `web-admin/components/landing-countdown.tsx`
- `docs/HANDOFF.md`

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- Local `http://localhost:3000/` HTML contains `Launch D-day`, `2026.07.17`, `현재 회원수`, and `입점 코트수`.

Follow-ups:

- Redeploy Vercel preview/production if this D-day emphasis should go live.

### Codex -> Claude (2026-07-09, landing countdown clock and stats placement)

What changed:

- Updated the landing countdown target to `2026-07-17T12:00:00+09:00`.
- Countdown now displays days, hours, minutes, and seconds.
- Countdown updates every second on the client.
- Moved member/court metrics out of the hero card cluster and into a separate `COMMUNITY SIGNAL` band between download and play sections.

Files touched:

- `web-admin/app/landing/page.tsx`
- `web-admin/components/landing-countdown.tsx`
- `docs/HANDOFF.md`

Validation:

- `npm.cmd run build` from `web-admin/`: first failed in sandbox because Google Fonts could not be fetched.
- `npm.cmd run build` from `web-admin/` with approved network access: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- Local `http://localhost:3000/` HTML contains `2026.07.17 12:00`, `DAYS`, `HOURS`, `MIN`, `SEC`, and `COMMUNITY SIGNAL`.

Follow-ups:

- Redeploy Vercel preview/production if this updated countdown should go live.

### Codex -> Claude (2026-07-09, landing Supabase target check)

What changed:

- No source code changes.
- Checked whether the landing stats are looking at the production Supabase project.

Findings:

- Local `web-admin/.env.local` and root `.env` both point to the same Supabase project ref: `pjfhxkvdjipvdmfsacie`.
- `web-admin/lib/supabase.ts` reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Landing stats currently read public counts from `profiles` and `courts` using the anon key.
- The landing stats do not write to the database.

Risk / follow-up:

- If `pjfhxkvdjipvdmfsacie` is production, local landing stats are reading production data.
- If the landing should not read production data, replace live counts with static marketing numbers or create separate staging Supabase env values for `web-admin`.

### Codex -> Claude (2026-07-09, Vercel production Supabase env)

What changed:

- Added Vercel Production environment variables for `web-admin`.
- Redeployed Vercel production so production builds read the configured Supabase production env.
- Temporarily switched to `pinut-v2.0` for production deploy, then switched back to `pinut-v2.0-dev`.

Vercel env:

- `NEXT_PUBLIC_SUPABASE_URL`: set for Production.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: set for Production.
- Vercel stores both as encrypted/sensitive values.

Deployment:

- Production alias: `https://web-admin-gamma-seven.vercel.app`
- Production deployment URL: `https://web-admin-hd1u3oazm-troyyoonsikshin-2301s-projects.vercel.app`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/9MNJwhFNXQpzxJXdJFVdMzUhzdoQ`

Validation:

- `npx.cmd vercel env ls`: shows both Supabase env vars in Production.
- Vercel remote production build passed.
- Production root HTML contains `2026.07.17 12:00`, `DAYS`, `COMMUNITY SIGNAL`, and `troy.yoonsik.shin@gmail.com`.
- Production `/landing`: HTTP 200.

Current branch after deployment:

- `pinut-v2.0-dev`.

Note:

- `git switch` output showed `.claude/settings.json` as modified, but Codex did not edit it in this step.

### Codex -> Claude (2026-07-09, corrected production Supabase env)

What changed:

- Corrected Vercel Production Supabase env for `web-admin`.
- User clarified the real production Supabase project ref is `jbvtdthtmrlndduqiikj`.
- Removed the previously configured `pjfhxkvdjipvdmfsacie` values from Vercel Production env.
- Added the production values from `eas.json` production profile to Vercel Production env.
- Redeployed Vercel production from `pinut-v2.0`, then switched back to `pinut-v2.0-dev`.

Production DB:

- Project ref: `jbvtdthtmrlndduqiikj`.
- Direct count check before redeploy: `profiles=1`, `courts=0`.

Deployment:

- Production alias: `https://web-admin-gamma-seven.vercel.app`
- Production deployment URL: `https://web-admin-mh9t4ivsd-troyyoonsikshin-2301s-projects.vercel.app`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/6Lt8D166jc7HiEyKb46ziDpiBpfi`

Validation:

- Vercel remote production build passed.
- Production root HTML contains `1명`, `0곳`, `2026.07.17 12:00`, and `troy.yoonsik.shin@gmail.com`.
- Production `/landing`: HTTP 200.

Decision:

- Do not add the personal phone number to the public landing contact section.
- Keep email-only contact for now: `troy.yoonsik.shin@gmail.com`.

Current branch after deployment:

- `pinut-v2.0-dev`.

### Codex -> Claude (2026-07-09, admin.pinut.org setup)

What changed:

- Added `admin.pinut.org` to the Vercel `web-admin` project.
- Added host-aware routing so `admin.pinut.org/` redirects to `/login`.
- Used `web-admin/proxy.ts` instead of deprecated Next `middleware.ts`.
- Deployed production from `pinut-v2.0`, then switched back to `pinut-v2.0-dev`.

Implementation:

- `web-admin/proxy.ts` checks `host === 'admin.pinut.org'` and `pathname === '/'`.
- Matching requests receive a `307` redirect to `/login`.
- `pinut.org` and normal project URLs keep the existing root landing behavior.

Domain status:

- `admin.pinut.org` is added to project `web-admin`.
- `npx.cmd vercel domains verify admin.pinut.org`: configured correctly / verified.
- Direct check: `https://admin.pinut.org/` returns `307 Location: /login`.
- `pinut.org` was still in nameserver propagation from this environment during verification.

Deployment:

- Production deployment URL: `https://web-admin-8e1gecj8e-troyyoonsikshin-2301s-projects.vercel.app`
- Vercel inspect URL: `https://vercel.com/troyyoonsikshin-2301s-projects/web-admin/HQKeiqvERe93rk2GpH7muLuxZrqC`
- Production alias shown by Vercel: `https://pinut.org`

Validation:

- `npm.cmd run build` from `web-admin/` with network access: passed.
- `npm.cmd run lint` from `web-admin/`: passed.
- Vercel remote production build passed.
- Build output includes `Proxy (Middleware)`.

Current branch after deployment:

- `pinut-v2.0-dev`.

### Codex -> Claude (2026-07-09, mobile i18n first pass)

What changed:

- Added a lightweight app i18n system with persisted language selection.
- Added `src/i18n/translations.ts` with `ko` and `en` dictionaries.
- Added `src/contexts/i18n.tsx` with `I18nProvider`, `useI18n`, interpolation, and AsyncStorage persistence.
- Wrapped the Expo app root with `I18nProvider`.
- Connected i18n to sign-in screen, profile screen, and bottom tab labels.
- Added a language selector card to the profile screen.

Why:

- User asked to start building multi-language support in the app.
- Chose a no-new-dependency approach because `@react-native-async-storage/async-storage` is already installed.

Files touched:

- `src/i18n/translations.ts`
- `src/contexts/i18n.tsx`
- `src/app/_layout.tsx`
- `src/app/(auth)/sign-in.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/profile.tsx`
- `docs/HANDOFF.md`

Validation:

- Read Expo SDK 56 docs before editing Expo code.
- `npx.cmd tsc --noEmit`: passed.
- `npx.cmd expo lint`: passed.

Follow-up:

- Expand `useI18n()` to the remaining app screens gradually.
- Keep user-generated content untranslated; translate only fixed UI labels/messages.
- Some older files still contain mojibake-looking Korean in terminal output; prefer replacing UI strings via the i18n dictionary when touching those screens.

### Codex -> Claude (2026-07-09, Apple review setup guidance)

What changed:

- No code changes.
- User is on Apple Developer > Certificates, Identifiers & Profiles > Register an App ID.

Guidance given:

- Description: use `PEANUT Pickleball` or `Peanut Pickleball App`.
- Bundle ID: use the existing app identifier `com.pickle.app`.
- Keep `Explicit` selected.
- Enable `Push Notifications` because the app registers Expo push tokens.
- Do not enable `Sign in with Apple` yet because `KAKAO_LOGIN_ENABLED = false`; if Kakao/social login is enabled later, add Apple login before review unless an App Store guideline exemption applies.
- Next flow: create App Store Connect app record, fill metadata/privacy/review info, build with EAS production, upload/submit.

Follow-up:

- A public privacy policy URL is still needed for App Store Connect.
- Demo review account in docs is `player@peanut.test` / `Pickle!2026`; confirm it works on production Supabase before submission.

## Roles / Boundary (agreed 2026-07-09)

- **Codex = design**: `src/components/ui/*`, `src/theme/*`, screen JSX/StyleSheet/visuals, colors/spacing/typography.
- **Claude = logic**: `src/contexts/*`, `src/lib/*` (supabase, types, moderation, format, geo, payments), `supabase/` (schema, migrations, RLS), data fetching/state/handlers/routing, `web-admin` logic.
- Shared branch: **`pinut-v2.0`** (both push here). Always `git pull` before working; commit small and often.
- When both need the same screen file: Claude edits logic only, Codex edits visuals only.

## Claude → Codex (2026-07-09)

Reviewed your UI refactor. 👍 Clean work, boundary respected.

- **Verified**: `tsc --noEmit` 0 errors, `expo lint` 0 errors. Home + Profile render correctly in web preview.
- **Logic preserved** on the 3 logic-touched screens — confirmed intact, do not remove:
  - `matches.tsx`: `getBlockedIds` + block filter `!blockedSet.has(m.host_id)`.
  - `(tabs)/index.tsx`: region filter (`ilike('region', prefix%)`), upcoming carousel, recommended-meetup de-dup, club rule (≥3 clubs → members ≥10, `slice(0,3)`).
  - `profile.tsx`: `useAuth`, `meetup_participants` fetch, `signOut`, `deleteAccount`.
- **Do not edit (my domain)**: `src/lib/types.ts`, `src/lib/moderation.ts`, `src/lib/*` data code, `supabase/*`. If a new screen needs a field/query, note it here under "Codex → Claude" and I'll add the type + fetch.
- **`.codex/` and `.agents/`**: agreed — I'll add them to `.gitignore` and NOT stage them.
- **Demo data note**: I seeded demo meetups/clubs/reservations + set admin region to "서울 송파구" (for screenshots). It's in prod DB, cleanup IDs saved locally. Screens look populated because of this — don't rely on it being permanent.
- **Follow-up screens** you listed (meetup/court/tournament/club details, create forms) — go ahead, all UI-only. Reuse the shared components; I'll keep the queries/handlers stable.

### Codex → Claude (add requests here)

- _(none yet)_

### Claude → Codex (2026-07-09, prod DB split)

- **운영/개발 DB 분리 완료.** New prod Supabase project (Seoul). `eas.json` **production** now points to it; **development/preview + local `.env` + `web-admin/.env.local` still use the DEV DB** — so `npm start` / web preview / your work all keep hitting DEV (unchanged for you).
- Prod DB is **clean** (no demo/test data). The demo meetups/clubs I seeded live in DEV only — screenshots will use DEV.
- Prod super_admin bootstrapped + verified. Prod URL/key are in `eas.json` production (anon key is public, fine to commit).
- No action needed from you. Just know: production build = separate clean DB.

## Claude → Codex (2026-07-09, part 2)

**Decision: submit to App Store / Play only AFTER the full v2.0 redesign.** (User chose "v2.0 완성 후 제출".)

- I committed + pushed your UI refactor to `pinut-v2.0` (commit `78fb47a`). `.codex/` + `.agents/` are now gitignored. Pull before you continue.
- **Next up for you**: the 12 follow-up screens under "Known Follow-Ups" — that's the gate for release. Please redesign them with the shared components, preserve queries/handlers. Run `npx.cmd tsc --noEmit` + `npx.cmd expo lint` when done, and log it here.
- **Do NOT build/submit yet.** No `eas build -p ios/android` until all screens are consistently on v2.0. App config is ready (name 피넛, bundle `com.pickle.app`, version 1.0.0, icon set, eas `production` profile).
- Screenshots: the 12 PNGs I made earlier are the OLD design → will be re-shot after your v2.0 is complete. Don't rely on them.
- When you finish the follow-up screens, note it here and I'll: verify logic, re-capture screenshots (1290x2796), then we build.

## Current Task Context

The recent work is a UI/UX refactor for the Expo/React Native app. The user originally described the task as a Flutter refactor, but this repository is an Expo SDK 56 app, so the work was applied to React Native screens and shared components.

Primary goals:

- Apple HIG-inspired mobile UI.
- Strava / Nike Run Club / Linear-like premium sports feel.
- Remove generic Material/default-looking UI.
- Keep all existing routing, data models, Supabase logic, and feature behavior intact.
- Unify colors, spacing, typography, radius, cards, buttons, inputs, chips, badges, and FAB.

## Design Tokens

New token files were added under `src/theme/`:

- `src/theme/colors.ts`
- `src/theme/typography.ts`
- `src/theme/spacing.ts`
- `src/theme/radius.ts`
- `src/theme/shadows.ts`
- `src/theme/index.ts`

Existing `src/constants/theme.ts` was also updated to preserve the app's existing imports while mapping the app to the requested palette.

Important visual rules now in use:

- Screen background: `#F6F7F9`
- Card/input surface: `#FFFFFF`
- Primary green: `#16C784`
- Text primary: `#111827`
- Text secondary: `#6B7280`
- Border: `#E5E7EB`
- Card radius: `18`
- Button height: `56`
- Horizontal screen padding: `24`

## Shared Components Added Or Refactored

Added:

- `src/components/ui/app-scaffold.tsx`
- `src/components/ui/app-header.tsx`
- `src/components/ui/app-card.tsx`
- `src/components/ui/app-button.tsx`
- `src/components/ui/app-input.tsx`
- `src/components/ui/app-chip.tsx`
- `src/components/ui/app-badge.tsx`
- `src/components/ui/app-avatar.tsx`
- `src/components/ui/app-bottom-nav.tsx`
- `src/components/ui/app-fab.tsx`
- `src/components/match-card.tsx`
- `src/components/court-card.tsx`
- `src/components/profile-summary-card.tsx`

Refactored:

- `src/components/ui/button.tsx`
- `src/components/ui/text-field.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/avatar.tsx`
- `src/components/meetup-card.tsx`
- `src/components/club-card.tsx`
- `src/components/tournament-card.tsx`

Notes:

- `MatchCard` currently re-exports `MeetupCard`, because the domain still names these records `meetups`.
- `AppBottomNav` is a placeholder export. The actual bottom tab styling remains in `src/app/(tabs)/_layout.tsx`.
- Use existing `@/` imports and kebab-case file names.

## Screens Updated

Updated screens:

- `src/app/(auth)/sign-in.tsx`
- `src/app/(auth)/sign-up.tsx`
- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/matches.tsx`
- `src/app/(tabs)/profile.tsx`

Screen-level changes:

- Login: P!NUT logo treatment, wider spacing, card-style white inputs, full-width primary login button, social login area.
- Sign-up: same token system and cleaner form hierarchy.
- Home: converted into a dashboard with profile greeting, notification button, hero card, quick actions, upcoming schedule, recommended meetups, and recommended clubs.
- Matches: premium header, compact filter chips, rounded-square FAB, redesigned match cards.
- Profile: `ProfileSummaryCard`, stat cards for skill / meetups / DUPR, reused `MeetupCard`, logout as outline.
- Tabs: thinner white tab bar, outlined Ionicons, primary active tint.

## Validation

These commands passed after the refactor:

```bash
npx.cmd tsc --noEmit
npx.cmd expo lint
```

PowerShell blocked plain `npx` because of execution policy, so use `npx.cmd` on this Windows machine.

## Important Constraints

Do not change:

- Route structure unless the user explicitly requests it.
- Supabase schema, migrations, or `src/lib/types.ts` for UI-only work.
- Internal app slug/scheme/bundle ID.
- Existing feature logic while polishing UI.

Keep:

- User-facing text in Korean.
- `useTheme()` and existing theme imports working for legacy files.
- `SafeAreaView` / `ScrollView` layout patterns consistent with the project.
- `Ionicons` rounded/outlined icon style where possible.

## Known Follow-Ups

The first UI pass focused on shared tokens/components and the highest-impact screens. These screens still need deeper visual passes if the user wants the entire app fully polished:

- `src/app/meetup/[id].tsx`
- `src/app/meetup/create.tsx`
- `src/app/court/index.tsx`
- `src/app/court/[id].tsx`
- `src/app/court/reservations.tsx`
- `src/app/(tabs)/tournaments.tsx`
- `src/app/tournament/[id].tsx`
- `src/app/(tabs)/clubs.tsx`
- `src/app/club/[id].tsx`
- `src/app/club/create.tsx`
- `src/app/profile/edit.tsx`
- `src/app/config-missing.tsx`

Suggested next step:

1. Reuse `AppHeader`, `AppCard`, `AppChip`, `AppFAB`, `Button`, `TextField`, `MeetupCard`, `CourtCard`, `TournamentCard`, `ClubCard`.
2. Preserve existing Supabase queries and actions.
3. Run `npx.cmd tsc --noEmit` and `npx.cmd expo lint`.

## Git / Workspace Notes

At the time this handoff was created, `.agents/` and `.codex/` appeared as untracked directories. They were not part of the UI refactor and should not be staged unless the user specifically asks.

### Claude -> Codex (2026-07-09, v2.0 design finished for all remaining screens)

Per user request, I (Claude) completed the v2.0 redesign for ALL 12 follow-up screens using your design system (AppScaffold/AppHeader/AppCard/AppChip/AppFAB/AppButton + theme tokens + light palette #F6F7F9/#FFFFFF/#16C784/#111827/#6B7280/#E5E7EB). All logic/queries/handlers preserved.

Done (do NOT redo — they are on v2.0 now):
- clubs, tournaments, court/index, court/reservations (lists)
- config-missing, meetup/create, club/create, profile/edit (forms)
- meetup/[id], club/[id], court/[id], tournament/[id] (details)

Validation: `npx tsc --noEmit` 0 errors, `npx expo lint` 0 errors. Live-verified in web preview: clubs, court list, tournaments, court/[id] (calendar/slots), tournament/[id] (tabs/standings) all render in v2.0.
Commits: fd895bf, 2681f8d, c5ca140, ffb3ff5, 0fdffd6, 544012b (branch pinut-v2.0).

**The whole app is now visually consistent v2.0.** This unblocks screenshots + store submission. If you want to further polish any of these, pull first and coordinate here so we don't clobber each other. Kept Korean strings (matching your matches.tsx pattern); i18n (t()) can be layered later if desired.

### Codex -> Claude / Next Session (2026-07-10, Google Play store assets)

Prepared Google Play listing image assets for the upcoming Android review.

Files created:

- `assets/images/play-store-icon.png`
- `docs/playstore-screenshots/phone/01-home.png`
- `docs/playstore-screenshots/phone/02-matches.png`
- `docs/playstore-screenshots/phone/03-courts.png`
- `docs/playstore-screenshots/phone/04-tournaments.png`
- `docs/playstore-screenshots/tablet-7/01-home.png`
- `docs/playstore-screenshots/tablet-7/02-matches.png`
- `docs/playstore-screenshots/tablet-7/03-courts.png`
- `docs/playstore-screenshots/tablet-7/04-tournaments.png`
- `docs/playstore-screenshots/tablet-10/01-home.png`
- `docs/playstore-screenshots/tablet-10/02-matches.png`
- `docs/playstore-screenshots/tablet-10/03-courts.png`
- `docs/playstore-screenshots/tablet-10/04-tournaments.png`

Visual QA notes:

- Phone screenshots are 1080 x 1920.
- 7-inch tablet screenshots are 1920 x 1080.
- 10-inch tablet screenshots are 2560 x 1440.
- Korean text was visually checked after regenerating the tablet files with Unicode-safe text handling.
- The screenshots are mock-style store assets based on the v2.0 app design, not live device captures.

Google Play upload guidance:

- App icon: upload `assets/images/play-store-icon.png`.
- Phone screenshots: upload the four files in `docs/playstore-screenshots/phone/`.
- 7-inch tablet screenshots: upload the four files in `docs/playstore-screenshots/tablet-7/`.
- 10-inch tablet screenshots: upload the four files in `docs/playstore-screenshots/tablet-10/`.

Current caution:

- There are unstaged/untracked asset changes in the workspace. Review before committing.
- Do not rewrite Korean markdown files with PowerShell `Set-Content`; use `apply_patch` or another UTF-8-safe workflow.

Correction:

- The first tablet screenshot pass looked like marketing banners with a phone mockup.
- Per user feedback, tablet screenshots were regenerated to show the app UI as if opened directly on a tablet.
- `docs/playstore-screenshots/tablet-7/` and `docs/playstore-screenshots/tablet-10/` now contain full tablet app-screen layouts with side navigation and app content.
- Emoji/special glyphs that rendered inconsistently on Windows fonts were removed from the tablet assets.

Additional Google Play graphics:

- `assets/images/play-store-icon.png` is ready for the required app icon slot: 512 x 512, under 1MB.
- `assets/images/play-store-feature-graphic.png` is ready for the required feature graphic slot: 1024 x 500, under 15MB.
- The feature graphic was regenerated with Unicode-safe Korean text after a first attempt showed mojibake in the rendered image.
- Final user direction: use `assets/images/peanut-loading.png` for the feature graphic and add only the `P!NUT` brand text.
- `assets/images/play-store-feature-graphic.png` now uses that peanut illustration, cropped/resized to 1024 x 500 with `P!NUT` added in the top-left.

Google Play version naming preference:

- User wants future Android App Bundle / Play Console release naming to follow the app version style, e.g. `1.0.4`.
- Avoid naming releases like `4 (1.0.0)` in user-facing Play Console fields.
- Keep build number / versionCode internally increasing as required by Google Play, but release name and visible version references should be written as the semantic app version.

App Store screenshot assets:

- Created iPhone 6.5-inch App Store screenshots in `docs/appstore-screenshots/iphone-65/`.
- Files are `01-home.png`, `02-matches.png`, `03-courts.png`, `04-tournaments.png`.
- All are 1284 x 2778, matching App Store Connect's iPhone 6.5-inch accepted size.
- Initial pass accidentally preserved the store/mock `P!NUT` top banner. Per user feedback, screenshots were regenerated with that top banner removed so the image starts at the app screen.
- Final positioning pass: added top/side breathing room and removed the thin top crop line so the iPhone screenshots no longer look pushed upward.
- User then clarified the app screen was too small. Final App Store iPhone pass now fills the full 1284 x 2778 canvas with the app screen instead of presenting it as a small phone mockup. The artificial top banner remains removed.
- A later hand-drawn full-screen attempt looked unlike the real app UI and should not be used.
- Current final App Store iPhone screenshots are regenerated from the polished phone UI screenshots by cropping the actual app screen area and resizing to fill 1284 x 2778.
- Verified `01-home.png` and `02-matches.png` visually after the final regeneration.

Version / branch policy confirmed by user:

- Bug fix releases increment patch version, e.g. `1.0.4` -> `1.0.5`.
- Feature additions increment minor version, e.g. `1.0.x` -> `1.1.0`.
- Large breaking/product changes increment major version, e.g. `1.x.x` -> `2.0.0`.
- Do not manually edit EAS `buildNumber` / Android `versionCode`; EAS auto-increment owns those.
- Use git tags like `vX.Y.Z` to permanently record which commit shipped a version.

Current branch/tag check:

- Current local branch: `pinut-v2.0-dev`.
- Local branches seen: `main`, `pinut-v2.0-dev`.
- Remote branches seen: `origin/main`, `origin/pinut-v2.0-dev`.
- `v1.0.4` tag points at current commit `3300eea`.
- `app.json` and `package.json` both currently report version `1.0.4`.

Landing stats fix:

- User noticed `pinut.org` landing still showed `현재 회원수 1명` even after signups increased.
- Direct production Supabase check showed `profiles = 9`, `courts = 4`, so the DB was correct.
- Cause: root route `/` was still being built/static-cached while `/landing` was dynamic.
- Changed `web-admin/app/landing/page.tsx` to `dynamic = 'force-dynamic'`, `revalidate = 0`, `fetchCache = 'force-no-store'`.
- Changed `web-admin/app/page.tsx` to declare the same route config directly, because Next does not allow re-exporting route config.
- Verified `npm.cmd run build` shows both `/` and `/landing` as dynamic.
- Deployed to Vercel production: `https://web-admin-mn6ucrpo2-troyyoonsikshin-2301s-projects.vercel.app`, aliased to `https://pinut.org`.
- Verified live `https://pinut.org/` HTML now includes `현재 회원수 9명` and `4곳`.

Test Supabase migration status check:

- User asked whether we can tell how far the test server schema is applied.
- Test Supabase project checked via anon key: `https://pjfhxkvdjipvdmfsacie.supabase.co`.
- Representative table/column probes showed migrations through `0031` are mostly present.
- Corrected probe confirmed `0017_checkin` is present via `tournament_entries.checked_in_at`.
- Missing on test DB:
  - `0032_club_approval`: `clubs.require_approval`, `club_members.status`.
  - `0033_meetup_fee_approval`: `meetups.fee`, `meetups.require_approval`, `meetup_participants.status`.
  - `0034_meetup_image`: `meetups.image_url`.
  - `0035_notify_join_request`: likely not effectively applied because it depends on `status` columns from `0032`/`0033`.
- Recommendation: apply only migrations `0032` through `0035` to the test DB first, then verify, then apply to production. Do not rerun full `schema.sql` on production.

Production Supabase migration status check:

- Production Supabase project checked via anon key: `https://jbvtdthtmrlndduqiikj.supabase.co`.
- Representative probes show production has more recent schema than test.
- Present on production:
  - `0032_club_approval`: `clubs.require_approval`, `club_members.status`.
  - `0033_meetup_fee_approval`: `meetups.fee`, `meetups.require_approval`, `meetup_participants.status`.
- Missing on production:
  - `0034_meetup_image`: `meetups.image_url`.
- `0035_notify_join_request` cannot be fully verified through anon-column probes; it is function/trigger based. It depends on the `status` columns from `0032`/`0033`, which are present in production.
- Production counts at check time: `profiles = 12`, `courts = 4`, `meetups = 4`, `clubs = 8`.

2026-07-15 Vercel production deploy:

- User decided current `pinut-v2.0-dev` web state is close enough to `1.1.0` and web files were not materially changed, so production deploy from current `web-admin` was approved.
- Local `npm.cmd run build` had previously failed only because sandbox/network could not fetch Google Fonts; Vercel remote build completed successfully.
- Command used from `web-admin`: `npx.cmd vercel --prod --yes`.
- Deployment ready: `https://web-admin-fvq0eor9p-troyyoonsikshin-2301s-projects.vercel.app`.
- Production alias applied by Vercel: `https://pinut.org`.
- Vercel build showed `/` and `/landing` as dynamic routes.

2026-07-15 resume update:

- User provided `C:\Users\SEPC\Downloads\이력서_20260715.doc`.
- The file is HTML saved with a `.doc` extension, not a binary Word document.
- Copied original into workspace as `docs/resume-source.doc`.
- Created updated resume as `docs/resume-updated-20260715.doc`.
- Added recent P!NUT experience: Expo/React Native mobile app, Next.js admin web, Supabase Auth/PostgreSQL/RLS/Edge Function, Vercel deployment, Google Play closed testing, App Store Connect review preparation, data safety/privacy release work.
- Expanded listed skills to include PostgreSQL, TypeScript, React Native, Expo, Next.js, Supabase, and Vercel.

2026-07-15 web favicon update:

- User noticed the browser tab icon did not show the P!NUT brand icon.
- Rebuilt `web-admin/app/favicon.ico` from `assets/images/favicon.png`.
- Added `web-admin/app/icon.png` so Next.js can also expose the PNG app icon metadata.
- No deployment was run in this step.

2026-07-15 landing launch day update:

- User changed the official P!NUT launch target to July 31.
- Updated `web-admin/components/landing-countdown.tsx` countdown target from `2026-07-17T12:00:00+09:00` to `2026-07-31T12:00:00+09:00`.
- Updated displayed label from `2026.07.17 12:00 P!NUT launch goal` to `2026.07.31 12:00 P!NUT official launch`.
- No deployment was run in this step.

2026-07-15 Vercel production deploy for landing updates:

- Deployed current `web-admin` to Vercel production after favicon and launch day updates.
- Deployment ready: `https://web-admin-9fjzx757m-troyyoonsikshin-2301s-projects.vercel.app`.
- Production alias applied by Vercel: `https://pinut.org`.
- Vercel build completed successfully; `/`, `/landing`, and `/icon.png` were included.

2026-07-20 app event popup:

- Added `src/components/event-popup.tsx`.
- Popup appears on the main home screen and includes close plus `오늘 하루 보지 않기`.
- Uses `@react-native-async-storage/async-storage` with key `pinut:event-popup:hidden-date` to suppress the popup for the current local day.
- Wired into `src/app/(tabs)/index.tsx` via `<EventPopup />`.
- Verification: `npx.cmd tsc --noEmit` passed.

2026-07-20 event popup banner asset:

- Generated a mobile popup banner image for the opening event.
- Copy text in image: `오픈 이벤트`, `추첨을 통해 경품 증정`.
- Saved project asset at `assets/images/event-open-prize-banner.png`.
- Source generated image remains under `C:\Users\SEPC\.codex\generated_images\019f455b-fa34-7fa1-b667-d11c7bdeed25\call_azS8sQjK3wSm06sCqfBoJcGn.png`.

2026-07-21 P!NUT document hub:

- User wants project/business documents organized under `C:\Users\SEPC\Documents\P!nut`.
- The folder was empty, so a first-level operating document structure was created:
  - `00_Inbox`
  - `01_Store`
  - `02_Business`
  - `03_Legal`
  - `04_Sales`
  - `05_Marketing`
  - `06_Product`
  - `99_Archive`
- Subfolders were created for App Store / Google Play, business registration, tax/banking, Kakao Business, PG/payment, legal docs, court sales, meeting notes, proposals, landing, events, brand assets, roadmap, QA feedback, and release notes.
- No existing files were moved because the folder had no visible files.

2026-07-21 Toss Payments integration scaffold:

- User received business registration and started Toss Payments onboarding.
- Implemented Toss Payments path without adding a new native SDK:
  - App opens Toss checkout through `expo-web-browser`.
  - Supabase Edge Functions keep the Toss secret key server-side.
  - `src/lib/payments.ts` now supports `EXPO_PUBLIC_PAYMENT_PROVIDER=toss`.
- Added `supabase/functions/toss-create-payment/index.ts`:
  - Authenticates the Supabase user.
  - Reads the pending `court_payments` row.
  - Calls Toss Payments `POST /v1/payments` to create a checkout URL.
- Replaced `supabase/functions/pay-verify/index.ts`:
  - Supports `provider = toss` with Toss `POST /v1/payments/confirm`.
  - Preserves the previous `provider = portone` verification branch.
  - Marks `court_payments.status = paid` only after server-side amount/order verification.
- Added web redirect relay pages for Toss `successUrl` / `failUrl`:
  - `web-admin/app/payment/success/page.tsx`
  - `web-admin/app/payment/fail/page.tsx`
  - These pages redirect back to the app scheme with Toss query parameters.
- Updated `.env.example` with public payment settings.
- Required deployment/secrets before live use:
  - Supabase secret: `TOSS_SECRET_KEY`
  - Deploy functions: `toss-create-payment`, `pay-verify`
  - App build env: `EXPO_PUBLIC_PAYMENT_PROVIDER=toss`
  - Deploy web-admin so `/payment/success` and `/payment/fail` exist on `https://pinut.org`.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
  - `web-admin` `npm.cmd run build` passed after replacing `useSearchParams` with `window.location.search`.

2026-07-21 Notion key links page:

- Created a Notion page named `P!NUT 주요 사이트 모음`.
- Page URL: `https://app.notion.com/p/3a412248242a813cb273ff6a117f307c`.
- Included links for Toss Payments, Supabase production/test projects, App Store Connect, Apple Developer, Google Play Console, Expo/EAS, Vercel, Kakao, business/tax/legal portals, and local document paths.
- Added a checklist for missing direct URLs: Vercel project, Expo project, GitHub repo, policy pages, Play test link, App Store public link, Kakao Developers app URL, business docs location, and support form/email.
- Noted that secrets must not be stored in Notion; keep them in Supabase/Vercel/EAS secret managers.

2026-07-21 Toss production setup progress:

- Deployed Supabase Edge Functions to production project `jbvtdthtmrlndduqiikj`:
  - `toss-create-payment`
  - `pay-verify`
- Vercel production deploy completed for `web-admin`.
  - Deployment URL: `https://web-admin-72k1e7149-troyyoonsikshin-2301s-projects.vercel.app`
  - Production alias: `https://pinut.org`
- Verified callback pages return HTTP 200:
  - `https://pinut.org/payment/success`
  - `https://pinut.org/payment/fail`
- Updated `eas.json`:
  - development/preview keep `EXPO_PUBLIC_PAYMENT_PROVIDER=mock`.
  - production uses `EXPO_PUBLIC_PAYMENT_PROVIDER=toss`.
  - all profiles include payment return URL and app scheme.
- Checked Supabase secret names for production; `TOSS_SECRET_KEY` is not registered yet.
- Remaining before live payment testing:
  - Register `TOSS_SECRET_KEY` in Supabase production secrets.
  - Build/publish a new app bundle so the client contains the Toss payment code/env.

2026-07-21 landing business footer:

- User requested the homepage footer include legal business information from the business registration certificate:
  - business name
  - business registration number
  - representative name
  - business address
  - landline phone number
- Added a business info footer to `web-admin/app/landing/page.tsx`.
- Footer values are read from public web environment variables:
  - `NEXT_PUBLIC_BUSINESS_NAME`
  - `NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER`
  - `NEXT_PUBLIC_BUSINESS_REPRESENTATIVE`
  - `NEXT_PUBLIC_BUSINESS_ADDRESS`
  - `NEXT_PUBLIC_BUSINESS_PHONE`
- Missing values render as `확인 필요`; do not deploy to production until real values are set.
- Verification: `web-admin` `npm.cmd run build` passed.
- No production deploy was run for this change.

2026-07-21 business footer values:

- User provided business registration number and registration certificate fields.
- Updated local `web-admin/.env.local` with:
  - `NEXT_PUBLIC_BUSINESS_NAME=피넛`
  - `NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER=221-14-95232`
  - `NEXT_PUBLIC_BUSINESS_REPRESENTATIVE=신윤식`
  - `NEXT_PUBLIC_BUSINESS_ADDRESS=인천광역시 경인대로3, 1동 4층 401호(물류동)`
  - `NEXT_PUBLIC_BUSINESS_PHONE=확인 필요`
- Build verification: `web-admin` `npm.cmd run build` passed.
- No production deploy was run.
- Before production deploy, set the same variables in Vercel production environment and replace `NEXT_PUBLIC_BUSINESS_PHONE` with a real landline/business contact number.

2026-07-21 business footer production deploy:

- User explicitly requested production deploy with business contact number `010 5270 2034`.
- Updated `web-admin/app/landing/page.tsx` default business info values so production shows the required footer even if Vercel env vars are missing.
- Updated local `web-admin/.env.local` phone value to `010 5270 2034`.
- Local `web-admin` `npm.cmd run build` passed.
- Deployed `web-admin` to Vercel production.
  - Deployment URL: `https://web-admin-e4i42p7i0-troyyoonsikshin-2301s-projects.vercel.app`
  - Production alias: `https://pinut.org`
- Verified `https://pinut.org` HTML contains:
  - `피넛`
  - `221-14-95232`
  - `신윤식`
  - `010 5270 2034`

2026-07-22 app boot/home loading polish:

- User reported the app loading screen felt too simple and Home briefly showed empty data before real data loaded.
- Replaced `src/components/ui/boot-screen.tsx` with a richer P!NUT branded boot screen:
  - mascot card
  - P!NUT / Play instant copy
  - animated progress bar
  - Korean loading message
- Updated `src/app/(tabs)/index.tsx`:
  - imports `BootScreen`
  - tracks `initialLoading`
  - keeps showing the boot screen until the first Home data load finishes
  - refreshes still keep the Home screen visible with pull-to-refresh
  - load errors no longer leave the screen stuck; `initialLoading` is cleared in `finally`
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build or production deployment was run.

### Claude -> Codex (2026-07-21, 토스 결제 리워크 — 사용자가 페이먼츠 담당 이관)

- **문제 발견**: `toss-create-payment` 엣지함수가 호출하던 `POST https://api.tosspayments.com/v1/payments` (→ `checkout.url`) 는 **토스에 존재하지 않는 엔드포인트**다. 토스는 서버로 결제창 URL을 만들 수 없고, **클라이언트 SDK(`requestPayment`)로만 결제창**을 연다. (docs.tosspayments.com/reference·sdk/v2/js 로 교차확인)
- **리워크(Path A, 호스팅 체크아웃 페이지)**:
  - 신규 `web-admin/app/payment/checkout/page.tsx` — 토스 v2 SDK(`https://js.tosspayments.com/v2/standard`, ⚠️ `/v2` 는 403) 로드 → `TossPayments(clientKey).payment({customerKey:'ANONYMOUS'}).requestPayment({method:'CARD', amount:{value,currency:'KRW'}, orderId, orderName, successUrl, failUrl})`. 페이지 로드 시 **자동 실행**(중간 버튼 없이), `window.TossPayments` 폴링으로 준비 확인. 클라이언트 키는 `NEXT_PUBLIC_TOSS_CLIENT_KEY`.
  - `src/lib/payments.ts` — `toss-create-payment` invoke 제거, 대신 `{BASE}/payment/checkout?orderId&amount&orderName&successUrl&failUrl` URL을 `openAuthSessionAsync` 로 연다. 리다이렉트 파싱·`pay-verify` 승인은 그대로. `EXPO_PUBLIC_PAYMENT_APP_SCHEME` 제거(미사용).
  - **`supabase/functions/toss-create-payment/` 삭제**(불필요). ⚠️ prod에 이미 배포됐으니 Supabase에서도 삭제 가능(무해하지만 dead).
  - `pay-verify` 는 그대로 재사용(토스 `/confirm` 승인 정확).
- **검증**: web-admin 로컬(3100)에서 체크아웃 페이지 → **실제 토스 테스트 결제창 자동 오픈** 확인(테스트 clientKey, "실제 결제 안됨" 배지). mock 결제도 웹에서 예약 확정까지 검증(court_payments paid).
- **남은 것(실기기 전체 왕복)**: 토스 대시보드 successUrl 도메인 등록 / web-admin 배포(체크아웃+clientKey) / **DEV** Supabase에 `pay-verify` 배포 + `TOSS_SECRET_KEY`(테스트) 등록 / 앱 dev빌드 `EXPO_PUBLIC_PAYMENT_PROVIDER=toss`. 라이브 결제는 사업자 심사 통과(개업일 2026-08-03) 후 라이브키로.
- **코덱스에게**: 페이먼츠는 사용자가 이번엔 Claude에 맡김. `payments.ts`·`pay-verify`·`web-admin/app/payment/*` 는 위 상태가 최신이니 되돌리지 말 것.

2026-07-23 meetup create court request modal fix:

- User reported the court registration request bottom sheet on `src/app/meetup/create.tsx` was partially hidden by the Android navigation bar, and text inputs were hidden by the keyboard.
- Updated `src/app/meetup/create.tsx`:
  - Added `useSafeAreaInsets()` and safe-area bottom padding for the bottom sheet.
  - Wrapped the modal content with `KeyboardAvoidingView`.
  - Made the modal body scrollable with `keyboardShouldPersistTaps="handled"`.
  - Changed the root create screen keyboard behavior to `height` on Android.
  - Increased bottom padding on the create form so lower controls are not cramped behind system navigation.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build or production deployment was run.

2026-07-23 meetup create court request modal keyboard lift fix:

- User clarified the bottom sheet itself must move above the keyboard, not only become scrollable.
- Updated `src/app/meetup/create.tsx` again:
  - Listens to keyboard show/hide events.
  - Tracks keyboard height minus safe-area bottom inset.
  - Applies that value as `marginBottom` to the court request modal card so the whole bottom sheet rises above the keyboard.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build or production deployment was run.

2026-07-31 web-admin tournament court assignment visibility:

- User reported the admin tournament "코트배정" tab was hard to visually scan for who is assigned to which court, especially in a demo singles 8-bracket tournament.
- Confirmed work branch: `pinut-v2.0-dev`.
- Updated `web-admin/app/tournaments/[id]/courts/page.tsx`:
  - Replaced the court status chip-only area with a larger "코트별 진행 현황" board.
  - Each court card now clearly shows court name, indoor/outdoor badge, usage status, current match phase, participant A vs B, and confirmation status.
  - Organizer can confirm/unconfirm or unassign the current court match directly from the court card.
  - Existing assignment table and functions remain intact.
- Verification:
  - `web-admin` page-level eslint for `app/tournaments/[id]/courts/page.tsx` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npm.cmd run build` passed after allowing network for Google Fonts.
- No production deployment was run.

2026-08-03 app profile premium dark UI prototype:

- User shared a dark premium sports profile reference with P!NUT logo, DUPR rating card, quick record/stat/ranking/badge actions, and recent match card.
- Confirmed work branch: `pinut-v2.0-dev`.
- Updated `src/app/(tabs)/profile.tsx` only:
  - Replaced the previous light profile summary layout with a dark athlete-card style profile screen.
  - Kept existing profile edit, connected login management, language setting, my meetups list, sign out, and account deletion functions.
  - Shows DUPR verified/pending badge, rating/skill fallback, profile avatar, region/play style, quick actions, recent activity card, and dark empty states.
  - Did not change routing, data model, Supabase schema, or production deployment.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build or production deployment was run.

2026-08-03 app-wide premium dark UI pass:

- User approved the dark P!NUT athlete-card profile direction and asked to apply it to the remaining app screens.
- Confirmed work branch: `pinut-v2.0-dev`.
- Updated main Expo app UI only; no routing/data model/DB/deploy changes.
- Applied the premium dark sports style to:
  - Bottom tab navigation: `src/app/(tabs)/_layout.tsx`
  - Home: `src/app/(tabs)/index.tsx`
  - Match list: `src/app/(tabs)/matches.tsx`
  - Club list: `src/app/(tabs)/clubs.tsx`
  - Tournament list: `src/app/(tabs)/tournaments.tsx`
  - Community list: `src/app/(tabs)/community.tsx`
  - Profile: `src/app/(tabs)/profile.tsx`
- Updated shared visual components for the same design language:
  - `AppCard`, `AppChip`, `AppHeader`, `AppScaffold`, `Button`, `TextField`, `Badge`, `AppFAB` styling context
  - `MeetupCard`, `CourtCard`, `TournamentCard`, `ClubCard`, `CommunityPostCard`
  - `BootScreen`, `NotificationBell`, `CourtPicker`, `DuprRatingCard`, `DuprRatingChart`
- Updated theme tokens to dark premium surfaces/text/borders while keeping P!NUT primary green.
- Fixed the boot/loading copy to normal Korean text.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 bottom tab IA update: community promoted, clubs moved under More:

- User decided to promote Community and move Clubs out of the primary bottom navigation.
- Updated visible bottom tabs to:
  - `홈`
  - `모임`
  - `코트`
  - `커뮤니티`
  - `전체`
- Updated `src/app/(tabs)/_layout.tsx`:
  - Added visible `court` and `more` tabs.
  - Hid `clubs`, `tournaments`, and `profile` from the tab bar with `href: null` while preserving the routes.
- Added `src/app/(tabs)/court.tsx`:
  - Reuses the existing court reservation/list screen as a bottom tab entry.
- Added `src/app/(tabs)/more.tsx`:
  - New premium dark "전체" hub.
  - Links to 대회, 클럽, 내 예약, 내 정보, 프로필 수정, 연결된 로그인, 알림.
- Existing club, tournament, profile, and court route functionality was not deleted.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 app bottom navigation attached island refinement:

- User shared a Toss-style bottom menu reference and suggested making the nav look integrated with the phone bottom/system navigation area.
- Updated `src/app/(tabs)/_layout.tsx` only:
  - Changed the tab bar from a floating capsule to an attached bottom island.
  - Bar now spans full width, sits at `bottom: 0`, includes safe-area bottom inset, and uses large rounded top corners.
  - Shadow direction changed upward so the bar feels connected to the device bottom area.
  - Existing tab routes and labels remain unchanged.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 app bottom navigation vertical alignment fix:

- User reported the redesigned bottom menu items looked slightly shifted upward.
- Updated `src/app/(tabs)/_layout.tsx` only:
  - Removed extra vertical padding from the floating tab bar.
  - Added explicit tab icon area centering with `tabBarIconStyle`.
  - Matched tab item height to the bar height and centered the custom icon+label group.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 app bottom navigation redesign:

- User asked if the bottom menu could feel different from the default tab bar.
- Updated `src/app/(tabs)/_layout.tsx`:
  - Reworked the tab bar into a floating dark capsule with rounded corners, subtle border, and shadow.
  - Hid default labels and added custom icon+label rendering for each tab.
  - Active tab now uses a bright green rounded icon shell for a faster sports-app feel.
  - Kept the existing tab route names and navigation structure unchanged.
- Updated tab screen bottom spacing so content is not hidden behind the floating nav:
  - `src/app/(tabs)/index.tsx`
  - `src/app/(tabs)/matches.tsx`
  - `src/app/(tabs)/clubs.tsx`
  - `src/app/(tabs)/community.tsx`
  - `src/app/(tabs)/tournaments.tsx`
  - `src/app/(tabs)/profile.tsx`
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 court/reservation surface consistency pass:

- User reported My Reservations and Court Reservation screens still did not feel visually unified, and asked to check popup modals too.
- Updated court-related screens to use the shared AppColors surface system instead of scattered light Material-like hardcoded colors:
  - `src/app/court/index.tsx`
  - `src/app/court/reservations.tsx`
  - `src/app/court/[id].tsx`
- Increased bottom padding on court list and my reservations so the attached bottom navigation does not cover list content.
- Updated popup/modal surfaces:
  - `src/components/court-reviews.tsx`
  - `src/components/event-popup.tsx`
  - `src/components/ui/loading-overlay.tsx`
  - `src/app/meetup/create.tsx` court request bottom sheet
- Updated native court-map selected-court preview card shadow to use a single subtle `boxShadow` style instead of legacy `shadowColor`/`elevation`.
- Rechecked the target files for leftover light background tokens; remaining white values are intentional text colors on primary/dark buttons or toast text.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 court tab top safe-area fix:

- User shared a screenshot where the Court Reservation tab search bar was colliding with the Android status bar at the top of the screen.
- Root cause:
  - Bottom tabs use `headerShown: false`, so tab screens must handle their own top safe area.
  - `src/app/court/index.tsx` was using `SafeAreaView` with only `edges={['bottom']}`.
- Updated `src/app/court/index.tsx`:
  - Changed the root `SafeAreaView` to `edges={['top', 'bottom']}` so the search/toggle header starts below the device status bar.
- Checked other primary tab screens:
  - Home, Matches, Community, More, Clubs, Tournaments, and Profile already use top safe area.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Supabase deployment, Vercel deployment, or production DB work was run.

2026-08-03 P!NUT wordmark usage alignment:

- User decided:
  - App icon should stay as a compact symbol direction (`P!` / app icon style).
  - Splash/loading/landing/store graphic should show the full `P!NUT` wordmark.
- Confirmed existing state:
  - App boot/loading screen already renders `P!NUT`.
  - Login screen already shows the app icon plus `P!NUT` text.
  - Play Store feature graphic already contains `P!NUT`.
- Added a new native splash image:
  - `assets/images/splash-wordmark.png`
  - Uses the peanut mascot plus `P!NUT` and `Play instant`.
- Updated `app.json`:
  - Expo splash image now points to `./assets/images/splash-wordmark.png`.
  - Splash image width increased from `140` to `220`.
- Updated landing hero:
  - `web-admin/app/landing/page.tsx` hero H1 now uses `P!NUT`.
  - `Play now, instantly.` is now supporting hero copy below the brand.
- Verification:
  - `app.json` JSON parse passed.
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
  - `npm.cmd run build` in `web-admin` passed after allowing network access for Google Fonts.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-12 TossPayments app return still landing on Home - nested app-scheme fix:

- User reported that after the Android rebuild, TossPay/Paybooc still returned to the app Home instead of completing the reservation flow.
- Root cause found in `src/components/payment-resume-watcher.tsx`:
  - Some external payment apps return to the merchant app as `pickleball://?...` and include the actual Toss result URL inside a nested query param such as `url`.
  - The previous watcher only detected that `pickleball://` opened the app, then verified by the locally stored pending `orderId`.
  - It did not extract nested Toss return params like `paymentKey`, `orderId`, `code`, or `message`, so the app could wake at the root route/Home without enough result context.
- Updated `src/components/payment-resume-watcher.tsx`:
  - Added parsing for direct `/payment/success` and `/payment/fail` URLs.
  - Added parsing for nested return URLs in `url`, `redirectUrl`, `paymentRedirectUrl`, and `paymentUrl`.
  - Sends both `order_id` and `paymentId` (`paymentKey`) to the `pay-verify` Edge Function when available.
  - Keeps pending-payment retry behavior and routes to `/court/reservations` only after verification.
  - Replaced previously corrupted alert strings in this file with readable Korean.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.

2026-08-12 payment key cleanup check:

- User asked whether the previously shared Toss test keys were deleted.
- Confirmed active env/code no longer contains Toss key patterns such as `test_ck_`, `test_sk_`, `live_ck_`, or `live_sk_`.
- Removed leftover payment env names from `.env.example` and `.env.production`.
- Redacted an old partial public test client key fragment in `docs/HANDOFF.md`.
- Remaining matches are old documentation/worklog variable names such as `TOSS_SECRET_KEY`; no secret values are present.
- Verification:
  - `npx.cmd tsc --noEmit` passed.

2026-08-12 Toss test key setup check:

- User added new Toss test keys and asked for a setup check.
- Local `.env` now contains `EXPO_PUBLIC_TOSS_CLIENT_KEY`.
- Dev Supabase project `pjfhxkvdjipvdmfsacie` contains secret name `TOSS_SECRET_KEY`.
- `.env.production` does not contain Toss client key yet, so this setup is currently dev/local only.
- No payment implementation, Edge Function deploy, app build, store submit, or production deploy was run.
- Important next checks:
  - If the phone is connected to Metro/dev client, reload the app and retest without a native rebuild.
  - If testing a standalone APK with embedded JS, rebuild or deliver an OTA update before retesting.
  - The Edge Function retry/status improvements in `supabase/functions/pay-verify/index.ts` must be deployed to the target Supabase project; local code changes alone do not affect the running server.
- No EAS build, app-store submit, Vercel deployment, or production DB work was run in this step.

2026-08-12 TossPayments direct-window doc comparison:

- User attached TossPayments direct card/easy-pay window documentation.
- Relevant requirements confirmed:
  - Direct card/easy-pay window needs `method: "CARD"`.
  - Direct window needs `card.flowMode: "DIRECT"`.
  - Easy-pay direct window is selected with `card.easyPay` such as `TOSSPAY` or `KAKAOPAY`.
  - App return for app-to-app flows should use `card.appScheme`.
  - Successful auth redirects to `successUrl` with `orderId`, `paymentKey`, and `amount`.
  - Server must confirm payment with Toss confirm API within the valid payment session window.
- Current `web-admin/app/payment/checkout/page.tsx` already sets:
  - `method: CARD`
  - `card.flowMode: DIRECT` when easyPay exists
  - `card.easyPay`
  - `card.appScheme`
- Current likely remaining issue if the app still returns Home:
  - The installed/running app may not include the latest nested app-scheme parsing fix, or
  - The deployed `pay-verify` Edge Function may not include the latest retry/lookup/confirm behavior, or
  - Edge Function logs will show whether `paymentKey` is arriving and whether Toss confirm/lookup succeeds.
- No code change, EAS build, app-store submit, Vercel deployment, or production DB work was run in this step.

2026-08-12 TossPay/Paybooc still returning to Home after SamsungPay works:

- User reported SamsungPay completed normally, but TossPay still returned to app Home.
- Interpretation:
  - The normal web success path works because SamsungPay reaches the `successUrl` and the app/webview can verify.
  - TossPay/Paybooc likely open the merchant app scheme at the app root, for example `pickleball://?url=...`, and Expo Router may consume those params into the current/global route instead of only firing the React Native `Linking` event.
- Updated `src/components/payment-resume-watcher.tsx` again:
  - Added `useGlobalSearchParams()` monitoring.
  - Parses payment return data from global route params as a fallback when Expo Router consumes app-scheme query params.
  - If a `pickleball://` payment return is detected, immediately routes to `/court/reservations` before verification so the user is not dropped on Home.
  - Still verifies through `pay-verify` with `order_id` and `paymentId` when available.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next retest note:
  - This is a JS/app-side change. If testing with Metro/dev client, reload the app.
  - If testing a standalone APK with embedded JS, rebuild or OTA update is required.
- No EAS build, app-store submit, Vercel deployment, or production DB work was run.

2026-08-12 TossPay return/verification analysis:

- User reported: KakaoPay completes correctly, but TossPay returns to the app home after fingerprint auth and the court reservation is not confirmed.
- Root cause found:
  - Toss mobile flow can return through the app scheme/root instead of the web success route.
  - `PaymentResumeWatcher` retried `pay-verify` only briefly and then cleared the pending payment.
  - Once pending storage was cleared, later Toss status propagation could no longer be verified by `order_id`.
  - `pay-verify` also treated several Toss transient/duplicate-processing codes as final failures.
- Changes made:
  - Rebuilt `src/components/payment-resume-watcher.tsx`.
  - It now treats any `pickleball://...` return as a payment resume signal.
  - It retries verification longer: 20 attempts x 1.5s.
  - It clears pending payment only on confirmed paid, old expired pending, or definitive failure.
  - It keeps pending payment on delayed/network/temporary Toss states and suppresses repeated delayed notices per order during the app session.
  - It logs `[payment-resume] verify` in dev builds with `paid`, `pending`, `code`, `error`, and `lookStatus`.
  - Updated `supabase/functions/pay-verify/index.ts` retryable Toss codes:
    - `NOT_FOUND_PAYMENT`
    - `NOT_FOUND_PAYMENT_SESSION`
    - `ALREADY_PROCESSED_PAYMENT`
    - `IDEMPOTENT_REQUEST_PROCESSING`
    - `FORBIDDEN_CONSECUTIVE_REQUEST`
    - `FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING`
    - `FAILED_INTERNAL_SYSTEM_PROCESSING`
    - `UNKNOWN_PAYMENT_ERROR`
    - `COMMON_ERROR`
- Verification:
  - App `npx.cmd tsc --noEmit` passed.
  - Web-admin `npx.cmd tsc --noEmit` passed.
  - App `npx.cmd expo lint` passed.
- Important next test:
  - Run Metro and test TossPay again.
  - Watch Metro logs for `[payment-resume] verify`.
  - If Toss still returns home without reservation, capture the logged `code/lookStatus/error`.
- No app build, EAS submit, Vercel deployment, Edge Function deployment, or production DB work was run.

2026-08-12 BC Paybooc/TossPay WebView intent analysis:

- User reported: KakaoPay works, but BC Paybooc and TossPay do not.
- Analysis:
  - This points more to WebView app-to-app launch handling than to only Toss status verification.
  - Toss docs show mobile WebView can emit intent URLs in forms such as `intent://...#Intent...` and `intent:appScheme://...#Intent...`.
  - Existing `src/app/payment/webview.tsx` only treated `intent://` as an Android intent. `intent:...` could fall through to `Linking.openURL('intent:...')` and fail silently.
- Changes made:
  - Added `isAndroidIntentUrl()` to handle both `intent://...` and `intent:...`.
  - Updated Android external opener and WebView request interception to use the broader intent matcher.
  - Added dev-only `[payment-webview] intent` logs containing packageName, dataUri, fallbackUrl, and raw URL.
  - Added missing official Toss WebView scheme `citicardappkr` to `app.config.js`.
- Verification:
  - App `npx.cmd tsc --noEmit` passed.
  - App `npx.cmd expo lint` passed.
- Important:
  - `src/app/payment/webview.tsx` JS changes can be tested with Metro reload.
  - `app.config.js` native scheme/query changes require a fresh development/production build install.
- No app build, EAS submit, Vercel deployment, Edge Function deployment, or production DB work was run.

2026-08-12 Android dev-pay rebuild for payment app schemes:

- User requested a rebuild after Toss/BC Paybooc WebView intent handling and payment app scheme changes.
- Pre-build validation:
  - App `npx.cmd tsc --noEmit` passed.
  - App `npx.cmd expo lint` passed.
- Build:
  - Command: `npx.cmd eas-cli build -p android --profile dev-pay --non-interactive`
  - Platform: Android
  - Profile: `dev-pay`
  - Distribution: internal
  - Channel: `dev-pay`
  - Build ID: `b8c60025-7720-4a5f-bf0b-c5f8594ed0d0`
  - Version: `2.0.0`
  - Version code: `10`
  - Status: finished
  - Logs: https://expo.dev/accounts/yoonsik2/projects/pickleball/builds/b8c60025-7720-4a5f-bf0b-c5f8594ed0d0
  - APK: https://expo.dev/artifacts/eas/yxI4Z-kxHosN_xYZRRYl2YY_qwiJj6-NyAAhN8Up2_I.apk
- Purpose:
  - Includes native scheme/query updates from `app.config.js`.
  - Use this APK to retest BC Paybooc/ISP and TossPay app-to-app launch/return.
- No EAS submit, Vercel deployment, Edge Function deployment, or production DB work was run.

2026-08-11 Toss Payments reservation confirmation fix:

- Context:
  - Android development client + Metro live test is in progress.
  - User reported TossPay payment itself completes, but the court reservation does not appear to be confirmed afterward.
- App-side fix in `src/app/payment/webview.tsx`:
  - Payment return URL detection now parses URL origin/path instead of relying on `startsWith(successUrl/failUrl)`, so Toss return URLs with additional query params are caught reliably.
  - Removed WebView unmount cleanup that released held reservations before server verification could finish during app-to-app payment return.
  - Added retry-based `pay-verify` handling for pending Toss propagation states.
  - On paid result, the app clears pending payment, dismisses payment screens, and navigates to `/court/reservations`.
  - On pending result, the app moves to reservations with a “payment checking” alert instead of immediately failing/canceling.
- Existing server flow checked:
  - `supabase/functions/pay-verify/index.ts` confirms Toss payment by `order_id`, calls `ensureCourtReservation`, then marks `payments.status = paid`.
  - `PaymentResumeWatcher` also verifies pending payment on foreground as a fallback.
- Verification:
  - Root `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
- Notes:
  - No native rebuild is required for this JS-only app-side fix while testing in the installed dev client.
  - Reload Metro/dev client before retesting.
  - No production deployment, EAS submit, or production DB change was run in this step.

2026-08-11 KakaoPay app-open fallback fix:

- Context:
  - During Toss Payments KakaoPay test, the Toss page showed “카카오페이를 열어주세요 / 눌러서 열기”.
  - Pressing the button opened Google Play’s KakaoTalk listing even though KakaoTalk was already installed.
- App-side fix in `src/app/payment/webview.tsx`:
  - Added Android `intent://...#Intent` parsing.
  - For intent URLs with `package=com.kakao.talk`, the app now first tries `SendIntentAndroid.openAppWithData(packageName, dataUri)` to launch KakaoTalk directly.
  - Chrome-intent fallback remains as a secondary path.
  - If the fallback URL points to Google Play, the app no longer immediately opens the store after all direct app-open attempts fail; it shows a payment-app launch failure alert instead.
- Verification:
  - Root `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
- Notes:
  - This is JS-side behavior and can be tested with the installed dev client after Metro reload.
  - No production deployment, EAS submit, production DB change, or app rebuild was run.

2026-08-11 Toss payment duplicate failure toast fix:

- Context:
  - User showed the reservation list after payment where a red toast said `결제 실패 — Failed to send a request to the Edge Function`, while a green toast also said the reservation/payment completed.
  - This means the reservation was created, but one payment verification request failed transiently during WebView/app return timing.
- App-side fix:
  - `src/app/payment/webview.tsx`
    - `verifyPayment()` now treats `supabase.functions.invoke('pay-verify')` transport/network errors as retryable/pending, not immediate payment failure.
    - After retries, it returns pending instead of showing a scary failure toast.
  - `src/app/payment/success.tsx`
    - Edge Function transport errors now retry and then show “confirmation delayed” copy instead of “payment confirmation failed”.
- Verification:
  - Root `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
- Notes:
  - JS-only fix: dev client reload is enough for testing.
  - No production deployment, EAS submit, production DB change, or app rebuild was run.

2026-08-11 TossPay foreground return verification fix:

- Context:
  - User confirmed KakaoPay can now complete, but payment status messages still felt noisy.
  - TossPay completed fingerprint authentication but returned directly to the app home screen without obvious success verification.
- App-side fix in `src/components/payment-resume-watcher.tsx`:
  - The foreground/resume watcher now actively verifies a pending payment when the app becomes active, even if the Toss success deep link/web return page is not reached.
  - It shows a single “결제 확인 중” notice per order, retries `pay-verify` up to 8 times with delay, and navigates to `/court/reservations` on paid result.
  - If Toss/Supabase propagation is delayed after all retries, it still routes to reservations with a softer “confirmation delayed” notice instead of leaving the user on home.
  - If the payment is definitively not pending, pending payment storage is cleared to avoid repeated checks/toasts.
- Verification:
  - Root `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
- Notes:
  - JS-only fix: dev client reload is enough for testing.
  - No production deployment, EAS submit, production DB change, or app rebuild was run.

2026-08-11 pending payment repeated delayed-toast fix:

- Context:
  - User reported the `결제 확인 중 - 결제 반영이 지연되고 있어요...` toast kept appearing on the reservation screen.
  - Cause: after foreground payment verification exhausted retries, pending payment storage was left in place, so the watcher retried and showed the delayed notice again on later active checks.
- App-side fix in `src/components/payment-resume-watcher.tsx`:
  - Removed the early “결제 결과를 확인하고 있어요” toast to reduce noisy payment feedback.
  - When retries are exhausted and the app routes to reservations with the delayed notice, it now clears pending payment storage so the same toast does not repeat.
- Verification:
  - Root `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
- Notes:
  - JS-only fix: dev client reload is enough for testing.
  - No production deployment, EAS submit, production DB change, or app rebuild was run.

2026-08-12 Toss return URL / appScheme fallback hardening:

- Context:
  - User suspected Toss return URL is wrong because TossPay fingerprint authentication returns directly to the app home screen without an obvious payment success verification flow.
- Findings:
  - Toss docs describe `card.appScheme` as a plain app scheme like `testapp://`; some mobile payment flows may return to this scheme directly rather than the web `successUrl` route.
  - Existing deep links used `pickleball://payment/success`, which can be interpreted with `payment` as the host. To make the app route path explicit, app return URLs now use `pickleball:///payment/success` and `pickleball:///payment/fail`.
- App-side fixes:
  - `src/app/payment/method.tsx`
    - Saves pending payment immediately when the user presses the payment button, before WebView/external payment app launch.
  - `src/components/payment-resume-watcher.tsx`
    - Adds `Linking` URL listener and initial URL check.
    - If the app receives `pickleball://`, `pickleball:///payment/success`, or `pickleball:///payment/fail`, it verifies any pending payment even if Expo Router lands on home.
  - `src/app/payment/success.tsx`
    - Falls back to saved pending payment orderId if Toss/app deep link does not include `orderId`.
  - `src/app/payment/webview.tsx`
    - Uses triple-slash explicit route redirects in `successUrl`/`failUrl`.
- Web-admin alignment:
  - `web-admin/app/payment/success/page.tsx` and `fail/page.tsx` default redirect values also changed to triple-slash routes.
- Verification:
  - Root `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
- Notes:
  - No production deployment, EAS submit, production DB change, or app rebuild was run.
  - App-side changes are JS-only and can be tested after dev-client reload.

2026-08-05 home court reservation navigation/header fix:

- User reported that tapping `코트 예약` `더 보기` from Home opened a screen with duplicate headers and no bottom tab menu.
- Fixed the Home entry route:
  - `src/app/(tabs)/index.tsx`
  - `코트 예약` `더 보기` now navigates to `/(tabs)/court` instead of the root-stack `/court` route, preserving the bottom tab menu.
- Hardened the court list screen against duplicate native headers:
  - `src/app/court/index.tsx`
  - Sets `Stack.Screen` `headerShown: false` because the screen already renders its own `코트예약` title/action row.
- Fixed the empty reservations CTA:
  - `src/app/court/reservations.tsx`
  - `코트 예약하러 가기` now returns to `/(tabs)/court` so users land back in the tabbed court screen.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-05 Toss KakaoPay Android intent return hardening:

- User reported KakaoPay still returns to KakaoTalk after payment.
- Further hardened the Toss web relay pages:
  - `web-admin/app/payment/success/page.tsx`
  - `web-admin/app/payment/fail/page.tsx`
- Android browsers/KakaoTalk now open P!NUT through an explicit intent URL:
  - `intent://payment/success...#Intent;scheme=pickleball;package=com.pinut.app;end`
  - `intent://payment/fail...#Intent;scheme=pickleball;package=com.pinut.app;end`
- iOS and non-Android browsers keep using the normal deep link:
  - `pickleball://payment/success`
  - `pickleball://payment/fail`
- The manual `피넛 앱으로 돌아가기` button uses the same platform-specific return URL.
- Verification:
  - `web-admin` `npx.cmd tsc --noEmit` passed.
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Important:
  - This web relay change must be deployed to `pinut.org` before the real KakaoPay flow can reflect it.
  - No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-05 Toss KakaoPay app return hardening:

- User reported KakaoPay payment succeeds, but tapping the KakaoTalk `direct move` button keeps returning to KakaoTalk instead of P!NUT.
- Updated native payment WebView return setup:
  - `src/app/payment/webview.tsx`
  - Normalizes `EXPO_PUBLIC_PAYMENT_APP_SCHEME` to a bare scheme name (`pickleball`) before passing it to Toss `card.appScheme`.
  - Adds explicit `redirect=pickleball://payment/success|fail` to the web `successUrl` / `failUrl` relay URLs.
- Updated Toss web relay pages:
  - `web-admin/app/payment/success/page.tsx`
  - `web-admin/app/payment/fail/page.tsx`
  - Pages now auto-redirect back to the app after a short delay and also show a manual `피넛 앱으로 돌아가기` button for KakaoTalk/in-app-browser fallback cases.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
  - `web-admin` `npx.cmd tsc --noEmit` passed.
  - `web-admin` `npm.cmd run lint` still fails on pre-existing unrelated React hook lint errors in `dupr-connect`, tournament team, and team-roster files; payment relay files introduced no type errors.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-05 boot screen peanut transparent asset fix:

- User reported the loading peanut avatar still looked dirty because the mascot image itself had a square white background.
- Created a non-destructive transparent-background variant:
  - `assets/images/splash-peanut-cutout.png`
  - Original `assets/images/splash-peanut.png` remains unchanged.
- Updated `src/components/ui/boot-screen.tsx`:
  - Boot screen now uses `splash-peanut-cutout.png`.
  - The circular mascot shell/mask remains in place for a cleaner premium loading mark.
- Verification:
  - Confirmed the new PNG has transparent corner alpha.
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-04 boot screen peanut mascot mask fix:

- User reported the loading screen peanut avatar looked messy because the image showed a square background.
- Updated `src/components/ui/boot-screen.tsx`:
  - Changed the mascot shell to a full circle.
  - Added `overflow: 'hidden'` so the square image background is clipped.
  - Increased the mascot image to fill the circular shell cleanly.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-04 Android transparent system navigation bar / edge-to-edge:

- User wanted the Android system navigation bar at the very bottom to look transparent like KakaoTalk, not white or detached from the app theme.
- Switched from the temporary `expo-navigation-bar` dark-style approach to `react-native-edge-to-edge`.
- Updated `src/app/_layout.tsx`:
  - Replaced global `expo-status-bar` / `expo-navigation-bar` handling with `<SystemBars style="light" />`.
- Updated `app.json`:
  - Added the `react-native-edge-to-edge` config plugin.
  - Set `android.parentTheme` to `Default`.
  - Set `android.enforceNavigationBarContrast` to `false` for a transparent navigation bar direction.
- Cleaned up court-specific React Native `StatusBar` overrides because edge-to-edge manages system bars globally.
- Dependency changes:
  - Added `react-native-edge-to-edge`.
  - Removed the temporary `expo-navigation-bar` dependency.
- Important:
  - This native configuration requires a new development/production build to fully show on Android devices.
  - Plain `npx expo start` alone may not reflect the config-plugin portion until a rebuilt dev client/APK/AAB is installed.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
  - `app.json` parse passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-04 court reservation tab visible title fix:

- User reported the Court Reservation tab did not visibly show `코트예약` in the top header area.
- Updated `src/app/court/index.tsx`:
  - Normalized the route title from `코트 예약` to `코트예약`.
  - Added a visible in-screen `코트예약` title above the search/list-map controls because the bottom-tab layout hides the native header.
  - Kept `내 예약` available as a right-side header action in the same visible top area.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-04 court map and reservation chrome fix:

- Fixed the native court map selected-court card being hidden behind the attached bottom tab bar.
  - `src/components/court-map.native.tsx`
  - The card now uses a safe-area-aware bottom offset above the dark tab island.
- Fixed white native top chrome on court reservation flows.
  - `src/app/court/[id].tsx`
  - `src/app/court/reservations.tsx`
  - Stack headers now use the app dark background, light title/back icon, and no header shadow.
  - Android status bar now uses the app dark background/light content on these screens.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-03 app icon simplified to P!:

- User confirmed the app icon should use only the compact `P!` symbol.
- Regenerated icon assets with a centered `P!` mark:
  - `assets/images/icon.png` — 1024 x 1024, iOS/Expo app icon
  - `assets/images/play-store-icon.png` — 512 x 512, Play Console icon
  - `assets/images/favicon.png` — 256 x 256
  - `assets/images/app-icon-128.png` — 128 x 128
  - `assets/images/android-icon-background.png` — 512 x 512 adaptive icon background
  - `assets/images/android-icon-foreground.png` — 1024 x 1024 adaptive icon foreground
  - `assets/images/android-icon-monochrome.png` — 432 x 432 monochrome icon
  - `web-admin/app/icon.png`
  - `web-admin/app/favicon.ico`
- Design direction:
  - App icon = `P!` only.
  - Splash/loading/landing/store feature graphic = full `P!NUT` wordmark.
- Verification:
  - Confirmed generated asset dimensions.
  - `app.json` JSON parse passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-12 payment reset / removal:

- User decided to remove the current payment integration and rebuild it later from scratch.
- Removed app-side payment runtime code:
  - Deleted `src/lib/payments.ts`.
  - Deleted `src/lib/pending-payment.ts`.
  - Deleted payment routes under `src/app/payment/*`.
  - Deleted `src/components/payment-resume-watcher.tsx`.
  - Removed payment routes and the payment resume watcher from `src/app/_layout.tsx`.
- Court reservation flow now creates reservations directly through `src/lib/court-reservations.ts`.
  - Paid courts no longer open Toss / WebView / external payment apps.
  - Reservation rows are inserted with `payment_id: null`.
  - Button text now says reservation, not payment.
- Removed web-admin payment pages:
  - `web-admin/app/payment/checkout/page.tsx`
  - `web-admin/app/payment/success/page.tsx`
  - `web-admin/app/payment/fail/page.tsx`
  - Removed the now-empty `web-admin/app/payment` directory.
- Removed payment build/env wiring:
  - Removed `EXPO_PUBLIC_PAYMENT_*` entries from `eas.json`.
  - Removed `EXPO_PUBLIC_PAYMENT_*` entries from local `.env`.
  - Removed the temporary `dev-pay` EAS profile.
  - Removed native payment app scheme plugin logic from `app.config.js`.
  - Removed `react-native-send-intent`.
- Removed a stray iframe `allow="payment"` permission from DUPR connect.
- Removed unused local payment table/function types from `src/lib/types.ts`.
- Intentionally not changed:
  - No production deployment.
  - No EAS build or submit.
  - No Supabase deploy.
  - No DB/payment table drop or production data deletion. Existing DB schema/types still contain payment fields/tables for safety.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.

2026-08-03 app icon black background refinement:

- User preferred a black background for the `P!` app icon.
- Regenerated the same icon asset set with a near-black premium background and centered `P!` mark:
  - `assets/images/icon.png`
  - `assets/images/play-store-icon.png`
  - `assets/images/favicon.png`
  - `assets/images/app-icon-128.png`
  - `assets/images/android-icon-background.png`
  - `assets/images/android-icon-foreground.png`
  - `assets/images/android-icon-monochrome.png`
  - `web-admin/app/icon.png`
  - `web-admin/app/favicon.ico`
- Direction remains:
  - App icon = `P!` only, black background.
  - Splash/loading/landing/store feature graphic = full `P!NUT` wordmark.
- Verification:
  - Confirmed generated asset dimensions.
  - `app.json` JSON parse passed.
- No app build, EAS submit, Vercel deployment, or production DB work was run.

2026-08-12 Toss Payments rebuild started:

- Rebuilt payment flow from scratch after the previous WebView/deep-link flow was removed.
- Added the official Toss React Native SDK dependency:
  - `@tosspayments/widget-sdk-react-native@1.5.2`
  - Existing `react-native-webview@13.16.1` satisfies the SDK peer range.
- App-side flow:
  - Added `src/lib/payments.ts`.
  - Added `src/app/payment/court.tsx`.
  - Updated `src/app/court/[id].tsx` so free courts still reserve directly, while paid courts:
    1. create a pending `payments` row,
    2. create temporary reservation holds through `reserve_court_hold`,
    3. open the Toss RN payment widget,
    4. call the server confirmation function,
    5. confirm reservations only after Toss confirm succeeds.
- Server-side flow:
  - Added `supabase/functions/toss-confirm/index.ts`.
  - The function validates the caller, checks the stored payment row, calls Toss Core API `POST /v1/payments/confirm`, marks the payment as `paid`, and clears `court_reservations.expires_at` to finalize the reservation.
  - On Toss confirm failure, the function marks payment `failed` and deletes held reservations.
- Config:
  - Added Android `manifestQueries` payment-app schemes in `app.config.js` via `expo-build-properties`.
  - Added iOS `LSApplicationQueriesSchemes` payment-app schemes in `app.config.js`.
  - Toss `requestPayment` uses `appScheme: "pickleball://"` so external payment apps can return to P!NUT.
  - Added `EXPO_PUBLIC_TOSS_CLIENT_KEY` placeholder to `.env.example`.
  - Local `.env` already contains the public Toss client key; do not commit real keys.
  - Dev Supabase project `pjfhxkvdjipvdmfsacie` already has `TOSS_SECRET_KEY` secret set.
- Deployment:
  - Deployed `toss-confirm` only to dev Supabase project `pjfhxkvdjipvdmfsacie`.
  - Did not deploy to production Supabase.
  - Did not run Vercel production deploy.
  - Did not run EAS build or App Store / Play Store submit.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
  - `npx.cmd expo config --type public` passed and showed Android manifest queries.
- Next test note:
  - Because a native payment SDK was added, a new development build is required before real-device testing.
  - Test with KakaoPay, TossPay, Paybook, and card. Confirm that reservation appears only after the Toss confirmation call succeeds.

2026-08-12 Toss payment screen safe-area fix:

- User reported the new Toss payment screen looked smeared/overlapped at the top and bottom on Android.
- Fixed `src/app/payment/court.tsx` layout:
  - Safe area now includes top and bottom edges.
  - Removed absolute positioning from the bottom payment action bar.
  - Added bottom safe-area padding to keep the payment button above the Android navigation bar.
  - Reduced scroll content bottom padding now that the action bar is part of layout flow.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.

2026-08-12 Toss payment callback/API confirm fix:

- User reported that the Toss confirm API did not appear to be sent after payment testing.
- Confirmed local `.env` points to dev Supabase project `pjfhxkvdjipvdmfsacie` and the app has a Toss test client key.
- Root cause found in the new RN SDK flow:
  - `src/app/payment/court.tsx` only called `confirmTossPayment()` when `requestPayment()` returned `result.success`.
  - For external payment apps such as TossPay/Paybook, the app can return through the app scheme before the Promise path finishes, causing the payment screen to close or return home without sending the confirm API.
- App fixes:
  - Added `src/app/payment/callback.tsx`.
  - Changed Toss `requestPayment` `appScheme` from root `pickleball://` to `Linking.createURL('payment/callback')`.
  - The callback route parses Toss return params (`url`, `paymentKey`, `orderId`, `amount`) and calls `confirmTossPayment()`.
  - Added payment debug logs:
    - `[payment] request start`
    - `[payment] request result`
    - `[payment] confirm start`
    - `[payment] callback confirm start`
  - Registered `payment/court` and `payment/callback` in `src/app/_layout.tsx`.
- Edge Function fixes:
  - Updated `supabase/functions/toss-confirm/index.ts` so `paymentId` is optional.
  - The function can now find the pending `payments` row by `orderId` + authenticated user.
  - If `paymentKey` is missing, it attempts Toss order lookup with `GET /v1/payments/orders/{orderId}` before confirming/finalizing.
- Deployment:
  - Deployed `toss-confirm` only to dev Supabase project `pjfhxkvdjipvdmfsacie`.
  - Did not deploy to production Supabase.
  - Did not run Vercel production deploy.
  - Did not run EAS build or App Store / Play Store submit.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Metro reload should be enough if the installed development build already contains the Toss RN SDK and `pickleball` scheme.
  - If the installed app predates the native SDK addition, rebuild/reinstall the development build.
  - Retest TossPay and Paybook. On return, expected path is payment callback -> dev `toss-confirm` -> `court/reservations`.

2026-08-12 Toss callback missing params follow-up:

- User showed the new payment callback screen with the message that the app could not find the payment result.
- Meaning:
  - The app returned to `payment/callback`, but Toss/external payment app did not include `paymentKey/orderId/amount` or nested `url` params in the incoming link.
  - Because `readTossResult()` required `paymentKey`, it displayed the fallback message and did not call `toss-confirm`.
- App fix:
  - `src/app/payment/court.tsx` now embeds our known `paymentId`, `orderId`, and `amount` into the callback URL passed as Toss `appScheme`.
  - `src/app/payment/callback.tsx` now accepts `paymentId/orderId/amount` without `paymentKey` and calls `confirmTossPayment()`.
  - Server `toss-confirm` already supports this path by finding the payment by orderId and trying Toss order lookup when paymentKey is missing.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Deployment:
  - No production deploy.
  - No new Edge Function deploy needed after this app-only callback parameter change.

2026-08-12 Toss confirm non-2xx diagnostics:

- User showed payment callback screen message: `Edge Function returned a non-2xx status code`.
- Meaning:
  - The app now calls the dev `toss-confirm` Edge Function.
  - The Edge Function returned an HTTP error, but Supabase client only surfaced the generic FunctionsHttpError message.
- App diagnostics added:
  - `src/lib/payments.ts` now reads `FunctionsHttpError.context` when it is a `Response`, parses the JSON body, logs `[payment] confirm http error`, and throws the actual server `error/message`.
  - `src/app/payment/callback.tsx` now logs `[payment] callback params` so the next test shows whether Toss/external payment returned `paymentKey`, `orderId`, `amount`, nested `url`, or only our fallback params.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Metro reload and retry.
  - If screen still errors, read the visible message and Metro logs.
  - Likely next distinction:
    - `toss payment result missing`: callback had no `paymentKey`, and Toss order lookup could not find an approved payment.
    - `toss confirm failed`: Toss confirm API rejected the `paymentKey/orderId/amount`.
    - `payment not found` / `payment mismatch`: app callback params differ from local pending payment row.

2026-08-12 Toss external app return correction:

- User reported:
  - Reservation appeared successful, but the Toss test payment history did not show the latest app payment.
  - Toss API logs did not show a new confirm call for the current test.
- Findings:
  - Current app-generated order IDs are `court_...`.
  - The Toss dashboard screenshots showed `ord_...` order IDs, which are from the older payment flow.
  - Toss RN SDK docs define `appScheme` as the merchant app scheme such as `testapp://`, not a full in-app callback route.
  - The previous callback-route experiment passed `pickleball://payment/callback?...` as `appScheme`, which can make external apps return into Expo Router instead of letting the Toss SDK modal finish its own success flow.
- App fix:
  - Replaced the payment screen `appScheme` with plain `pickleball://`.
  - Kept final reservation confirmation strict: the app calls `confirmTossPayment()` only after `requestPayment()` returns `result.success.paymentKey/orderId/amount`.
  - Restored readable Korean strings in `src/app/payment/court.tsx`.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload Metro and retry TossPay/Paybook.
  - Expected Toss dashboard evidence: a new test payment row with order ID starting `court_...`.
  - Expected app evidence: Metro logs should show `[payment] request result` followed by `[payment] confirm start`.
  - If the app returns home without those logs, the installed dev build may need to be rebuilt/reinstalled because native app scheme handling is involved.

2026-08-12 Toss API log check after missing test payment:

- User showed Toss dashboard API logs and noted that API calls looked missing.
- Current diagnosis:
  - The dashboard rows still show older `ord_...` order IDs.
  - The rebuilt app flow should create `court_...` order IDs from `src/lib/payments.ts`.
  - If Toss test payment history/API logs do not show a fresh `court_...` row, the external payment app did not complete the Toss SDK success path for the current app flow.
- App cleanup:
  - Rewrote `src/app/payment/court.tsx` with readable Korean copy and plain `appScheme: 'pickleball://'`.
  - Rewrote `src/app/payment/callback.tsx` with readable Korean copy and callback diagnostics.
  - Confirm remains strict: no `result.success` from the Toss RN SDK means no `toss-confirm` call and no paid reservation finalization.
- Verification:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload Metro and run a new payment.
  - Success evidence should be:
    - App log: `[payment] request result` with `success`.
    - App log: `[payment] confirm start`.
    - Toss dashboard: new test payment/API log with `court_...` order ID.
  - If the app goes home without those logs, rebuild/reinstall the development build because native URL scheme handling may be stale.

2026-08-13 Codex - Toss API individual payment window rebuild:

- User decided to abandon the Toss React Native payment widget SDK and use the Toss standard payment window directly.
- Removed the unused `@tosspayments/widget-sdk-react-native` dependency from `package.json` / `package-lock.json`.
- Rebuilt `src/app/payment/court.tsx` as a WebView-hosted Toss JS v2 Standard Payment Window flow.
  - Uses `https://js.tosspayments.com/v2/standard`.
  - Calls `payment.requestPayment({ method: 'CARD', ... })` from a user tap inside the WebView.
  - Uses `successUrl=https://pinut.org/payment/success` and `failUrl=https://pinut.org/payment/fail` only as redirect markers intercepted inside the app.
  - Intercepts success/fail URLs, extracts `paymentKey/orderId/amount`, then calls the existing `toss-confirm` Edge Function through `confirmTossPayment()`.
  - Handles Android `intent://` and custom payment-app URLs through `Linking.openURL()` with Play Store fallback for package targets.
- Cleaned `src/app/payment/callback.tsx` Korean copy so fallback callback/error screens are readable.
- Updated `src/lib/payments.ts` to treat only Toss API individual client keys as valid: `test_ck_` or `live_ck_`.
  - This intentionally rejects the old docs/widget-style `test_gck...` key path so the app fails loudly if the wrong key family is configured.
- Important key pairing:
  - App env: `EXPO_PUBLIC_TOSS_CLIENT_KEY=test_ck_...` or `live_ck_...` from Toss API individual integration keys.
  - Supabase Edge Function secret: `TOSS_SECRET_KEY=test_sk_...` or `live_sk_...` from the same API individual key set.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Not done:
  - No production deployment.
  - No EAS build/submit.
  - No Supabase production deploy.
- Follow-up:
  - Restart Metro after env changes.
  - If external payment app return behavior is stale on device, rebuild/reinstall a dev client because native app scheme handling may be cached in the installed app.
  - If Toss dashboard still shows no test payment row, verify the app is using API individual `test_ck_...` and Edge Function uses matching `test_sk_...`, not docs keys.

2026-08-13 Codex - Toss key setup verification:

- User completed Toss key setup.
- Verified local `.env` has `EXPO_PUBLIC_TOSS_CLIENT_KEY` with the expected API individual test client key prefix: `test_ck_`.
- Verified core payment files exist:
  - `src/app/payment/court.tsx`
  - `src/lib/payments.ts`
  - `supabase/functions/toss-confirm/index.ts`
- Updated `.env.example` so future setup points to `test_ck_` / `live_ck_` instead of the old `test_gck` widget/docs key family.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Not done:
  - No production deployment.
  - No EAS build/submit.
  - No Supabase production deploy.
- Next test:
  - Restart Metro after env changes.
  - Test card first, then TossPay/KakaoPay.
  - Confirm Toss dashboard shows a new test payment with `court_...` order ID and the app lands in `내 예약` only after `toss-confirm` succeeds.

2026-08-13 Codex - Android development build started for Toss retest:

- User requested a fresh build after rebuilding Toss payment without the RN widget SDK.
- Started an Android EAS development build from branch `pinut-v2.0-dev`.
- Build command:
  - `EAS_NO_VCS=1 npx eas-cli build -p android --profile development --non-interactive --no-wait`
- Build details:
  - Build ID: `30131572-d6ff-46d9-b560-71384f92dbda`
  - Platform: Android
  - Profile: `development`
  - Distribution: internal
  - Channel: `development`
  - App version: `2.0.0`
  - Build version: `10`
  - Logs: https://expo.dev/accounts/yoonsik2/projects/pickleball/builds/30131572-d6ff-46d9-b560-71384f92dbda
- Status checks:
  - Build uploaded successfully to EAS.
  - Rechecked several times; latest status was still `IN_PROGRESS`.
  - No APK artifact URL was available yet at handoff time.
- Important:
  - EAS output showed only `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID` from the EAS development environment and Supabase URL/anon key from `eas.json`.
  - Local `.env` has `EXPO_PUBLIC_TOSS_CLIENT_KEY=test_ck_...`; for this development client, run Metro locally so the JS bundle uses the local env.
  - If a standalone internal build is needed without Metro, add `EXPO_PUBLIC_TOSS_CLIENT_KEY` to the EAS development environment before rebuilding.
- Not done:
  - No production build.
  - No store submit.
  - No production deployment.

2026-08-13 Codex - Toss payment entry UI refinement:

- User reported the rebuilt Toss payment entry UI looked too rough.
- Reworked `src/app/payment/court.tsx` WebView HTML UI:
  - Removed fake payment-method selection buttons from the pre-payment screen.
  - Changed the screen to a premium dark P!NUT-styled order summary and "open Toss payment window" flow.
  - Shows amount, order summary, shortened order ID, pending approval status, two-step explanation, and one primary CTA.
  - Cleaned broken Korean strings in the payment route again.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Build status update:
  - Previous Android development build `30131572-d6ff-46d9-b560-71384f92dbda` finished.
  - APK: https://expo.dev/artifacts/eas/5Q3sog20-MtaizcvTlDaDdaeqR53vCAEdwye4icRBAg.apk
  - This UI change happened after the EAS build completed, but it is a JS/WebView HTML change and will apply through Metro reload in the development client.
- Not done:
  - No new EAS build after this UI-only change.
  - No production deployment.

2026-08-13 Codex - TossPay failure diagnosis and direct-flow fix:

- User reported TossPay still fails/returns incorrectly while KakaoPay behaves better.
- Diagnosis from `src/app/payment/court.tsx`:
  - The screen was using Toss Standard Payment Window with `card.flowMode: 'DEFAULT'`.
  - In Toss docs, a specific easy-pay provider should be invoked with `card.flowMode: 'DIRECT'` and `card.easyPay`, so TossPay was not being called as a direct TossPay flow.
  - `card.appScheme` was passed as `pickleball://`; changed to the plain scheme value `pickleball`, which is the expected app scheme format for payment app return.
  - The file had mojibake/broken Korean strings in the embedded WebView HTML and route alerts.
- Changes:
  - Replaced `src/app/payment/court.tsx` with a clean payment route.
  - Kept the default Toss payment-window CTA.
  - Added a separate "토스페이로 바로 결제" CTA that calls `requestPayment` with:
    - `method: 'CARD'`
    - `card.flowMode: 'DIRECT'`
    - `card.easyPay: 'TOSSPAY'`
    - `card.appScheme: 'pickleball'`
  - Added `onOpenWindow` handling in the WebView to catch payment app/new-window URLs and pass them to the same external app opener or success/fail handler.
  - Broadened success/fail URL detection so returned URLs with Toss success params can still be confirmed.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - In the current development client, reload Metro and test the new "토스페이로 바로 결제" button first.
  - Expected success path: Toss app/payment screen -> return to P!NUT payment route -> `toss-confirm` Edge Function -> reservation confirmed -> `/court/reservations`.
  - If it still returns to app home, capture the exact screen/URL transition and check whether `onOpenWindow` or `incoming url` logs appear in Metro.

2026-08-13 Codex - Toss retAppScheme validation fix:

- User tested TossPay direct flow and Toss payment screen showed:
  - `retAppScheme=pickleball ... 유효하지 않습니다`
- Root cause:
  - Toss JS SDK docs specify `appScheme` in app URL form such as `testapp://`.
  - The previous fix changed it to plain `pickleball`, which is the Expo config scheme but not the Toss `appScheme` request value.
- Change:
  - Updated `src/app/payment/court.tsx`:
    - `APP_SCHEME = 'pickleball://'`
    - `APP_URL_PREFIX = APP_SCHEME`
  - App config remains `"scheme": "pickleball"` in `app.json`.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload the development client/Metro bundle.
  - Try "토스페이로 바로 결제" again.
  - If TossPay still fails, the next useful signal is the exact Toss screen message or Metro log lines containing `[payment] api-window`.

2026-08-13 Codex - TossPay post-auth return-to-home fix:

- User reported:
  - TossPay opens normally.
  - Fingerprint authentication completes.
  - App returns, but lands on the app/home instead of confirming payment.
- Diagnosis:
  - Toss mobile payment apps can return to the merchant app with an app-scheme URL like `pickleball://?url={paymentRedirectUrl}`.
  - The payment WebView only caught WebView navigation URLs, so an app-level deep link could be handled by Expo Router as a root URL and send the user to home.
- Changes:
  - Added app-level payment redirect interception in `src/app/_layout.tsx`.
    - Detects `pickleball://` URLs with nested `url` query.
    - If nested URL is `/payment/success`, `/payment/fail`, or contains Toss result params, routes to `/payment/callback?url=...`.
  - Added a `Linking.addEventListener('url', ...)` listener inside `src/app/payment/court.tsx` as an extra guard while the payment screen is mounted.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload Metro/development client.
  - Run TossPay fingerprint auth again.
  - Expected: return to payment callback -> `toss-confirm` -> reservation confirmed.
  - If it still lands on home, check Metro logs for `[payment] initial redirect read failed`, `[payment] api-window incoming url`, or whether any `pickleball://?url=` event is emitted.

2026-08-18 Codex - Refund policy page for Toss Payments review:

- User decided to create a simple refund/cancellation policy before continuing payment integration.
- Added public page:
  - `web-admin/app/refund-policy/page.tsx`
  - Intended URL after deployment: `https://pinut.org/refund-policy`
- Policy content covers:
  - Scope: court reservations, tournament/event applications, and other paid services.
  - Court refund rule:
    - Full refund until 24 hours before reservation start.
    - Refund may be limited within 24 hours depending on court policy.
    - No refund after reservation time/no-show.
    - Full refund when use is impossible due to court/operator fault, force majeure, or facility issue.
  - Tournament/event refund rule:
    - Full refund before application close.
    - Refund may be limited after close due to bracket/operation preparation.
    - Full refund if event is canceled by the operator.
  - Refund method/timing: refund to original payment method, usually 3-7 business days depending on payment provider/card issuer.
  - Business info and contact email.
- Added landing footer links:
  - `환불 및 취소 정책` -> `/refund-policy`
  - `계정 삭제 안내` -> `/account-delete`
- Validation notes:
  - `npm.cmd run build` in `web-admin` failed because this environment could not fetch Google Fonts (`Geist`, `Geist Mono`) through `next/font`.
  - `npm.cmd run lint` failed on pre-existing unrelated React hook lint errors in `web-admin/app/dupr-connect/page.tsx`, `web-admin/app/tournaments/[id]/team/page.tsx`, and `web-admin/components/team-roster.tsx`.
  - `npx.cmd tsc --noEmit` failed due stale `.next/dev/types/validator.ts` references to deleted old payment pages (`app/payment/checkout`, `fail`, `success`).
- Not done:
  - Production deployment completed later in this session; see the entry below.

2026-08-18 Codex - Vercel production deploy for refund policy:

- User explicitly asked to deploy after the refund policy page was added.
- Vercel CLI initially failed with `Not authorized` because the deployment needed the project scope.
- Confirmed project scope:
  - `troyyoonsikshin-2301s-projects`
  - project: `web-admin`
  - production domain: `https://pinut.org`
- Deployed with the correct scope to production.
- Deployment:
  - ID: `dpl_F6cfLxGAhfdKphmQFZ7MVmf7jgsS`
  - Vercel URL: `https://web-admin-2qtppzirl-troyyoonsikshin-2301s-projects.vercel.app`
  - Aliased domain: `https://pinut.org`
  - Status: `READY`
- Verified:
  - `https://pinut.org/refund-policy` responds successfully.
  - Page title is `환불 및 취소 정책 | 피넛`.
  - Business info and refund policy content are present in the deployed HTML.
- Reminder:
  - Do not run production deploys unless the user explicitly asks.

2026-08-18 Codex - Toss Payments redirect/confirm rebuild:

- Goal:
  - Finish the Toss Payments integration after the previous payment logic was removed/rebuilt.
  - Keep the app using Toss Payments payment-window redirect flow, not the widget SDK.
- Docs checked:
  - Expo SDK 56 docs before Expo/RN work.
  - Toss Payments official payment-window integration docs.
  - Toss Payments JS SDK docs: mobile must use redirect flow; Promise flow is not supported on mobile.
- App changes:
  - `src/app/payment/callback.tsx`
    - Accepts direct Toss return params and wrapped `url=` params.
    - Accepts `orderId + amount` even if `paymentKey` is missing, because the server can look up the Toss order.
    - Handles fail returns by canceling the pending payment hold when `paymentId` is present.
    - On successful confirmation, moves user to `/court/reservations`.
  - `src/lib/payments.ts`
    - Current payment flow is Toss-only for paid court reservations.
    - Creates pending payment row, reserves court slots with `reserve_court_hold`, then sends the user to the payment screen.
- Edge Function changes:
  - `supabase/functions/toss-confirm/index.ts`
    - Confirmation is now more idempotent.
    - If local payment is already `paid`, it returns the linked reservation ids instead of failing.
    - Looks up Toss order by `orderId` before trying confirm.
    - If Toss already says `DONE`, it skips duplicate confirm and updates local payment/reservation state.
    - Checks amount mismatch before marking paid.
- Web return route changes:
  - Added `web-admin/app/payment/return-client.tsx`.
  - Added/updated:
    - `web-admin/app/payment/success/page.tsx`
    - `web-admin/app/payment/fail/page.tsx`
  - These pages redirect external browser/payment app returns back to:
    - `pickleball://payment/callback?...`
  - This fixes the problem where `https://pinut.org/payment/success` or `/fail` could land on a web page/404 and never return cleanly to the app.
- Web build fix:
  - Removed `next/font/google` Geist dependency from `web-admin/app/layout.tsx`.
  - Switched `web-admin/app/globals.css` to system font stack.
  - Reason: local build environment could not fetch Google Fonts, causing unrelated build failures.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
  - `npm.cmd run build` in `web-admin` passed.
- Not deployed:
  - No Vercel production deployment was run in this step.
  - No Supabase Edge Function deployment was run in this step.
- Required before real phone test:
  - Deploy `toss-confirm` Edge Function to the target Supabase project.
  - Deploy `web-admin` to production so `https://pinut.org/payment/success` and `/payment/fail` exist.
  - User previously instructed: do not run production deployments unless explicitly asked.
- Suggested test path after deployment:
  - Start from court reservation payment.
  - Test card, KakaoPay, TossPay, NaverPay separately.
  - Expected result:
    - Payment app/browser returns to `pinut.org/payment/success`.
    - Web page opens `pickleball://payment/callback`.
    - App calls `toss-confirm`.
    - Payment becomes `paid`.
    - Court reservation hold becomes confirmed with `expires_at = null`.

2026-08-18 Codex - Payment deploy completed:

- User explicitly requested both deployments.
- Supabase Edge Function deployment:
  - Function: `toss-confirm`
  - Project ref: `pjfhxkvdjipvdmfsacie` (test project; current app `.env` points here)
  - Result: deployed successfully.
  - Dashboard: `https://supabase.com/dashboard/project/pjfhxkvdjipvdmfsacie/functions`
- Vercel production deployment:
  - Project: `web-admin`
  - Scope: `troyyoonsikshin-2301s-projects`
  - Deployment ID: `dpl_5YjXa2MbF4VmFHtQAxqnhzCEMo93`
  - Deployment URL: `https://web-admin-hss793gp3-troyyoonsikshin-2301s-projects.vercel.app`
  - Aliases:
    - `https://pinut.org`
    - `https://admin.pinut.org`
    - `https://web-admin-gamma-seven.vercel.app`
    - `https://web-admin-troyyoonsikshin-2301s-projects.vercel.app`
  - Status: `READY`
- Verified:
  - `https://pinut.org/payment/success?paymentId=test` returned HTTP 200.
  - `https://pinut.org/payment/fail?paymentId=test` returned HTTP 200.
- Next test:
  - Use the current development app that points to `pjfhxkvdjipvdmfsacie`.
  - Try court reservation payment again.
  - If payment succeeds in Toss but app confirmation fails, check Supabase Function logs for `toss-confirm` and app logs around `payment/callback`.
- Reminder:
  - Production app/production Supabase Edge Function was not deployed unless separately requested.

2026-08-18 Codex - TossPay bare app-scheme return fix:

- User provided Metro logs:
  - TossPay flow:
    - Toss sandbox mobile URL loaded.
    - Toss app intent opened with `scheme=supertoss`.
    - App received only `pickleball://`.
  - KakaoPay flow:
    - KakaoPay web bridge URL loaded.
    - KakaoTalk intent opened with `scheme=kakaotalk`.
- Diagnosis:
  - TossPay can return with a bare app scheme (`pickleball://`) before the final success/fail URL is available.
  - The app treated that bare scheme like a normal Expo Router deep link, which could route to root/home and lose the payment screen state.
- Changes:
  - Added `src/lib/payment-return-state.ts`.
    - Stores the active court payment route params in memory while the payment screen is mounted.
    - Detects bare payment app returns: `pickleball://` and `pickleball:/`.
  - Updated `src/app/payment/court.tsx`.
    - Saves active payment params when the payment route is valid.
    - Consumes bare `pickleball://` returns and keeps the user on the payment flow instead of treating them as success/fail.
  - Updated `src/app/_layout.tsx`.
    - If a bare `pickleball://` link is received and an active payment exists, routes back to `/payment/court` with the saved payment params.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload the development app and retry TossPay.
  - Expected: after Toss fingerprint/auth returns with `pickleball://`, the app should remain/recover to the payment screen instead of going home.
  - Continue watching for a later `https://pinut.org/payment/success?...` or Toss success params; that is what triggers final confirmation.

2026-08-18 Codex - TossPay bare return now triggers server confirmation:

- User retested and TossPay still only emitted:
  - Toss sandbox mobile URL
  - `intent://pay?...scheme=supertoss...`
  - `pickleball://`
- Diagnosis:
  - The previous fix consumed/recovered the bare app-scheme return, but did not actually ask the server to verify the Toss order after that return.
  - Since `toss-confirm` can now look up Toss payment state by `orderId`, the app can confirm after bare return even without `paymentKey`.
- Change:
  - Updated `src/app/payment/court.tsx`.
  - Extracted confirmation into `confirmPaymentResult`.
  - `confirmSuccess(url)` still uses Toss success params when they exist.
  - Bare `pickleball://` now waits 1.2 seconds, then calls `confirmPaymentResult()` with current `paymentId/orderId/amount`.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload dev app and retry TossPay.
  - Expected after `pickleball://`: app logs should show `[payment] api-window confirm start` and then Supabase `toss-confirm` should be invoked.
  - If it fails, inspect the shown error and Supabase `toss-confirm` logs; likely causes are Toss order still not `DONE`, wrong Toss key pair, or test MID mismatch.

2026-08-18 Codex - TossPay DIRECT disabled for DEFAULT comparison:

- User asked to try TossPay through DEFAULT flow.
- Change:
  - Updated `src/app/payment/court.tsx` embedded Toss payment HTML.
  - Removed the `DIRECT + easyPay: 'TOSSPAY'` request path from the secondary button.
  - Both buttons now open Toss Payments with:
    - `method: 'CARD'`
    - `card.flowMode: 'DEFAULT'`
    - `card.appScheme: 'pickleball://'`
  - Secondary button label changed to `통합 결제창 다시 열기`.
- Purpose:
  - Let the user select TossPay inside the hosted/default Toss payment window, matching the more stable KakaoPay-style flow.
  - Compare whether successUrl/paymentKey returns correctly when not using direct TossPay.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload the dev app.
  - Open payment.
  - Select TossPay inside the Toss integrated payment window.
  - Compare logs against the old DIRECT flow.

2026-08-19 Codex - Align court payment with Toss payment-window docs:

- User provided Toss Payments "payment window" guide using:
  - `TossPayments(clientKey)`
  - `tossPayments.widgets({ customerKey })`
  - `widgets.setAmount({ value, currency: 'KRW' })`
  - `widgets.renderPaymentWindow({ variantKey: { paymentMethod: 'DEFAULT', agreement: 'AGREEMENT' } })`
  - `paymentWindow.on('paymentRequest', ...)`
  - `widgets.requestPayment({ orderId, orderName, successUrl, failUrl })`
- Finding:
  - Current app was not following that guide exactly.
  - It was using API-style `tossPayments.payment(...).requestPayment({ method: 'CARD', card.flowMode: 'DEFAULT' })`.
  - That could make wallet-specific behavior easier to expose in the app flow.
- Changes:
  - Updated `src/app/payment/court.tsx` embedded payment HTML to render a Toss payment window via `widgets`.
  - Payment method selection is now delegated to Toss payment window instead of custom app buttons for each wallet.
  - Kept a fallback basic payment request behind the same button after render, but main path is now widget render -> paymentRequest -> requestPayment.
  - Updated `src/lib/payments.ts` so `EXPO_PUBLIC_TOSS_CLIENT_KEY` accepts both payment-window keys (`test_gck_` / `live_gck_`) and API keys (`test_ck_` / `live_ck_`) during transition.
- Important:
  - For the provided Toss guide, the app should use the order/payment-window client key (`test_gck_...`) in `EXPO_PUBLIC_TOSS_CLIENT_KEY`.
  - The Supabase Edge Function secret `TOSS_SECRET_KEY` must be the matching order/payment-window secret key (`test_gsk_...`) from the same MID/key group.
  - Mixing `test_ck_` with `test_gsk_`, or `test_gck_` with `test_sk_`, can cause Toss confirm errors such as unauthorized/forbidden/not found.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Not deployed:
  - No Supabase Edge Function deploy.
  - No production deploy.
- Next test:
  - Set `EXPO_PUBLIC_TOSS_CLIENT_KEY` to the Toss payment-window `test_gck_...` key.
  - Set test Supabase `TOSS_SECRET_KEY` to the matching `test_gsk_...` key.
  - Restart Metro and retry the court reservation payment.

2026-08-19 Codex - Switch all court payment options to Toss direct payment windows:

- User explicitly changed direction:
  - Use Toss Payments "card company and easy-pay direct window" guide.
  - Convert all payment methods to the direct-window/API individual integration style.
- Important correction:
  - Direct-window integration uses API individual keys:
    - App: `EXPO_PUBLIC_TOSS_CLIENT_KEY=test_ck_...` or `live_ck_...`
    - Supabase Edge Function: `TOSS_SECRET_KEY=test_sk_...` or `live_sk_...`
  - The previous widget/payment-window `test_gck_...` / `test_gsk_...` direction is no longer the target for the app payment screen.
- Changes:
  - Updated `src/app/payment/court.tsx`.
  - Removed the embedded `widgets.renderPaymentWindow()` flow.
  - Restored `TossPayments(clientKey).payment({ customerKey }).requestPayment(...)`.
  - Added direct-window method buttons:
    - TossPay: `easyPay: '토스페이'`
    - KakaoPay: `easyPay: '카카오페이'`
    - NaverPay: `easyPay: '네이버페이'`
    - PAYCO: `easyPay: '페이코'`
    - Samsung Pay: `easyPay: '삼성페이'`
    - Card: fallback `flowMode: 'DEFAULT'` because direct mode needs a specific card/easy-pay target.
  - Direct easy-pay options use:
    - `method: 'CARD'`
    - `card.flowMode: 'DIRECT'`
    - `card.easyPay`
    - `card.appScheme: 'pickleball'`
  - `appScheme` is intentionally the scheme name without `://` to avoid Toss `retAppScheme` validation errors.
  - Updated `src/lib/payments.ts` so `isTossConfigured` only accepts `test_ck_` / `live_ck_` again.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Not deployed:
  - No app build started.
  - No Supabase Edge Function deploy.
  - No production deploy.
- Next test:
  - Restart Metro if needed.
  - Test TossPay first.
  - If TossPay returns to the app and confirm fails, inspect the now-improved app alert/log body from `toss-confirm`.
  - If a direct provider button fails before opening, confirm the exact `easyPay` string accepted by Toss SDK for that provider.

2026-08-19 Codex - Make every visible payment option DIRECT only:

- User corrected that every payment option must use Toss direct-window mode.
- Change:
  - Updated `src/app/payment/court.tsx`.
  - Removed the generic "card payment" DEFAULT fallback button from the visible payment methods.
  - Added card-company direct buttons instead:
    - Hyundai Card: `cardCompany: '현대'`
    - Samsung Card: `cardCompany: '삼성'`
    - Shinhan Card: `cardCompany: '신한'`
    - KB Kookmin Card: `cardCompany: '국민'`
    - BC Card: `cardCompany: 'BC'`
    - Lotte Card: `cardCompany: '롯데'`
    - NH Card: `cardCompany: '농협'`
  - Existing easy-pay buttons stay DIRECT:
    - TossPay, KakaoPay, NaverPay, PAYCO, Samsung Pay.
  - `getCardOptions()` now always returns `flowMode: 'DIRECT'`.
  - `easyPay` is used for easy-pay buttons; `cardCompany` is used for card-company buttons.
  - Restored `appScheme` to `pickleball://` to match Toss docs examples for mobile app return schemes.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Note:
  - If a specific card company/easyPay value is rejected by Toss SDK, verify the exact provider code/string in Toss SDK docs or with Toss support.

2026-08-19 Codex - Stop treating bare TossPay app return as payment completion:

- User reported TossPay still returns incorrectly after fingerprint/auth.
- Diagnosis:
  - TossPay direct flow can emit only the app scheme URL (`pickleball://`) when returning from the Toss app.
  - That URL is not a success or failure result; it is only an app foreground signal.
  - Previous code handled bare `pickleball://` by routing back to `/payment/court` or by calling `toss-confirm` after 1.2s.
  - That could interrupt the WebView before Toss redirects to the real `successUrl` with `paymentKey/orderId/amount`.
- Changes:
  - Updated `src/app/_layout.tsx`.
    - Bare `pickleball://` is now consumed/no-op globally.
    - It no longer calls `router.replace('/payment/court')`.
  - Updated `src/app/payment/court.tsx`.
    - Bare `pickleball://` no longer triggers `confirmPaymentResult()`.
    - It now only updates status text and waits for the real success/fail URL.
  - Final confirmation still only happens when:
    - `https://pinut.org/payment/success?...paymentKey=...&orderId=...&amount=...` is received, or
    - equivalent success query params are present.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Reload the dev app via Metro.
  - Retry TossPay.
  - Expected logs:
    - Toss mobile URL
    - Toss app intent
    - bare `pickleball://`
    - then eventually a real success/fail URL.
  - If only bare `pickleball://` appears and no success/fail URL follows, the remaining issue is likely Toss direct-window WebView return behavior or the `appScheme` format expected by Toss.

2026-08-19 Codex - Prevent Android back button from minimizing app on payment failure:

- User reported:
  - In Toss payment window, choose TossPay.
  - TossPay fails/returns.
  - Pressing the device back button minimizes/exits the app instead of returning to the app flow.
- Change:
  - Updated `src/app/payment/court.tsx`.
  - Added Android `BackHandler` handling on the payment route.
  - Hardware back is now consumed and calls `leavePayment()`.
  - `leavePayment()` clears active payment return state, cancels the pending payment hold if payment is not completed, and routes to `/court`.
  - Success path now marks payment as completed and clears active payment return state.
  - Failure alert now routes to `/court` instead of `router.back()` to avoid app minimization when route history is shallow.
  - Payment route cleanup now clears active payment return state.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Test:
  - Metro reload is enough; no new native build required.
  - Retry TossPay failure/return, then press Android back.
  - Expected: app stays open and moves to court reservation screen.

2026-08-19 Codex - Toss direct payment provider codes and auth debugging:

- User reported:
  - After tapping the in-app payment button, Toss Payments/TossPay does not show fingerprint authentication.
- Diagnosis:
  - TossPay biometric authentication should appear inside the Toss app, not inside the Toss Payments WebView.
  - The first thing to verify is whether the payment WebView emits a Toss app intent and whether React Native actually opens it.
  - Toss docs list direct-window easy-pay provider codes such as `TOSSPAY`, `KAKAOPAY`, `NAVERPAY`, `PAYCO`, `SAMSUNGPAY`; code values are safer than Korean display strings.
- Changes:
  - Updated `src/app/payment/court.tsx`.
  - Payment buttons still display Korean labels, but now send official Toss provider/card codes:
    - `easyPay: 'TOSSPAY'`
    - `easyPay: 'KAKAOPAY'`
    - `easyPay: 'NAVERPAY'`
    - `easyPay: 'PAYCO'`
    - `easyPay: 'SAMSUNGPAY'`
    - `cardCompany: 'HYUNDAI'`
    - `cardCompany: 'SAMSUNG'`
    - `cardCompany: 'SHINHAN'`
    - `cardCompany: 'KOOKMIN'`
    - `cardCompany: 'BC'`
    - `cardCompany: 'LOTTE'`
    - `cardCompany: 'NONGHYEOP'`
  - Added `PAYMENT_REQUEST_START` WebView message logging with selected mode/code/label and card options.
  - Added `[payment] external app open` logging before `Linking.openURL()` so we can confirm the app URL/package being opened.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test:
  - Metro reload is enough.
  - Select TossPay, tap payment.
  - Check Metro logs for:
    - `[payment] api-window message {"type":"PAYMENT_REQUEST_START"... "mode":"easyPay:TOSSPAY"}`
    - `[payment] api-window incoming url intent://pay?...package=viva.republica.toss...`
    - `[payment] external app open ... appUrl: 'supertoss://pay?...'`
 - If those logs appear but no biometric appears, the next suspected layer is Toss app/test account/test-payment behavior, not local request construction.

2026-08-19 Codex - TossPay bare-return verification fallback:

- User said the TossPay issue is still hard to identify.
- Diagnosis:
  - Some TossPay/app-to-app flows can return only the bare app scheme (`pickleball://`) before or instead of the final `successUrl`.
  - Treating that bare scheme as success is unsafe, but doing nothing can leave the app waiting forever.
  - The server can safely check Toss status by `orderId`; if Toss has not exposed the payment result yet, it should report `pending` rather than fail and delete the held reservation.
- Changes:
  - Updated `src/app/payment/court.tsx`.
    - When `pickleball://` is received, the app now waits 2.5 seconds and calls `confirmPaymentResult()` with the current `paymentId/orderId/amount`.
    - If a real success URL arrives first, the fallback does not duplicate confirmation.
  - Updated `supabase/functions/toss-confirm/index.ts`.
    - If Toss order lookup does not yet return a payment result and no `paymentKey` is available, returns `{ ok: false, pending: true }`.
    - It no longer treats this transient state as a hard error.
    - This avoids prematurely marking the local payment as `failed` or deleting held reservations while TossPay is still resolving.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Required before phone retest:
  - Deploy `toss-confirm` to the test Supabase project (`pjfhxkvdjipvdmfsacie`).
  - Metro reload is enough for the app-side JS change.
- Expected TossPay behavior after deploy:
  - App receives `pickleball://`.
  - 2.5 seconds later logs `[payment] api-window confirm start`.
  - If Toss order is `DONE`, reservation is confirmed.
  - If Toss still has no result, app shows a waiting message instead of a hard failure.

2026-08-19 Codex - Deployed toss-confirm fallback to test Supabase:

- User asked Codex to deploy the function.
- Deployment target:
  - Supabase test project: `pjfhxkvdjipvdmfsacie`
  - Function: `toss-confirm`
- Result:
  - Deployed successfully.
  - Dashboard: `https://supabase.com/dashboard/project/pjfhxkvdjipvdmfsacie/functions`
- Scope:
  - Test Supabase only.
  - Production Supabase was not touched.
- Next test:
  - Reload the development app via Metro.
  - Retry TossPay.
 - Watch Metro logs for:
    - `mode":"easyPay:TOSSPAY"`
    - `intent://pay?...package=viva.republica.toss...`
    - `pickleball://`
    - `[payment] api-window confirm start` roughly 2.5 seconds later.

2026-08-19 Codex - Align direct-window values with Toss sample code:

- User provided Toss sample code for direct payment window:
  - `TossPayments(clientKey)`
  - `tossPayments.payment({ customerKey })`
  - `payment.requestPayment({ method: 'CARD', card: { flowMode: 'DIRECT', easyPay: '토스페이' } })`
- Comparison result:
  - App structure already matched the sample at the request level.
  - Main mismatch was that the app had been changed to English provider/card codes such as `TOSSPAY`, while the sample uses Korean direct-window values such as `토스페이`.
- Change:
  - Updated `src/app/payment/court.tsx`.
  - Reverted direct-window request values to match the provided Toss sample:
    - `easyPay: '토스페이'`
    - `easyPay: '카카오페이'`
    - `easyPay: '네이버페이'`
    - `easyPay: '페이코'`
    - `easyPay: '삼성페이'`
    - `cardCompany: '현대'`
    - `cardCompany: '삼성'`
    - `cardCompany: '신한'`
    - `cardCompany: '국민'`
    - `cardCompany: 'BC'`
    - `cardCompany: '롯데'`
    - `cardCompany: '농협'`
- What remains intentionally different from the Toss browser sample:
  - `card.appScheme: 'pickleball://'` is kept because this is a mobile app WebView/app-to-app flow.
  - `successUrl/failUrl` use `https://pinut.org/payment/success|fail` with `paymentId` so the app can confirm the reservation.
  - `customerKey` uses the app's authenticated user id instead of a sample static value.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Next test expectation:
  - Metro reload is enough.
  - TossPay request log should now show `mode":"easyPay:토스페이"`.

2026-08-19 Codex - Remove appScheme from Toss direct-window card options:

- User suspected sending `card.appScheme: 'pickleball://'` may be the reason TossPay returns only `pickleball://` instead of continuing to `successUrl`.
- Official Toss docs say `appScheme` is used for returning from mobile ISP/external payment apps, but the current raw WebView + JS SDK flow repeatedly received a bare app scheme with no `paymentKey/orderId/amount`.
- Change:
  - Updated `src/app/payment/court.tsx`.
  - Removed unconditional `appScheme: paymentInfo.appScheme` from `card` options in the direct-window request.
- Expected retest signal:
  - `PAYMENT_REQUEST_START` log should no longer include `appScheme` inside `card`.
  - TossPay should ideally continue to `https://pinut.org/payment/success?...` instead of returning only `pickleball://`.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Deployment:
  - No production deployment was performed.
  - Metro reload should be enough for development testing.

2026-08-19 Codex - Toss payment success conclusion:

- User confirmed all payment methods now complete successfully after removing `card.appScheme` from the Toss direct-window request.
- Root cause conclusion:
  - Sending `card.appScheme: 'pickleball://'` caused TossPay to return a bare `pickleball://` instead of continuing to the final `successUrl` redirect.
  - A bare `pickleball://` has no `paymentKey/orderId/amount`, so it must not be treated as payment success.
- Keep this rule:
  - Do not re-add `card.appScheme` to the Toss direct-window card options unless a future implementation uses the official SDK redirect handler end-to-end.
  - Treat only `successUrl`/`failUrl` with Toss query params as payment result sources.
- Current status:
  - Payment success confirmed by the user.
  - Remaining issue is cleanup/UX after completion: prevent WebView from showing leftover `ERR_NAME_NOT_RESOLVED`/undefined page after the payment has already succeeded, and route cleanly to reservations.
- Deployment:
  - No production deployment was performed by Codex in this step.

2026-08-19 Codex - Clean payment completion UX after Toss success:

- User confirmed Toss payment succeeds after removing `card.appScheme`.
- UX issue:
  - After success, the payment WebView could remain visible briefly and show leftover blank/error/undefined states before the app moved to reservations.
- Change:
  - Updated `src/app/payment/court.tsx`.
  - Added a local `paymentFinished` completion state.
  - Once `confirmTossPayment` succeeds:
    - mark payment as completed,
    - clear active payment return state,
    - replace the WebView with a small completed state,
    - route automatically to `/court/reservations` after a short delay.
  - Block further WebView navigation after completion/exiting.
  - Ignore empty or `undefined` WebView target URLs.
  - Bare `pickleball://` returns are still treated only as an app-return signal, not payment success.
  - Removed the unused `appScheme` payload from the embedded payment page data to avoid future confusion.
- Validation:
  - `npx.cmd tsc --noEmit` passed.
  - `npx.cmd expo lint` passed.
- Deployment:
  - No production deployment was performed.
