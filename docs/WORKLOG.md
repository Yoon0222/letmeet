# 피클 — 작업 일지 (WORKLOG)

피클볼 커뮤니티 슈퍼앱의 핵심 결정·작업 기록. 날짜 섹션(`## YYYY-MM-DD`)이 최신순으로 위에 오고, 같은 날짜 안에서는 최신 작업(`### 제목`)이 위로 온다.

## 열린 항목
- [x] Supabase에 `0004_tournaments.sql` 실행 (대회 테이블) — 적용됨(테이블 200 확인)
- [x] 권한(역할) 체계 코드 완료 (role + RLS + 트리거 + 관리자 웹 게이트 + 사용자관리)
- [x] `0005_roles.sql` 실행 + super_admin 부트스트랩(`관리자`=ysshin93) — 완료
- [x] `0006_tournament_matches.sql` (+ 뷰 재생성) 실행 — 완료, 조별→4강→결승 QA 통과
- [x] Supabase에 `0007_discipline.sql` 실행 (단식/복식) — 완료
- [x] Supabase에 `0008_partner.sql` 실행 (복식 파트너 `partner_id`) — 완료(라이브 QA 통과)
- [x] Supabase에 `0009_audit.sql` 실행 (감사 로그) — 완료(신청/거절 기록 QA 통과)
- [x] Supabase에 `0010_push_token.sql` 실행 (profiles.push_token) — 완료(컬럼 확인)
- [x] Supabase에 `0011_avatars.sql` 실행 (아바타 Storage 버킷+RLS) — 완료(업로드 라이브 검증)
- [x] UI 리프레시: 밝은 화이트/비비드 그린 테마 + 홈 3대 진입 재설계 + 부팅 스플래시(피넛 일러스트+로딩바) — 완료
- [x] 프로필 사진(아바타): 피넛 25종 자동배정·선택·직접 업로드 — 완료
- [x] **Edge Function 배포** `notify-turn`(개인/KDK 차례 푸시) + `notify-tie`(단체전 타이 푸시) — 운영·개발 배포·검증 완료 (2026-07-14)
- [ ] 대회 **차례 알림에 코트·대기번호 포함** ("○○님, 3번 코트로 · 대기 N") — notify-turn 엣지 함수 페이로드에 court/대기번호 추가 + 배포와 함께
- [x] 대회 2단계 — 모바일 참가 신청 화면(대회 탭/목록/상세/신청) 완료
- [x] 앱 대진표/내 경기 열람(브래킷 트리) + 선수 앱 푸시(내 차례) 코드 — 완료
- [ ] 대회 2단계 잔여: **진행자 "카톡 울리기"(노쇼 호출)**, 3·4위전, 정원 자동 마감
- [~] 대회 **선착순 참가 + 결제/대기열 흐름**: **대기열은 구현 완료**(`0016` — 정원 초과 자동 `waitlist` + 취소 시 자동 승격 + "대기 N번" 표시, 2026-07-07). **남은 것(결제 흐름)**: `입금 대기`도 정원 포함 → 결제 완료 시 `참가 확정`, 신청 후 **24h 미입금 자동 취소**, 대기 승격 시 **카카오톡 입금 요청(알림톡)+24h**. 무료 대회(fee=0)는 신청 즉시 확정. 실제 결제는 PG(포트원/토스) 가맹점 계약·통신판매업 필요 → 나중에 연동
- [ ] Supabase에 `0003_clubs.sql` 마이그레이션 실행 (클럽 테이블 생성) — 사용자
- [x] 앱 이름 피클 → **피넛(PEANUT)** 변경 + 브랜드 정의(AGENTS.md) — 커밋 `4d988d4`
- [x] 카카오 로그인 — `account_email` 필수동의 설정으로 KOE205 해소, dev 라이브 검증·플래그 on (2026-07-22). 남은 것: **일반 공개 전 카카오 검수·비즈앱**(개업일 2026-08-03 이후)
- [x] 구글·애플 로그인 — dev·prod provider 설정 + 연결된 로그인 관리 화면 완료. 남은 것: **Google 동의화면 프로덕션 게시**
- [ ] **결제 전체 왕복 1회 완주 검증** (결제→앱복귀→예약확정) — dev-client 에서 진행 중. 한국 결제수단이 앱 기반이라 테스트폰 완주가 관건
- [ ] **prod 마이그레이션 0043~0052 일괄 실행** — 심사/사용 전 필수. `scratchpad/PROD_v2.0_migrations.sql` 준비됨(2026-07-24 확인: 전부 미실행)
- [ ] ⚠️ **5.1.1(v) 재리젝 리스크 점검** — v1.0.4 는 "비계정 기능에 로그인 강제"로 리젝됨. `ee4bf61` 로 게스트 열람을 다시 없앴으므로, **이 커밋이 심사 제출 빌드에 포함됐는지** 확인 필요. 포함 시 동일 사유 재리젝 가능
- [ ] 결제 스테일 홀드 자동정리 스케줄 — `pg_cron` 활성화 + `release_stale_court_holds` 5분 주기 등록
- [ ] 대회 참가비 결제 + 대기승격 결제 (Phase 2) — 결제=즉시확정, 정원초과=waitlist(무결제)→승격 시 결제. 결제 엔진 완주 검증 후 착수
- [ ] `.env` 임시 toss → 결제 테스트 끝나면 mock 복귀 (`.env.premockbak`)
- [ ] 노션 페이지·`docs` 브랜드 "피넛" 통일 (로드맵/todo/개인정보처리방침)
- [ ] 안드로이드 개발 빌드(EAS) 실행: `eas build -p android --profile development` — 사용자
- [x] 노션 MCP 커넥터 연결됨 (이 세션에서 로드맵 페이지 갱신에 사용)
- [x] 노션 커넥터 연결 + "피클 — 기능 현황 & 로드맵" 페이지 생성
- [x] 변경분 커밋 (카카오·빌드설정·홈·탭재편·클럽·QA/워크로그) — `7879045`
- [x] Supabase 프로젝트 연결 + 스키마 실행 (ref `pjfhxkvdjipvdmfsacie`)
- [x] MVP 커뮤니티 매칭 구현 및 웹에서 동작 확인

### 남은 일 스냅샷 (2026-07-08 기준)
**🚀 이번 주 심사 제출 (금요일 목표)**
- [ ] 스크린샷 기기 사이즈별 추출 — iOS 6.7"/6.5"/5.5" + iPad, Android. (docs/APPSTORE.md 스펙) — 나(빌드에서)
- [ ] iOS 심사 제출 — Apple Developer $99/yr 등록(사용자) → EAS 프로덕션 빌드 → App Store Connect 등록·심사 제출. (스크린샷 선행)
- [ ] Android 심사 제출 — EAS 프로덕션(aab) → Play 콘솔 데이터 보안·심사 제출. (콘솔 한글 인증 사용자 진행 중, 스크린샷 선행)
- [ ] 안드로이드 실기기 네이버 지도 동작 확인 — 개발빌드 설치 후 지도 토글·마커 4개·마커 탭→예약 — 사용자
- [x] 심사 요건: UGC 신고·차단 / 개인정보처리방침 URL / 회원 탈퇴 — 완료

**⏸️ 보류 (외부 승인·계약 대기)**
- [~] 결제 PG 연동(포트원) — 스캐폴드 완료. 실연동은 사업자·통신판매업·PG 계약+파트너 키 필요. 대회 결제/입금(24h) 흐름도 함께.
- [~] DUPR 검증 연동 — 회신 도착(2026-07-09, Rebecca): **라이브·공개 플랫폼이어야 승인**. 기능 요건은 충족, 유일한 게이트=스토어 출시. **출시 후** 라이브 URL·지표 담아 회신(docs/DUPR.md 초안) → 온보딩. 현재 자가입력 유지.
- [~] 카카오 로그인 활성화 — 비즈앱 전환 신청 필요, 출시 후. 현재 features 플래그로 버튼 숨김.
- [~] 운영/개발 DB 분리 — 개발 완료 후. schema.sql로 새 prod 프로젝트 1회 세팅 가능.

**🔧 기능 백로그 (출시 후/여유 시)**
- [ ] 대회 차례 알림 Edge Function 배포(notify-turn) + 코트·대기번호 포함 — 실기기 빌드+FCM 필요
- [ ] 대회 2단계 잔여 — 진행자 "카톡 울리기"(노쇼 호출)·3·4위전·정원 자동 마감
- [ ] 코트 예약 Low 개선 2건 — 다중 슬롯 부분충돌 안내 / court_reservations RLS 타인 user_id 노출 → 점유여부 뷰 제한
- [ ] 노션·docs 브랜드 "피넛" 통일 (로드맵/QA/개인정보처리방침)

### 향후 대형 에픽 (상세는 노션 로드맵)
- [~] 코트 예약(사용자) — **선수 예약 + 관리자 코트 등록 + 네이버 지오코딩 라이브 + 네이버 지도(SDK) 코드 완료**(`0018`~`0020`). 안드로이드 개발 빌드로 실기기 지도 확인 중. 남은 것: 결제(PG) + 코트 소유자 배정 + 내 예약 목록 화면
- [ ] 대회: 개설·운영(관리자) · 참여 · 내 차례 카카오톡 알림톡
- [ ] 웹 관리자 페이지(별도 웹앱) + 권한(역할) 체계
- [ ] 커뮤니티 화면 (자유게시판 · 후기 · 팁)
- [ ] 실력·성장: 경기기록/통계 대시보드 · 코치 마켓 · 게이미피케이션(챌린지·뱃지·스트릭)
- [ ] 매칭 고도화: 실시간 "지금 칠 사람" · 정기 파트너 · 출석/노쇼 관리
- [ ] 편의: 코트 디렉토리·리뷰 · 날씨 · 더치페이 · 카톡 공유/캘린더
- [ ] 수익화: 프리미엄 · 대회 참가비 · 상점 수수료 · 광고
- [ ] 상점 화면 (피클볼 용품 판매) — 로드맵 가장 마지막

---

## 2026-07-24

### v2.0.0 릴리스 — 태그 + main + Vercel 배포
- **결정**: 심사 제출에 맞춰 `pinut-v2.0-dev` → `main` FF, **`v2.0.0` 태그** push. web-admin 을 Vercel 프로덕션(pinut.org)에 배포(코덱스 랜딩 사업자정보 푸터 포함 — 사용자 승인).
- **만든 것**: 릴리스 노트/스토어현황 노션 갱신. 코덱스 미커밋 파일은 작업트리에 그대로 두고 커밋된 것만 반영.
- **주의**: 🔴 **prod 마이그레이션 0043~0052 미실행** — 심사 전 필수. `scratchpad/PROD_v2.0_migrations.sql` 로 준비됨.

### EAS Update(OTA) 도입 + 게스트 열람 제거
- **결정**: (1) `expo-updates` 붙여 심사 없이 JS 핫픽스 배포 가능하게. `.env.production` 으로 OTA 번들이 개발 DB 를 물지 않도록 고정. (2) 게스트 브라우징 제거 — 비로그인은 무조건 로그인 화면(`Stack.Protected`).
- **만든 것**: `app.json` updates/runtimeVersion, `eas.json` 프로필별 channel, `_layout.tsx` 가드 전환. 커밋 `141091c`·`ee4bf61`.
- **주의**: ⚠️ 둘 다 **네이티브/네비 변경이라 재빌드 필요**. 게스트 제거는 v1.0.4 리젝 사유(5.1.1(v))와 충돌 가능 — 아래 열린 항목 참고.

---

## 2026-07-22

### 인앱 WebView 결제 전환 + 실기기 테스트
- **결정**: 토스 결제를 인앱 브라우저(openAuthSessionAsync) → **앱 안 WebView** 로 전환. 브라우저 튕김·"피넛을 연결할까요? 열기" 프롬프트·딥링크 404 를 원천 제거. 카드사·간편결제 앱 스킴만 `Linking` 으로 외부.
- **만든 것**: `react-native-webview` + `payment/webview.tsx`(체크아웃 로드 → success/fail 을 앱 내부에서 가로채 pay-verify 승인 → 예약 확정). `payments.ts` 는 주문·홀드만 하고 payload 반환. 복귀 강화(`onNavigationStateChange` 백업), 결제 미완료 이탈 시 홀드 자동 해제.
- **메모**: 실기기에서 결제수단 선택창까지 인앱 정상 확인. 단 **한국 결제수단 대부분이 앱 기반**(카카오페이·페이북 등)이라 테스트폰에 해당 앱이 없어 **완주 실패** — 실사용자는 앱이 있어 프로덕션에선 정상 예상. 커밋 `b3e46e5`·`4dd5fe3`·`e20ae0d`.

### 네이티브 딥링크 복귀 라우트 (소셜 로그인 404 해결)
- **결정**: 실기기 로그인 후 `pickleball://auth-callback?code=` 로 앱이 열리는데 받는 라우트가 없어 "Unmatched Route" 404 → 콜백 라우트 신설.
- **만든 것**: `auth-callback`(code→exchangeCodeForSession→홈), `payment/success`·`fail`(딥링크 폴백). 커밋 `b0622ae`.

### 카카오 로그인 활성화
- **결정**: `account_email` 필수 동의 설정으로 KOE205 해소 → 플래그 on. 일반 대중 공개는 카카오 검수·비즈앱(개업일 2026-08-03) 확인 후.
- **메모**: dev 라이브 검증 완료(동의→세션→홈 진입, 같은 이메일 자동연결). 커밋 `4cfad8f`.

### 결제 백엔드 dev 배포 + web-admin 프로덕션 배포
- **만든 것**: `pay-verify`·`toss-webhook` dev 배포(Claude), 마이그레이션 0051·0052 실행 + `TOSS_SECRET_KEY`·웹훅 URL 등록(사용자). web-admin prod 배포로 `pinut.org/payment/checkout` 라이브. eas `dev-pay` 프로필 추가(`5529818`).
- **메모/주의**: Vercel env 를 **Sensitive 타입**으로 넣으면 `NEXT_PUBLIC_` 이 브라우저 번들에 안 박힌다 → `--no-sensitive` 로 재등록해야 함(한참 헤맴). 키 자체는 정상이었음.

### 다음: dev-client 로 전환 (재빌드 루프 탈출)
- **결정**: 결제는 실기기에서만 검증되는데 수정마다 20분 재빌드는 비효율 → **dev-client 1회 빌드 후 `expo start` 로 JS 즉시 반영**하며 결제 완주를 잡기로.
- **메모**: `.env` 를 임시로 toss 로 전환해둠(`.env.premockbak` 백업, 테스트 종료 후 mock 복귀할 것). 대회 결제(Phase 2)는 결제 엔진 완주 검증 후 착수.

---

## 2026-07-21

### 코트 리뷰 (0050) — 별점+한줄평, 예약자만
- **결정**: 작성 자격 = 그 코트 예약자만(`has_reserved_court` 게이트). 플레이어 리뷰의 "같이 친 사람만"과 동일 신뢰 모델.
- **만든 것**: `court_reviews`+통계/작성자 뷰(0050), 자체 완결 컴포넌트 `src/components/court-reviews.tsx`(평균★·목록·별점 모달·신고/차단), `court/[id].tsx`에 2줄 삽입.
- **메모**: `court/[id].tsx`는 코덱스가 페이먼츠로 동시 수정 중 → 삽입 최소화. dev 게이트 라이브 검증(비예약자 안내 노출). 커밋 `4e3f6a1`. prod 0050 미실행.

### 커뮤니티 게시판 (0049) — 카테고리·사진·댓글·좋아요
- **결정**: 전체 공개 게시판(카테고리 5종). 6번째 탭 신설. 신고/차단은 기존 `ReportBlock`·`user_blocks` 재사용(애플 UGC 1.2 충족).
- **만든 것**: `community_posts/comments/post_likes`+counts 뷰(0049), 탭+목록(`(tabs)/community.tsx`), 글쓰기(`community/create.tsx`, 사진 5장), 상세(`community/[id].tsx`, 캐러셀·좋아요·댓글).
- **메모**: dev 실행 후 글쓰기·좋아요·댓글·목록 라이브 검증 완료. 커밋 `0619255`. prod 0049 미실행.

### 소셜 로그인 설정 완료 + 카카오 배선 검증 + 커밋/푸시 정리
- **결정**: 구글·애플 dev·prod provider 설정 완료→플래그 on. 카카오는 배선만 검증(개업일 2026-08-03 비즈앱 전환 후 활성화). main은 안정 포인터로 유지(v2.0 출시 때 병합).
- **만든 것**: 연결된 로그인 관리(`profile/connections.tsx`), 애플 client secret 생성기(`scripts/apple-secret.js`), 번개 코트검색·등록요청, 이벤트 팝업 관리자화. Manual Linking dev·prod on.
- **메모**: `pinut-v2.0-dev` 원격 푸시(11+2커밋), `hotfix/1.1.1-hide-social`·`v1.1.1` 태그 푸시(출시 1.1.1 보존). prod 마이그레이션 0043~0050 다음 빌드 직전 일괄 실행 필요.

---

## 2026-07-16

### 구글·애플 소셜 로그인 코드 연동 (플래그 게이트, 키는 콘솔 설정 대기)
- **결정**: 구글=기존 카카오와 같은 **브라우저 OAuth**(expo-web-browser) 재사용(iOS·An 공통). 애플=iOS 심사 안전하게 **네이티브 Sign in with Apple**(`expo-apple-authentication`) → identityToken을 `signInWithIdToken`으로 교환. 구글 넣으면 애플 4.8상 애플 로그인 동반 필수라 세트로. **플래그(false) 게이트**라 콘솔 설정 전엔 버튼 안 뜸(출시된 1.1.1에 깨진 버튼 안 나감).
- **만든 것**: `expo-apple-authentication` 설치, `app.json`(플러그인 + `ios.usesAppleSignIn`), `constants/features.ts`(GOOGLE/APPLE_LOGIN_ENABLED), `contexts/auth.tsx`(브라우저 OAuth 공통화 + signInWithGoogle/signInWithApple), `components/ui/apple-button.tsx`(iOS 전용 네이티브 버튼, 웹/An은 null), `sign-in.tsx`(애플 네이티브 버튼 + Google 버튼, 플래그·Platform 게이트). tsc·lint·**웹 export 통과**.
- **주의(사용자 콘솔 작업)**: ① Supabase Auth에 Google·Apple provider 설정 ② Google Cloud OAuth 클라이언트 + Supabase 콜백 URL ③ Apple Developer "Sign in with Apple" capability + Services ID/Key. 끝나면 features 플래그 true + **새 iOS/An 빌드**(네이티브 애플 모듈이라 Expo Go/웹 미검증). 카카오는 비즈앱 전환까지 계속 false.

### 이벤트 팝업 관리자화 — 하드코딩 → DB(등록·올리기/내리기·기간)
- **결정**: 코덱스가 만든 홈 이벤트 팝업의 **디자인은 그대로 두고**, 문구·노출 여부·기간만 DB에서 오도록 전환. 관리자 웹에서 등록/수정/올리기·내리기/기간설정/삭제.
- **DB (0047 — 실행 필요)**: `event_popups`(title·body·active·starts_at·ends_at·created_by) + RLS(조회 공개, 쓰기 super_admin만).
- **만든 것**: `src/components/event-popup.tsx`(활성+기간 내 팝업 1건 조회, "오늘 하루 보지 않기"를 **팝업 id별**로 저장 → 새 팝업은 이전 숨김 영향 없음), `web-admin/app/events/`(등록·수정·올리기/내리기·기간·삭제, 상태 뱃지 노출중/예정/종료/내림) + 헤더 '이벤트' 링크(super_admin). 타입 양쪽. tsc·lint 통과.
- **주의**: **0047 실행 + 관리자에서 팝업 등록·올리기 전까지 앱에 팝업이 안 뜬다**(하드코딩 문구 제거됨). 여러 개 활성 시 최근 생성 1건만 노출.

### 번개 장소 = 등록 코트 검색 + 자유입력 + 코트 등록 요청 (외부검색 없이)
- **결정**: 번개 만들 때 장소를 ① 등록 코트 검색(내부 courts) 우선 → 고르면 이름·지역 연결(court_id), ② 없으면 자유입력, ③ 검색에 없으면 "코트 등록 요청" → 운영자 승인 시 코트로 등록. **외부 검색 API(카카오/네이버) 안 씀** — 키·프록시·약관 회피, 코트 DB는 요청으로 유기적 성장. **번개 만들기 사진 업로드 제거**.
- **DB (0046 — 실행 필요)**: `meetups.court_id`(nullable FK→courts; schema.sql은 courts 뒤에서 FK 추가로 순서 이슈 회피) + `court_registration_requests`(요청자·이름·주소·지역·메모·상태·court_id) + RLS(본인/운영자 조회·본인 등록·코트관리자↑ 처리).
- **만든 것**: `src/components/court-picker.tsx`(검색 드롭다운, 타이핑=자유입력·탭=등록코트), `src/app/meetup/create.tsx`(사진 제거·CourtPicker·등록요청 모달·court_id 저장), `web-admin/app/court-requests/`(요청 목록→"코트로 등록"=courts 생성·연결/반려)+헤더 링크. 타입 양쪽. tsc·lint 통과.
- **주의**: 0046 dev·prod 실행 필요. 승인 시 코트는 name/region/address만 생성 → 좌표·상세는 코트 관리에서 보완.

### 번개 항상 승인제 + 플레이어 리뷰 시스템(같이 친 사람만, DUPR 표시)
- **결정**: ① 번개 참여를 **항상 호스트 승인제**로(클럽 0042와 동일, 토글 제거). ② **플레이어 리뷰** 신설 — 같이 친 사람만 작성(별점 1~5 + 한줄평), 호스트가 신청자 리뷰·DUPR을 확인한 뒤 승인.
- **DB (0045 — 실행 필요)**: `meetups.require_approval` 기본 true + 기존행 true. `player_reviews`(unique reviewer+reviewee, 수정 가능) + RLS(작성은 `have_played_together()` SECURITY DEFINER 게이트) + `player_reviews_with_reviewer`/`player_review_stats` 뷰. schema.sql 동기화.
- **만든 것**: `src/app/player/[id].tsx`(신규 — 프로필+DUPR+리뷰목록+리뷰작성 모달, `have_played_together` rpc로 자격 체크), `src/app/meetup/[id].tsx`(대기 신청자 행에 DUPR·리뷰요약 + 프로필 탭 이동, 참가자 행도 프로필 링크), `src/app/meetup/create.tsx`(승인 토글→안내문), `_layout.tsx`(player 라우트 등록), 타입(PlayerReview*·rpc·참가자 프로필에 dupr). tsc·lint 통과.
- **주의**: **0045를 dev·prod 실행** 필요. 실행 전엔 리뷰 쿼리가 빈 값으로 degrade(크래시 없음). 리뷰 작성은 같은 모임 승인 이력이 있어야 RLS 통과.

### 대회 사진 다중화 — 단일 image_url → images 배열(첫 장=커버 + 나머지 갤러리)
- **결정**: 대회 사진을 여러 장으로. 코트 사진 패턴처럼 `images text[]`, **첫 장이 메인 커버**, 나머지는 상세에서 넘겨봄. 어제 만든 단일 `image_url`(0043)을 대체.
- **DB (0044 — 실행 필요)**: `tournaments.images text[]` 추가 + 기존 image_url 이관 + `image_url` 드롭 + 뷰 재생성. `schema.sql` 동기화. **0044를 dev·prod 실행해야** web-admin 대회 생성(images insert)이 동작.
- **만든 것**: `web-admin/app/tournaments/new`(다중 업로드 썸네일 그리드 + "커버로 지정" + 대표 뱃지), `src/components/tournament-card.tsx`(images[0] 커버), `src/app/tournament/[id].tsx`(커버 200px + 썸네일 스트립 탭 전환 갤러리, `coverIdx` 상태), 타입 양쪽(`Tournament.images: string[]`).

### 홈 "다가오는 내 일정" UI 개선 — D-day 뱃지 + 종류별 색 + 빈 상태 카드
- **결정**: 밋밋하던 일정 카드를 예쁘게. ① 우측에 **D-day 뱃지**(오늘=그린 채움/내일/D-N) — 급한 일정 한눈에. ② 아이콘 배경을 **종류별 색**으로(대회=앰버, 번개=그린, 코트=블루). ③ 빈 상태를 회색 텍스트 → **점선 카드**(달력 아이콘+안내)로.
- **만든 것**: `src/app/(tabs)/index.tsx` — `UpcomingItem.dday`(로드 시 오늘 자정 기준 계산), `TYPE_META`(종류별 아이콘·색), `ddayLabel`, 일정 카드/빈 상태 렌더+스타일. tsc·lint 통과, 빈 상태 웹 프리뷰 확인(일정 있는 상태는 데이터 없어 미확인).

## 2026-07-15

### 대회 대표 사진 (커버) — 업로드 + 앱 대형 표시
- **결정**: 대회에도 사진 기능 추가. 클럽(0031)·번개(0034)와 동일 패턴 — 단일 `image_url` + 뷰 재생성 + `tournament-images` 스토리지 버킷. 앱에 **크게** 노출(상세 200px·카드 140px 커버).
- **DB (0043 — 실행 필요)**: `tournaments.image_url` 추가 + `tournaments_with_counts` 뷰 재생성(t.* 고정 이슈) + `tournament-images` 버킷/RLS. `schema.sql`도 동기화.
- **만든 것**: `web-admin/app/tournaments/new`(대회 사진 업로드 UI — new/ 경로 선업로드 후 insert에 image_url), `src/components/tournament-card.tsx`(상단 커버 140px), `src/app/tournament/[id].tsx`(정보탭 상단 커버 200px), 타입 양쪽(`Tournament.image_url`). 홈 "대회" 섹션은 TournamentCard 재사용이라 자동 반영.
- **주의**: **0043을 dev·prod 양쪽에 먼저 실행**해야 함 — 안 하면 web-admin 대회 생성 insert가 `image_url` 컬럼 없음으로 실패. 사진 없는 기존 대회는 커버 자동 숨김(안전).

### 홈 화면 개편 — 대회 섹션 추가 + 히어로/퀵액션 제거 + 헤더 "더 보기 →"
- **결정**: ① 히어로(검은 "오늘 참가 가능한 경기") 카드가 "다가오는 내 일정" 첫 항목을 그대로 중복 표시 → **히어로 + 퀵액션 통째 제거**, 홈을 콘텐츠로 바로 시작(밀도↑). ② 공용 `SectionHeader`의 "전체보기" → **"더 보기 →"**(arrow-forward) 로 통일. ③ **"모집 중인 대회" 섹션 신설**(제목 "대회").
- **모집 중인 대회 섹션**: `tournaments_with_counts`에서 `status='registration' + start_at>=now`, 가까운 날짜순 3개. **지역 필터 없이 전국**(대회는 빈도 낮고 원정 이벤트 → 지역 제한 시 늘 비어버림). 내가 신청한 대회는 "다가오는 내 일정"과 중복 제외. **비면 섹션 자체 숨김**. 카드는 대회 탭 `TournamentCard` 재사용.
- **만든 것**: `src/app/(tabs)/index.tsx`(섹션·헤더·쿼리 수정, QuickAction/hero 스타일 제거). tsc·lint·웹 프리뷰 라이브 확인.

### 안드로이드 R8 minify + 리소스 축소 (AAB 용량 최적화)
- **결정**: 릴리스 빌드에 **R8 minify**(`enableMinifyInReleaseBuilds`) + **미사용 리소스 축소**(`enableShrinkResourcesInReleaseBuilds`) 적용. 자바/코틀린 미사용 클래스·리소스 제거로 AAB/APK 용량↓(라이브러리 의존성 정리).
- **함정(중요)**: 빌드 설정의 단일 소스는 **`app.config.js`** 다. 이 동적 config가 app.json에서 `expo-build-properties`·naver 플러그인을 **필터로 제거하고 자기 버전으로 다시 추가**한다 → app.json에 build-properties 옵션을 넣어도 **전부 무시**됨(prebuild로 확인). 그래서 **app.config.js의 expo-build-properties**에 minify를 직접 넣어야 함.
- **만든 것**: `app.config.js`의 `expo-build-properties` 블록에 `enableMinifyInReleaseBuilds`/`enableShrinkResourcesInReleaseBuilds`/`extraProguardRules`(네이버 지도 keep 룰) 추가. prebuild로 gradle.properties·proguard 반영 검증 완료. (app.json은 무변경.)
- **주의**: R8은 **다음 프로덕션 빌드부터** 적용(현재 build 7 무관). 릴리스 후 실기기 스모크 테스트 필수 — 특히 **네이버 지도·푸시 알림·이미지 선택**(리플렉션 경로). 깨지면 keep 룰 확장.

## 2026-07-14

### 1.1.0 릴리스 — 대회 진행 방식 3종 + 클럽/번개 개선 + 부팅 크래시 수정 (대규모 패치)
- **결정**: 대규모 기능 패치라 1.0.5가 아닌 **1.1.0**으로 승격. `main`은 아직 미머지(pinut-v2.0-dev 42커밋 앞섬, FF 가능).
- **대회 진행 방식 3종 완성** (생성 시 선택, `tournaments.format`): ① **지금방식**=조별+토너먼트(기존) ② **KDK**=단식 개인 풀리그(조당 인원, buildGroups/standings 재사용, 본선 없음) ③ **단체전**=팀신청(팀명+유저검색)→관리자 승인→팀 예선리그→본선 토너먼트. 서브매치 스코어 입력·**득실 동률판정**, **오더 싸움**(주장 라인업 동시제출·블라인드 공개), **코트배정**(타이별)+타이 알림.
- **만든 것**: `src/components/team-*.tsx`(register/lineup/bracket-view), `web-admin/app/tournaments/[id]/team/`, `lib/team-bracket.ts`, `src/app/tournament/[id].tsx`(정보/참가/대진 탭 분리), `supabase/functions/notify-tie/`. 클럽 사진·가입승인(0031/0032), 번개 게스트비·참가승인·코트사진(0033/0034), 신청 알림 트리거 pg_net(0035), 부팅 무한로딩(onAuthStateChange 교착) 수정, 탭바 안드로이드 내비 가림 수정.
- **DB**: 마이그레이션 **0031~0041** 개발·운영 양쪽 실행·검증 완료. Edge Function `notify-turn`·`notify-tie` 운영·개발 배포·검증(200 응답).
- **빌드**: 버전 1.0.4→**1.1.0**, `v1.1.0` 태그. EAS 프로덕션: iOS build 5(완료), Android build 7(진행중). 커밋 42개+태그 원격 푸시.
- **메모/남은 것**: main 머지 결정 · 스토어 업로드(iOS `eas submit` / Android AAB) · 테스터 5명 더(15/20) · **버전게이트**(min_supported_version, 구버전 강제 업데이트 안내) 검토 · 미커밋 유지 중인 코덱스 파일(web-admin/landing, play-store PNG).

## 2026-07-10

### 운영/개발 DB 분리 완료 (#30)
- 새 Supabase **운영 프로젝트**(서울 리전, ref `jbvtdthtmrlndduqiikj`) 생성 → `schema.sql` 1회 세팅(테이블 11/11 + avatars·court-images 버킷 + RLS/트리거). **데이터 없는 클린 상태.**
- **운영 super_admin 부트스트랩**: signUp + SQL 승격 + 이메일확인 → 로그인·`my_role()`=super_admin 검증.
- `eas.json`의 **production만 운영 DB** 사용. development·preview·로컬·web-admin은 개발 DB(`pjfhxkvdjipvdmfsacie`) 유지.

### UI v2.0 전면 완성 (#35)
- 코덱스(디자인)가 토큰·공용 컴포넌트(`src/theme/*`, `app-*`) + 핵심 6화면(로그인·회원가입·홈·매칭·프로필·탭바).
- **Claude가 나머지 12화면 v2.0 적용** — 리스트4(클럽·대회·코트·내예약)·폼4(모임생성·클럽생성·프로필수정·설정안내)·상세4(모임·클럽·코트·대회). 코덱스 디자인 시스템 재사용 + **로직 100% 보존**(예약·연대관·결제·대진·복식파트너·차단필터 등). tsc/lint 0, 프리뷰 라이브 검증. 커밋 `fd895bf`~`544012b`.
- **앱 전체 디자인 일관** 확보 → 스크린샷·심사 언블록.

### 협업 체계 — 코덱스↔Claude
- **역할 경계**: 코덱스=디자인(`components/ui`·`theme`·화면 비주얼) / Claude=로직(`contexts`·`lib`·`supabase`·데이터). `pinut-v2.0` 계열 브랜치 공유. 소통 창구 `docs/HANDOFF.md`.
- **자동화**: `handoff` 스킬(세션 시작 시 HANDOFF 읽기 / 마무리 시 Claude→Codex 항목 쓰기) + **SessionStart 훅**(매 세션 시작에 HANDOFF 확인 리마인더 자동 주입). 커밋 `e0ed944`.
- 코덱스: 웹 랜딩 페이지(`web-admin/app/landing`) + i18n(ko/en) 추가. ⚠️ `web-admin/proxy.ts`는 Next 미들웨어로 동작하려면 `middleware.ts`여야 함(미수정, 알림만).

### main 통합 (전체 작업 반영)
- `main`이 갈라져 있어(원격 dev PR 3건) → 로컬 main을 원격 최신으로 ff → **`pinut-v2.0-dev`(전체 작업) 병합**(충돌 0) → push. 코덱스 랜딩 마무리까지 포함(`4e641ae`).
- 코드 외 산출물은 gitignore: 스크린샷 출력 폴더·`.codex/`·`.agents/`·`.next-dev.*.log`.

### 출시 준비 — 안드로이드 우선
- **v2.0 스크린샷 12장 재촬영**(puppeteer-core 헤드리스 크롬, 1290×2796). `Downloads/peanut-screenshots-final`.
- **Google Play 개발자 신원 인증 완료**(개인, 한글 이름).
- **안드로이드 프로덕션 AAB 빌드 시작**(EAS, `com.pinut.app`, versionCode→2, 운영 DB + 네이버 키). build id `40503615`.
- ⚠️ **개인 계정 비공개 테스트 의무**(테스터 20명·14일) 가능성 → 확인 필요. iOS는 이 의무 없음(멤버십 활성).

### 도메인
- 커스텀 도메인 **`pinut.kr`**(가비아) → Vercel 연결 예정(네임서버 `ns1/ns2.vercel-dns.com`). 웹은 web-admin/랜딩.

## 2026-07-09

### 번들ID 브랜드 통일 — `com.pickle.app` → `com.pinut.app`
- **왜**: 브랜드(피넛/PINUT) 통일. 출시 전이라 스토어 앱 미생성 → 지금이 바꿀 타이밍.
- **네이버 클라우드**: Maps Application 서비스환경에 `com.pinut.app`(iOS Bundle + Android 패키지) **등록 완료**(기존 `com.pickle.app`도 유지 — 개발 빌드 호환). Web 서비스 URL은 브라우저 지도 미사용이라 localhost 유지, 배포 후 도메인 추가 예정.
- **코드**: `app.json`의 `bundleIdentifier`·`package` → `com.pinut.app`. **slug·scheme는 `pickleball` 유지**(EAS 프로젝트 연결·딥링크 안정). AGENTS.md·APPSTORE.md 갱신. (EAS projectId·네이버 Client ID·env 값은 불변.)
- 로그인 로고도 앱 아이콘(땅콩) 이미지로 교체(`523e74d`).

### 안드로이드 실기기 — 네이버 지도 동작 확인 ✅
- EAS 개발 빌드로 실기기 설치 → 코트 목록/지도 토글·마커·마커 탭→예약까지 실동작 확인. `@mj-studio/react-native-naver-map`(네이티브 모듈)이 실기기에서 정상 렌더됨을 최종 검증(그동안 "빌드 후 확인 대기" 항목이었음).

### 진행 중 결정 스냅샷
- **UI v2.0 리팩터**(코덱스 디자인): 토큰·공용 컴포넌트·핵심 6화면 커밋(`78fb47a`). 나머지 12화면은 코덱스 진행 중. **v2.0 완성 후 스토어 제출** 결정.
- **애플 개발자 멤버십 활성화 완료** + EAS 로그인(`yoonsik2`) 확인 → iOS 빌드 인프라 준비됨(빌드는 v2.0 대기).
- **DUPR**: 파트너 회신(라이브 플랫폼이어야 승인) → 출시 후 재신청(초안 준비됨).
- **운영/개발 DB 분리 착수**(#30): production 빌드가 개발 DB를 가리키는 문제 발견 → 새 Supabase 운영 프로젝트(서울 리전) 생성 후 schema.sql 1회 세팅 예정. 협업 규칙·HANDOFF.md 운영(코덱스=디자인/나=로직, pinut-v2.0 공유).

## 2026-07-08

### UGC 신고·차단 (App Store 가이드라인 1.2 대응)
- **왜**: 애플 심사 1.2 — 사용자 생성 콘텐츠(번개모임/클럽)에는 신고·차단 수단이 필수.
- **DB** `0030_moderation.sql`(실행 완료): `user_blocks`(차단) + `reports`(신고) + RLS. 차단은 본인만 관리, 신고는 본인 등록·조회 + organizer↑ 조회·처리. `schema.sql`·양쪽 `types.ts` 동기화.
- **앱**: `report-block.tsx`(모임/클럽 상세 헤더 `⋯` → 신고[사유선택]·차단), `moderation.ts`(reportContent/blockUser/getBlockedIds), 매칭·클럽 목록에서 차단 사용자 콘텐츠 자동 숨김.
- **관리자 웹**: `/reports`(대기/전체 필터·처리·기각·되돌리기) + 헤더 '신고' 메뉴.
- **검증(실 DB)**: 신고 등록 / 차단 숨김 / organizer 조회·처리 / RLS 권한 격리(무관 플레이어 조회·처리 0건) 전부 PASS. (커밋 `fdbda3e`)

### App Store 제출 자료 준비
- **왜**: 금요일 안드로이드·iOS 동시 심사 제출 목표. Mac 없이 EAS로 iOS 빌드는 되나 실기기 설치는 Apple Developer($99/yr)+기기 UDID 등록 필요 정리.
- **문서** [docs/APPSTORE.md](APPSTORE.md): 스크린샷 기기 사이즈별 스펙(6.7"/6.5"/5.5" + iPad), 앱 설명·홍보문구, 연령등급 설문 답, 심사정보(로그인 계정·연락처), 개인정보처리방침 URL, 심사 제출 체크리스트. (커밋 `3694e13`)
- **남은 것(사용자)**: Apple Developer 등록, 빌드에서 스크린샷 추출, Android 콘솔 자료.

### 홈 개선 — 다가오는 일정 회전목마 · 추천 클럽 규칙 · 근처 모임 지역필터 · 반경 20km
- **다가오는 내 일정 회전목마**: 세로 나열 → 가로 카드 캐러셀(유형별 아이콘·라벨, 카드 폭 210). (커밋 `641b981`)
- **추천 클럽 노출 규칙**: 클럽 3개↑일 때는 **회원 10명↑만** 노출, **회원 많은 순 → 동수면 최근 생성순**, 최대 3개. (커밋 `7eb90fd`)
- **근처 추천 모임**: 임의 목록 → **내 지역(시/도 첫 토큰) 기준** 실제 지역 필터. (커밋 `a88fe02`)
- **코트 목록 반경**: 5km → **20km**(하드코딩 문구도 `RADIUS_KM` 참조로 통일). (커밋 `aa18af5`)

### 코트 예약 — 홈 통합·다듬기·지도개선·면별 예약
- **홈 '다가오는 내 일정' 통합**: 대회+번개모임+**코트예약** 시간순 상위 4개, 유형별 아이콘/색. (커밋 `c16a19e`)
- **다듬기 3종**: 지도 마커 탭→사진·정보 팝업, 시간 **연속선택**(시작·종료 탭), 홈 '내 예약' 바로가기. (커밋 `2aae33a`)
- **지도**: 5km 제한 해제(지도는 전체, 목록만 5km), **지역 검색 시 결과로 카메라 이동**(animateRegionTo). (커밋 `d6b787c`,`aba4baa`)
- **면(코트)별 예약** `0029`: `court_reservations`/`court_payments`에 `court_unit` + 유니크 `(코트,면,날짜,시각)`. 상세에 '코트 선택'(면·바닥 칩), 면별 독립 예약. 내 예약에 면 표시. 날짜/코트/시간 선택 순서·라벨 통일. **검증**: 1번면↔2번면 동시예약 OK·같은면 중복 차단·내예약 면표시. (커밋 `8f10ee0`,`162122f`)
- **DUPR**: 공개 API 없음→파트너 승인 필요. 신청 가이드 문서화([docs/DUPR.md](DUPR.md)), 사용자 메일 발송함. (커밋 `3751ed3`)
- **운영/개발 DB 분리**: 보류(개발 완료 후). schema.sql이 완전해 새 prod 프로젝트 1회 세팅 가능.

### 코트 사진(여러 장) + 예약 화면 다듬기
- **DB `0028`**: `courts.images`(URL 배열) + `court-images` Storage 버킷(공개 조회, 업로드 코트관리자/최고관리자). schema·타입 동기화.
- **관리자**: 코트 폼에 사진 다중 업로드(Storage)·썸네일·삭제. 첫 사진 대표.
- **선수앱**: 상세 상단 가로 사진 갤러리, 목록 카드 대표 썸네일(없으면 아이콘).
- **다듬기**: 예약 완료 후 '내 예약 보기' 이동 선택.
- **검증(라이브)**: 0028 실행 후 — 버킷 업로드(super_admin) 성공, 분당 데모 이미지 2장 → 상세 갤러리 2장·목록 썸네일·관리자 썸네일 2장 모두 로드 확인. (커밋 `8ef7abd`)

### 코트 예약 — 내 예약 화면 · 결제(PG) 스캐폴드 · 연대관
- **내 예약 화면**(`court/reservations.tsx`): 코트+날짜 그룹, 예정/지난 구분, 예약 취소. 코트목록 헤더 '내 예약' 진입. **예약창(상세)에서는 취소 조작 제거** — 예약된 슬롯은 표시만, 관리는 내 예약에서만. (커밋 `8d61893`)
- **결제(PG) 스캐폴드**(`0026`, `src/lib/payments.ts`, `functions/pay-verify`, `docs/PAYMENTS.md`): court_payments(주문)+reservations.payment_id. provider 추상화(mock=개발 자동성공 / portone=실 SDK 자리). 서버 검증 Edge Function 스켈레톤. 유료는 'N원 결제하기'. **실 PG는 사업자·통신판매업·PG계약+개발빌드 필요**(외부 PG 허용=애플/구글 IAP 아님). (커밋 `46c0464`)
- **expo-location 안전 로드**: 네이티브 모듈 없는 구 개발빌드에서 import 크래시(`Cannot find native module ExpoLocation`) → try/require 가드, 없으면 위치 없이 폴백. **네이티브 모듈 추가 시 개발빌드 재빌드 필요** 교훈. (커밋 `a78cdf1`)
- **연대관(정기 대관)**(`0027`): `court_blocks`(매주 요일+시간구간+대관자) + **enforce_court_block 트리거(서버 강제 차단)**. 관리자 코트수정에 연대관 추가/삭제. 선수앱은 연대관 시간 '대관' 표시·선택불가 — **자동 오픈일이어도 차단**. 라이브 검증: 트리거(목 19시 차단·18시 성공), UI(19·20시 대관). (커밋 `394f25d`)
- **마이그레이션**: 0027(연대관) 실행 확인. **0026(결제)은 실행 대기**(결제 흐름 테스트 시 필요). 0022·0023 제외.

### 코트 예약일 — 월별 달력 + 예약 가능일(수동) + 자동 오픈(롤링)
- **요구**: 날짜는 월별 달력에서 선택 · 운영자가 연 날짜만 사용자에게 노출 · "1주/2주/1개월씩" 자동 오픈(날짜 지나면 자동으로 다음날 열림). ("영업일" 아님 → **예약 가능일** 용어).
- **DB**: `0024_court_open_days.sql`(코트별 수동 오픈일 + RLS: owner/super만 쓰기), `0025_court_auto_open.sql`(`courts.auto_open_days` 롤링 기간). 둘 다 실행됨. schema.sql·타입 동기화.
- **자동 오픈(롤링)**: `auto_open_days=N`이면 **오늘~오늘+N-1**을 항상 자동 오픈 → 오늘 기준 계산이라 **크론 없이** 날짜 지나면 자동으로 다음날 열림. 관리자 select(안함/1주/2주/1개월).
- **달력 컴포넌트**: 모바일 `src/components/month-calendar.tsx`, 웹 `web-admin/components/month-calendar.tsx`(자동일=연초록 표시전용, 수동일=진초록 클릭토글). 예약 가능일 = **자동 윈도우 ∪ 수동 오픈일**.
- **선수앱 상세**: 7일칩 → 월별 달력. 예약 가능일만 활성, 가장 가까운 날 자동 선택, 없으면 안내+시간선택 숨김. 면/바닥·편의·레슨·거리도 표시.
- **검증(라이브)**: 분당 auto=7+수동(오늘+20). 모바일 달력 경계 정확(오늘~+6 활성, +7 비활성, 수동일 활성), 오늘 자동선택·시간선택 노출. 관리자 달력 자동(연초록)/수동(진초록)/추가가능(일반) 구분 정확. web/mobile tsc·lint 통과.
- **정리**: 0022(학교 크롤 시드)·0023(phone)은 예약 코트 성격과 불일치로 **제외/백아웃**.

### 코트 시설 확장 — 코트관리자 매핑 + 면별 바닥·편의시설·레슨
- **요구**: 등록은 최고관리자만 / 등록 코트를 **코트관리자에 매핑**(그 사람이 자기 코트만 수정) / **면 개수 + 면별 바닥**(면마다 다를 수 있음) / **편의시설**(샤워·주차 등) / 운영시간 / **레슨 가능** 표시.
- **DB `0021_court_facility.sql`**(실행됨): `courts`에 `court_units jsonb`([{name,surface}])·`amenities text[]`·`lessons bool`. **RLS 재정의** — 쓰기는 `super_admin 전체 / court_manager는 owner_id=본인 코트만`(이전엔 아무 court_manager나 전체 수정 가능했음). schema.sql 동기화.
- **관리자 웹**(`/courts` 전면 확장): 권한 분기(super=등록·소유자지정·삭제·전체 / court_manager=자기 코트 수정만, 헤더 메뉴도 노출). 담당 코트관리자 드롭다운, 면 번호생성/추가+면별 바닥 선택, 편의시설 토글(8종), 레슨 체크. 목록에 구성(N면·바닥)·편의(이모지)·레슨 뱃지·담당 표시. `court-meta.ts`(바닥/편의 상수, 웹·모바일 공유). (커밋 `123e549`)
- **선수앱 코트 상세**: 면/바닥·편의시설 칩·레슨 표시.
- **검증**: 저장(분당 3면 2하드+1우레탄·편의3·레슨·담당=코트관리자) → 목록/수정폼 반영 확인. **RLS 스크립트**: 코트관리자 자기 코트 수정 OK / 남의 코트 0행 차단 / 신규 insert 차단. web-admin·mobile tsc·lint 통과.

### 코트 지도 — 좌표 + 관리자 주소→좌표(네이버 지오코딩) **라이브**
- **방향**: 코트 예약 UI를 목록 → **지도에서 코트 선택**으로 전환. 지도 제공자 **네이버**, 위치 지정은 **주소→좌표 자동변환** 선택.
- **DB**: `0020_court_geo.sql` — `courts.latitude/longitude` + 부분 인덱스. **실행 완료**. (커밋 `5527a84`)
- **관리자 지오코딩**: `web-admin/app/api/geocode/route.ts` — 네이버 클라우드 Geocoding 프록시(서버 키). 코트 폼에 **"주소로 좌표 찾기"** + 위/경도 수동 보정, 목록에 위치(📍설정됨/미설정).
- **네이버 클라우드 키**: Maps Application 등록(Dynamic Map + Geocoding, 번들ID `com.pickle.app`). Geocoding 키를 `web-admin/.env.local`(NAVER_MAP_GEOCODE_ID/KEY, git 제외)에 설정 → **실동작 검증 완료**(예: 송파 올림픽로 424 → 37.52093,127.12296). 데모 코트 4개 실주소 지오코딩으로 좌표 갱신.
- **선수앱 네이버 지도(③) — 코드 완료**: `@mj-studio/react-native-naver-map` 2.9.0(새 아키텍처) + `expo-build-properties`(네이버 maven). 목록/지도 토글 → 지도에 코트 마커(캡션) → 탭하면 예약 화면. 플랫폼 분리(`court-map.native.tsx`=네이버 지도 / `court-map.tsx`=웹 폴백)로 **웹 번들 안 깨짐**(웹·iOS export 통과). `app.config.js`가 `client_id`를 `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID`(=지오코딩 Client ID, `.env` gitignore)로 주입 → git 미커밋. (커밋 `5d02615`)
  - **빌드 준비 완료**: `EXPO_PUBLIC_NAVER_MAP_CLIENT_ID`를 **EAS env(development·preview·production)** 에 등록(`eas env:create`, git 미커밋). 네이버 Application 서비스환경에 `com.pickle.app`(Android/iOS) **등록 확인**. → **안드로이드 개발 빌드 실행 중**(EAS build id `ea7e7972`, development 프로필). APK 나오면 실기기에서 지도 토글·마커 4개·마커 탭→예약 확인 예정.
- **푸시**: 코트 예약~지도 커밋 8개 원격 `dev` 반영(`ece4cbc..a752019`).
- **남은/다음 후보**: ① 실기기 지도 동작 확인(빌드 후) ② **내 예약 목록 화면**(현재 취소는 코트 상세에서만) ③ 코트 소유자(owner_id) 배정 UI ④ 결제 흐름(PG). 코트 지도 남은 Low(예약 UI): 다중 insert 부분충돌 안내, RLS select 타인 user_id 노출.

## 2026-07-07

### 코트 예약(코트 시설 예약) 1차 — 선수 예약 + 관리자 코트 등록
- **DB**: `0018_court_booking.sql` — `courts`(시설: 지역·주소·실내외·시간당요금·운영시간·소유자) + `court_reservations`(1시간 슬롯). RLS(조회 공개, 예약은 본인만, 코트 등록은 코트관리자/슈퍼관리자/소유자), 같은 코트·날짜·시각 **중복 예약 방지 유니크 인덱스**(부분 인덱스 where status='reserved'). 값 무결성 `0019_court_checks.sql`(hour 0~23·운영시간·요금 CHECK). — **둘 다 실행 완료**. (커밋 `9f66521`, `935031c`)
- **선수앱**: 홈 '코트 예약' 타일 → 코트 목록(지역·실내외·요금) → 상세(7일 날짜칩 + 운영시간 기반 시간슬롯 그리드). 다중 슬롯 선택→총액, 예약. **내 예약 슬롯 탭 시 취소**. 슬롯 상태: 가능/선택/예약됨/내 예약(accent)/지남.
- **관리자 웹**: 헤더 '코트' 메뉴(슈퍼관리자) → `/courts` 코트 CRUD(이름·지역·주소·실내외·요금·운영시간·소개). 등록/수정/삭제 + 목록 테이블. 여기 등록한 코트가 선수앱 예약 목록에 노출. (커밋 `22ae887`)
- **QA**: qa-pickle PARTIAL(6건) → High(라우트 미등록→헤더/뒤로가기)·Med(취소 부재·색 하드코딩)·Low(현재슬롯·DB제약) **수정 후 PASS**. 데모 코트 4개 시드(한강/올림픽공원/분당/송도). 예약 중복(본인·타인)·RLS(타인명의 차단) 스크립트 검증, 다크모드 테마색 확인. 남은 Low: 다중 insert 부분충돌 안내, RLS select의 타인 user_id 노출(프라이버시).
- **미착수(다음)**: 코트 소유자(owner_id) 지정 UI(코트관리자 배정), 내 예약 목록 화면, 네이버/카카오 지도 연동, 결제(PG).

### 대회 당일 운영 — 조추첨 공개·출전 신고·노쇼 처리
- **조추첨 공개(전날 19:00)**: 선수에겐 **시합 전날 오후 7시**부터 대진(예선/본선) 공개. 그 전엔 선수앱에 정보 탭(참가자)만 + "조추첨 M월 D일 오후 7시 공개" 안내. **운영자는 항상** 편성·수정(관리자 예선에 공개 시각 안내). 시각은 `start_at` 기준 전날 19시 자동 계산(컬럼 불필요). (커밋 `95f0607`)
- **출전 신고(당일 체크인)**: 노쇼 파악용. **대회 당일** 승인 선수가 선수앱 "출전 신고" → "출전 신고 완료". 관리자 신청현황에 **"✓ 출전" 뱃지 + 출전 N/M 집계**. DB `0017_checkin.sql`(`tournament_entries.checked_in_at`). (커밋 `95f0607`)
- **노쇼(불참) 처리**: 노쇼는 **다른 조에서 대체 승격 없이**, 그 팀만 빼고 같은 조 나머지끼리 경기. 관리자 신청현황에서 승인·미출전 선수 **"불참"** → 그 선수의 예선 경기만 삭제(예: 3팀 조에서 2번 불참 시 1v2·2v3 삭제 → **1v3만**). 진출은 `seedQualifiersBySize`가 실제 남은 조원 기준 재계산(2팀 조=전원). (커밋 `7ae2730`)
- **QA**: 테스트 대회를 임시로 오늘 날짜로 바꿔 선수앱 출전 신고→관리자 ✓출전 1/16 표시, 체크인 선수는 불참 버튼 숨김(15/16)까지 확인. 노쇼는 3팀 조 스크립트로 1v3만 남는 것 검증. 0013~0017 전부 실행 완료.

### 대회 리스트 정렬·그룹 + 관리자 페이징
- **대회 리스트(관리자·선수앱)**: **날짜순 + 월별 그룹 헤더**(`YYYY년 M월`)로 재구성. 선수앱은 `FlatList → SectionList`. 종료(취소) 대회는 **흐리게(opacity)** 표시해 진행/신청 대회와 구분. (커밋 `6f84f0f`, `e0deb87`)
- **페이징**: 감사로그·사용자 관리 페이지를 **20개씩 서버 페이징**(`range` + `exact count` + 이전/다음)으로. 사용자 검색은 현재 페이지만 걸리지 않게 **서버 사이드 `ilike`(전 페이지 검색, 250ms 디바운스)** 로 전환. (커밋 `3a08da8`, `4e25f78`)
- **왜**: 대회·로그·유저가 쌓여도 빠르게 뜨고, 진행 중 대회가 눈에 잘 띄게.

### 대회 참가 대기열(waitlist) + 대기 순번
- **한 것**: 정원(승인+대기중 합) 초과 신청은 자동 `waitlist`, 취소자 생기면 대기 맨 앞을 **자동 승격**. 화면에 **"대기 N번"**(신청순) 표시 — 선수앱·관리자 양쪽. 정원 차면 선수앱 버튼은 "대기 신청하기".
- **DB**: `0016_waitlist.sql` — 트리거 2개(`enforce_waitlist` BEFORE INSERT, `promote_waitlist` AFTER UPDATE/DELETE, SECURITY DEFINER). 실행·QA 완료(정원 2 대회로 초과→대기→취소→승격 검증). (커밋 `6ced93d`)
- **승인 방식**: 지금은 운영자 승인 유지 + 그 위에 대기열. 결제/알림톡/24h 자동취소는 미구현(설계만).

### 이름 검색 + 프로필 사진 (대회)
- **이름 검색**: 관리자(신청현황·예선·본선·코트배정)는 헤더 공용 검색창(컨텍스트, 탭 전환해도 유지), 선수앱은 대회 상세 상단 검색창. 예선은 검색 시 조 탭 무시하고 전체 조 탐색, 본선은 브래킷에서 일치 선수 **강조**. (커밋 `dbd707d`, `a3e7458`)
- **프로필 사진**: 예선·본선 경기 이름 옆 + 신청현황 로스터에 아바타. 관리자 웹엔 피넛 아바타 PNG 25장 이식(`public/avatars`) + 웹용 `avatarSrc`/`Avatar`(peanut:NN·업로드URL·닉시드 기본). (커밋 `d831d3e`, `4036d19`)

### 대회 엔진 완성 — 탭 구조·코트 운영·본선 풀브래킷
- **탭 구조**: 대회 관리(관리자)와 대회 상세(선수앱)를 **신청현황/정보 · 예선 · 본선 (· 코트배정)** 탭으로 분리, 예선은 **조별 서브탭**. 복식 정원은 "팀", 단식은 "명"으로 통일. (커밋 `b491c4d`, `a5f9bf8`, `5cdd175`, `6647638`, `089195d`)
- **코트 시스템**: 생성 시 코트 구성(번호/알파벳/직접, 실내·외) + **같은 장소면 지난 코트 자동 로딩**. 경기별 코트 배정 + **코트배정 탭**(예선/본선 서브탭, 우선순위 대기번호). 배정 규칙: **1코트 1경기(점유) · 같은 팀 동시출전 금지(선수 가용성) · 덜 진행한 조 우선 · 확정 버튼 · 경기 종료 시 대기 경기 자동 투입**. `0014_tournament_courts.sql`(코트 테이블+`matches.court_id`), `0015_match_court_confirmed.sql`(확정 플래그) 실행 완료. (커밋 `9f72c2a`~`238b714`, `92b2573`, `b49345e`)
- **본선**: 생성 시 **결승까지 전체 브래킷 골격**을 만들고 경기 완료 시 승자를 다음 라운드로 **자동 진출**(부전승 포함), 빈 자리는 "미정" 표시. **조 크기별 자동 진출**(2팀=전원·3팀=상위2·4팀=상위3), 대진 **중복 생성 방지 가드**. (커밋 `da785a2`, `c4fb8d2`)
- **버그**: 복식에서 파트너로 등록된 사람이 또 신청되던 중복참가 → `0013_no_double_entry.sql` 트리거 + 화면 방어. 파트너로 등록된 대회도 홈 "다가오는 내 일정"에 노출. (커밋 `3260ddc`)

### DB 클린 리셋 + 권한별 계정 (출시 준비)
- **한 것**: 출시 준비로 Supabase 데이터 전체 초기화(관리자 외 모든 유저·데이터 삭제) 후 권한별 계정 생성. **super_admin**(운영 슈퍼관리자, 개인 이메일), **organizer** `organizer@peanut.test`, **court_manager** `court@peanut.test`, **player** `player@peanut.test`. DB는 이 4계정 외 0건.
- **보안 메모**: 비밀번호·슈퍼관리자 개인 이메일은 **git에 커밋 안 함** — 로컬 메모리(`memory/pickleball-test-accounts.md`)에만 기록.

### 앱 아이콘 · 회원 탈퇴 (스토어 준비)
- **앱 아이콘**: 사용자 제공 "피넛=피클볼" 로고를 풀블리드 `icon.png` + 안드로이드 어댑티브(마크 투명 키아웃, 배경 `#163C33`)로 적용. 파비콘도 갱신. (커밋 `8409e7b`)
- **회원 탈퇴(계정 삭제)**: 스토어 필수. `0012_delete_account.sql`(SECURITY DEFINER RPC `delete_account`) + 프로필 화면 버튼·확인 다이얼로그. 임시계정 QA로 **프로필 삭제·데이터 cascade·재로그인 차단** 확인. (커밋 `f5e9c79`)
- **메모**: 심사 관점 — 코트예약 "곧 오픈" 플레이스홀더는 리젝 리스크(숨김 권장). 대회는 핵심 라이프사이클 완성, 부가기능(결제/대기열/알림톡/3·4위전/정원마감)은 업데이트로.

## 2026-07-03

### UI 리프레시 — 밝은 테마 · 홈 3대 진입 재설계 · 부팅 스플래시
- **테마**: 크림/베이지가 "무겁다" 피드백 → **밝은 화이트 배경(#FBFCFB) + 비비드 그린(#12B981) + 골드 포인트**로 교체 (라이트/다크, `constants/theme.ts`).
- **홈 재설계**(`(tabs)/index.tsx`): **대회 · 번개모임 · 코트예약(곧 오픈)** 3대 진입 타일 + 내 일정(모임+대회 통합) + 헤더 아바타. 시안(목업) 확인 후 구현.
- **부팅 스플래시**(`components/ui/boot-screen.tsx`): 초기화 중 **피넛 스포츠 일러스트 + "피넛"/for sports nuts + 인디터미네이트 로딩바**. 원본 이미지에서 하단 바/워드마크 크롭(`peanut-loading.png`). 네이티브 스플래시도 파랑→화이트+피넛(`splash-peanut.png`). 강제 렌더 스크린샷으로 확인. 모바일 tsc/lint ✅.

### 프로필 사진(아바타) — 피넛 25종 + 업로드 + 자동 배정
- **결정**: 사진 없으면 **닉네임 기반 피넛 캐릭터 자동 배정**, 프로필에서 25종 중 선택(`avatar_url='peanut:NN'`) 또는 **직접 업로드**.
- **만든 것**: 피넛 그리드 이미지를 원 중심 정렬로 슬라이스 → `assets/images/avatars/peanut-01~25.png`, `constants/avatars.ts`(선택/시드 헬퍼), `Avatar` 컴포넌트(원격/피넛선택/기본 폴백), 프로필 수정 UI(업로드+선택 그리드), `expo-image-picker`, Storage 버킷 `0011_avatars.sql`. 업로드 경로 라이브 검증(RLS 본인폴더·공개읽기 200) ✅.

### 카카오 로그인 버튼 보류
- **결정**: 카카오 이메일 동의는 비즈앱 승인 필요 → **출시 후 진행**. 지금은 로그인 화면에서 **카카오 버튼만 숨김**(`constants/features.ts`의 `KAKAO_LOGIN_ENABLED=false`). 코드·Supabase 연동은 유지, 승인되면 플래그 한 줄로 복구.

### 앱 브랜드: 피클 → 피넛(PEANUT)
- **결정**: 앱 표시명을 **"피넛(PEANUT)"** 으로. 가치 **Play·Engage·Achieve**, 슬로건 **"for sports nuts"**. 종목명 "피클볼"과 내부 식별자(slug/scheme/`com.pickle.app`)는 **유지**(빌드·스토어·딥링크 안정).
- **만든 것**: `app.json` name, 모바일 로그인 브랜드, web-admin 헤더/타이틀/로그인 문구 → 피넛. `AGENTS.md`에 브랜드 섹션 추가. (커밋 `4d988d4`)
- **열림**: 노션 페이지 제목들·`docs`·기본 닉네임 "피클러"는 아직 "피클".

### 카카오 로그인 Provider 설정 (진행) — account_email = 비즈앱 필요
- **한 것**: 카카오 앱 생성, **플랫폼 키 → REST API 키 → 리다이렉트 URI**에 Supabase 콜백 등록, Supabase **Kakao Provider Enable**(REST API키=Client ID + Client Secret), Supabase **URL Configuration**에 `localhost:8082` redirect 추가.
- **검증**: `/auth/v1/authorize?provider=kakao`가 `kauth.kakao.com`으로 정상 리다이렉트(client_id·redirect_uri OK) 확인. 그러나 로그인 시 **"설정하지 않은 동의 항목: account_email"** 에러.
- **원인/결론**: Supabase가 카카오에 **account_email 강제 요청**(scope에서 제거 불가 — 테스트로 확인). 카카오 account_email은 "권한 없음" → **개인 개발자 비즈앱 전환**(사업자 없이 가능, 개인정보처리방침 URL 필요, 심사)이 있어야 이메일까지 로그인 됨. 닉네임/프로필 동의항목만 켜도 이메일 강제 때문에 막힘.
- **개인정보처리방침**: 노션 초안 생성 + 사용자가 기존 공개본(`notion.site`) 보유 → 비즈앱 신청에 사용 예정.

### 휴대폰 번호 인증 — 보류
- **결정**: 본인인증(PASS)은 **사업자+본인확인기관 계약**, SMS OTP는 문자 비용/공급자 연동 필요 → MVP엔 과함. **결제 단계(사업자 트랙)** 에서 함께.

### todo 기능 대목별 재편 (우선순위)
- **결정**: 기능 대목(도메인)별로 완료/예정을 묶고 우선순위 지정. 순위 **회원·인증 → 대회 → 코트예약 → 커뮤니티매칭 → 클럽 → 커뮤니티게시판**, 나머지(실력·성장/알림/관리자·운영/수익화·상점/인프라)는 후처리.
- **만든 것**: 새 노션 페이지 "기능 대목별 Todo (우선순위)". (생성 시 제목이 "피클…" — 피넛으로 갱신 필요)

### 선수 앱 대진표 열람 + 내 경기 차례 푸시 알림
- **대진표(열람)**: 모바일 대회 상세에 **대진표 섹션** 추가 — 내 경기 하이라이트, **조 순위표**(승/득실차), 조별 경기 결과, **토너먼트는 좌→우 브래킷 트리**(`src/components/bracket-tree.tsx`, 연결선 엘보+우승 박스, 가로 스크롤, 계산기반 좌표). `src/lib/bracket.ts`(standings/groupMembers 읽기전용), `TournamentMatch` 타입/뷰 등록. **라이브 QA(QA 토너먼트)**: 조 순위(선수1 +9…)·11:8 결과·준결승→결승→🏆선수1 트리 정상 렌더 ✅.
- **푸시 알림(내 경기 차례)**: `expo-notifications`+`expo-device` 설치, `src/lib/notifications.ts`(권한요청+Expo 토큰), 로그인 시 `profiles.push_token` 저장(auth 컨텍스트), `0010_push_token.sql`. **발송**: `supabase/functions/notify-turn`(Edge Function, 주최자/슈퍼관리자만, 경기 선수+파트너 토큰으로 Expo 푸시), 관리자 대진에 **🔔 차례 알림** 버튼(예정 경기).
- **주의(사용자 필요)**: ① `0010_push_token.sql` 실행 ② `supabase functions deploy notify-turn` 배포 ③ **실기기 빌드**에서만 푸시 동작(Expo Go/웹 불가), Android는 FCM 자격 필요. tsconfig에 `supabase/functions` 제외(Deno). 모바일/web-admin tsc·lint ✅.

### 감사 로그(audit log) — DB 트리거 자동 기록
- **결정**: 승인/거절/개설/수정/권한변경 등 주요 행위를 **앱이 아니라 DB 트리거**로 자동 기록(우회·누락·위조 불가). 누가(actor_id/role)·무엇(action/entity)·언제(created_at)·어떻게(old→new jsonb).
- **만든 것**: `migrations/0009_audit.sql` — `audit_logs` 테이블 + `audit_trigger()`(SECURITY DEFINER) + `tournaments`/`tournament_entries`/`tournament_matches` 전(全) 이벤트 트리거 + `profiles` **역할 변경만** 트리거. RLS: 조회는 **슈퍼관리자만**, 쓰기 정책 없음(트리거만 기록 → 불변). schema.sql 반영. web-admin: `AuditLog` 타입, **`/audit` 뷰어**(행위 한글 라벨+상세 old→new), 헤더 "감사로그" 링크(super_admin). tsc/lint ✅.
- **주의**: **0009 실행 전엔 `/audit` 조회 실패**. 트리거는 실행 이후 발생 행위부터 기록(과거분 소급 없음).
- **라이브 QA(0009 실행 후)**: 선수 신청→`참가 신청`(행위자=선수/플레이어), 관리자 거절→`참가 거절 · 대기→거절`(행위자=데모유저/슈퍼관리자) 정확히 기록 확인 ✅.
- **참고**: 참가 거절 시 관리자 목록에서 숨김 처리도 이날 반영(`status !== 'rejected'` 필터).

### 복식 파트너 = 실제 회원 연결 (검색·선택 신청)
- **결정**: 복식 신청 시 파트너를 **이름으로 검색 → 조회된 회원 목록(동명이인 대비)에서 선택 → 신청**. 파트너는 실제 앱 회원과 연결(별도 수락 절차 없음).
- **만든 것**: `migrations/0008_partner.sql`(`tournament_entries.partner_id` FK→profiles, 인덱스), schema/types(모바일·web-admin) 갱신. 모바일 `tournament/[id].tsx`: 자유입력 파트너 필드 → **닉네임 검색 드롭다운(Pressable 선택)+선택 칩**, `apply()`에 `partner_id`+`partner_name`(스냅샷) 저장, 복식은 파트너 미선택 시 신청 차단. 참가자/관리자 표시는 `partner.nickname` 우선(없으면 `partner_name`).
- **주의**: profiles FK가 2개(user_id·partner_id)라 엔트리 조회 embed를 **FK명으로 명시**(`profiles!..._user_id_fkey`, `partner:profiles!..._partner_id_fkey`) — **0008 실행 전에는 대회 상세(앱·관리자) 참가자 조회가 실패**함. 검증: 모바일 tsc/lint ✅, web-admin tsc/lint ✅.
- **라이브 QA(0008 적용 후, 모바일 웹)**: 이름 입력 시 회원 **리스트업**(송파선수→1~5) ✅, **없는 회원**은 "가입되지 않은 회원" 안내+목록없음 ✅, 파트너 미선택 신청 시 **DB 미삽입(차단)** ✅. 관리자 승인 목록에도 `신청자/파트너` 표기 추가. **수정**: `keyboardShouldPersistTaps="handled"`(실기기에서 드롭다운 탭이 키보드만 닫던 버그), 없는 회원 문구 개선.
- **참고**: 사용자가 "리스트업 안 됨/없는 사람인데 신청됨" 보고 → 현재 코드엔 없는 동작(구 빌드/캐시로 추정). 폰은 재빌드, 웹은 강력 새로고침 필요.
- **열림**: 관리자 웹에서도 운영자가 참가자 추가 시 파트너 선택 UI(현재 미적용), 정원 카운트를 팀 단위로 볼지.

### 모바일 대회 목록 — 단식/복식 필터 탭
- **결정**: 대회가 단식인지 복식인지 한눈에 구분되도록 목록 상단에 **전체/단식/복식 세그먼트 탭** 추가. 필터는 제목이 아니라 **실제 `discipline` 값**으로 거름.
- **만든 것**: `(tabs)/tournaments.tsx` 세그먼트 필터(클라이언트 필터링, 빈 상태 문구도 필터 반영). 라이브 QA: 복식 탭 → 실제 복식 대회만 노출(제목만 복식인 "송파"는 단식이라 제외됨) ✅. 모바일 tsc/lint ✅.
- **메모**: 파트너는 "무조건 앱 회원" 요구 확정 — 검색 목록에서 선택만 허용(임의 입력 불가, 미선택 시 신청 차단)로 이미 충족.

### 관리자 웹 — 슈퍼관리자 전체 대회 열람 / 헤더 "피클"
- 슈퍼관리자는 `organizer_id` 필터 없이 **전체 대회** 조회(그 외는 본인 개설분). 헤더·타이틀 "피클 대회 관리자" → **"피클"**.

## 2026-07-02

### 모바일 대회 참가 화면 (선수 신청)
- **결정**: 선수가 앱에서 대회를 보고 신청하도록 **대회 탭 신설**(홈·매칭·클럽·**대회**·내정보 5탭). 조/대진 열람은 추후, 이번엔 신청 흐름 우선.
- **만든 것**: `(tabs)/tournaments.tsx`(목록), `tournament/[id].tsx`(정보+참가자+**참가 신청/취소**, 복식 파트너 입력), `components/tournament-card.tsx`, 탭/라우트 등록. 라이브 QA: player 계정으로 신청 → "승인 대기중" 확인.
- **메모**: 신청 RLS(entries_insert_self) 통과, 승인은 관리자 웹에서. 검증 모바일 tsc/lint ✅.

### 대회 설정 강화 (단식/복식 · 조/본선/바이) + 진행 엔진 라이브 QA
- **결정**: 운영자가 참가자 수 보고 **조당 인원**(→조 개수 자동)·**본선 진출 인원(총, →몇 강)**·**조별리그 생략(바로 본선)** 을 정하고, 바이는 상위 시드 자동. **단식/복식**(discipline) 지원(복식은 파트너 표시).
- **만든 것**: `migrations/0007`(discipline + 뷰 재생성), bracket `seedQualifiersTotal`/`groupCountForSize`, 대회 상세 컨트롤·복식 표시, 생성폼 종목 선택. 앞선 **조별→4강→결승 시나리오 QA는 8명으로 PASS**(우승 선수1).
- **메모**: 조/본선 컨트롤은 0007 없이도 동작. 단식/복식만 0007 필요. 검증 모바일/web-admin tsc·lint·build ✅. 진행 중 뷰-미갱신 버그(High) 발견·수정(0006/0007에 뷰 재생성 포함).

## 2026-07-01

### 대회 진행 엔진 (조별리그 → 토너먼트)
- **결정**: "풀 엔진(설정 가능)" — 주최자가 조 개수·조별 진출 인원을 정하고, 조별 라운드로빈 → 순위 → 시드 진출 → 단판 토너먼트(준결승/결승) → 우승.
- **만든 것**: DB `tournament_matches`(조별/토너먼트·점수·승자) + tournaments 설정 컬럼(`migrations/0006`). `web-admin/lib/bracket.ts`(조편성·순위·시드·페어링), 대회 상세에 조별리그(순위표+점수입력)·토너먼트 라운드·"다음 라운드 생성"·🏆 우승 UI. 부전승 자동 처리.
- **메모**: 검증 모바일 tsc·web-admin tsc/lint/build ✅. 실동작 QA는 0006 실행 후(조별→4강→결승 시나리오).

### 권한(역할) 체계 1단계
- **결정**: 단일 role 계층(`player<organizer<court_manager<super_admin`), 부여는 super_admin만(신청·승인 없음). 코트관리자의 코트 권한은 코트 기능 때 연결.
- **만든 것**: DB `profiles.role` + `my_role()`(security definer) + super_admin 업데이트 정책 + **자기 role 변경 차단 트리거**(권한상승 방지) + 대회 insert를 organizer↑로 제한 (`migrations/0005`). web-admin: `useRole`·`Protected` 역할 게이트(player 차단)·`/users` 사용자관리(역할 변경)·헤더 링크. 모바일/웹 타입에 role.
- **메모**: 0005 실행 후 **최초 super_admin은 DB로 부트스트랩** 필요(닭-달걀). 검증: 모바일 tsc·web-admin tsc/lint/build ✅. 실동작 QA는 부트스트랩 후.

### 권한 체계 백로그 + 오늘 마무리
- **결정**: 관리자 권한 분리는 현재 "만든 사람=운영자"(RLS: 남의 대회 못 건드림)까지만. **지정 관리자 게이트(모델 B: `profiles.role`)** 는 백로그로 넣고 다음에 착수. 오늘 세션은 여기서 마무리.
- **진행 중**: `qa-pickle` 로 관리자 웹 "대회 개설 → 참가 승인" QA 백그라운드 실행. 결과는 `qa-report` 로 노션 QA 페이지에 누적 예정.
- **메모**: 노션 로드맵에 대회(관리자 웹 1단계) 완료 + 권한 체계(모델 B) 반영. 미커밋 변경 있음(대회 DB·web-admin).

### 대회 1단계 — DB + Next.js 관리자 웹
- **결정**: 대회 운영 화면은 사용자 요청대로 **별도 Next.js 웹앱**(`web-admin/`)으로, 단 **Supabase 백엔드는 모바일과 공유**. 권한은 "대회 만든 사람 = 그 대회 운영자"(RLS)로 시작 — 플랫폼 관리자 체계는 나중.
- **만든 것**: DB `tournaments`,`tournament_entries`,뷰 `tournaments_with_counts`(RLS: 조회 공개/주최자 관리, 참가신청 본인, 승인 주최자) + `migrations/0004_tournaments.sql` + 타입(양쪽). `web-admin` Next.js16(App Router, Tailwind, 클라이언트 Supabase 인증): 로그인/대회 목록/생성/상세(참가 승인·거절, 대회 상태 변경). 라이트 테마 고정.
- **메모**: `.env.local`에 공유 Supabase 공개키. 검증: web-admin tsc·`next build`·로그인/목록 프리뷰 OK. 대회 실제 동작은 0004 실행 후.

### QA 리포트 노션 누적 스킬(qa-report)
- **결정**: QA를 실행하는 것(`qa-pickle` 에이전트)과 결과를 노션에 기록·정리하는 것을 분리 — 기록/정리 전담 `qa-report` 스킬 신설. "피클 — QA 리포트 & 이슈" 페이지에 계속 누적하고, 요청 시 요약·중복제거·해결처리로 한 번에 정리.
- **만든 것**: `.claude/skills/qa-report/SKILL.md`. 노션 로드맵 갱신.
- **메모**: 노션 MCP 커넥터가 **현재 세션엔 연결돼 있지 않음**(이번 세션에서 재확인, `/mcp`도 이 환경에선 비활성) → 실제 노션 쓰기는 커넥터 재연결 후 가능. 그전까지 `docs/WORKLOG.md`가 원본.

### 로딩 오버레이(회전 피클볼)
- **결정**: 로그인·회원가입·모임/클럽 생성 등 비동기 대기 중 전역 로딩 표시를 통일. 회전하는 피클볼 아이콘 팝업으로.
- **만든 것**: `src/components/ui/loading-overlay.tsx`, 전역 컨텍스트 `src/contexts/loading.tsx`(useLoading). `src/app/_layout.tsx`에 Provider+오버레이 연결, 로그인/회원가입/`meetup/create`·`club/create`에서 호출.

### 노션 연동 + 로드맵 확장(코트예약·대회·관리자)
- **결정**: 노션 커넥터 연결 완료(Yoon Sik Shin 워크스페이스). 로드맵에 대형 에픽 추가 — ① 코트 예약(사용자) + 네이버 지도 + 결제, ② 대회(관리자 개설·운영 / 사용자 참여 / 내 차례 카카오톡 알림톡), ③ 웹 관리자 페이지(별도 웹앱).
- **만든 것**: 노션 "피클 — 기능 현황 & 로드맵" 페이지(완료 기능 + 할 일 체크리스트) 생성·갱신.
- **메모**: 카카오톡 차례 알림 = 카카오 알림톡(비즈니스 채널+템플릿 심사, 유료). 네이버 지도 = Naver Maps API 키 필요. 관리자 웹은 별도 서피스(Next.js 등) 검토.

### QA 에이전트 · 워크로그 스킬 · 노션 확인
- **결정**: 기능마다 QA는 서브에이전트(`qa-pickle`)로, 대화·결정 로깅은 `worklog` 스킬로 분리. 노션은 현재 세션에 커넥터가 없어 사용자가 Claude Connectors에서 추가해야 함.
- **만든 것**: `.claude/agents/qa-pickle.md`(정적검증+diff리뷰+프리뷰 동작확인 리포트), `.claude/skills/worklog/SKILL.md`, `docs/WORKLOG.md`.
- **메모**: 노션 연결되면 이 파일을 노션 페이지로 미러링 예정.

### 탭 의미 재편 + 클럽 기능 신설
- **결정**: 사용자 의도 반영 — `매칭` 탭 = 번개 모임(기존 '모임' 내용), `클럽` 탭 = 동호회(신규). 실력별 "플레이어 추천(사람 찾기)"은 불필요로 판단해 제거.
- **만든 것**: 탭 = 홈·매칭·클럽·내정보. 클럽 DB(`clubs`,`club_members`,뷰 `clubs_with_counts`, 트리거/RLS) + `migrations/0003_clubs.sql` + 타입. 화면 `(tabs)/clubs.tsx`·`club/create.tsx`·`club/[id].tsx`, `components/club-card.tsx`. 홈은 "추천 플레이어"→"추천 클럽"으로 교체.
- **메모**: 프리뷰 서버와 typed-routes 자동생성 파일 충돌로 `.expo/types/router.d.ts` 손상 → 삭제 후 재생성으로 해결.

### 홈(메인) 화면 신설
- **결정**: 로그인 첫 진입점을 요약 허브로. 설계도 승인 후 구현.
- **만든 것**: `(tabs)/index.tsx` 홈(인사/다가오는 내 모임/빠른 실행/추천 모임/추천 클럽). 기존 피드는 별도 탭으로 이동.

### 안드로이드 개발 빌드(EAS) 준비
- **결정**: Expo Go가 SDK 56 미지원("incompatible")이라 실기기는 **개발 빌드**로 간다. 안드로이드 우선.
- **만든 것**: `expo-dev-client` 설치, `eas.json`(dev/preview/prod, EXPO_PUBLIC 값 주입), `app.json`에 `com.pickle.app`.
- **메모**: EAS는 `.env`를 업로드 안 하므로 공개키를 eas.json env에 넣어 자동 주입. dev 빌드 설치 후 `expo start --dev-client`로 실시간 개발 가능.

### 카카오 로그인
- **결정**: 한국 앱 필수. Supabase 기본 Kakao Provider 사용(PKCE). DUPR처럼 파트너 승인 필요 없음.
- **만든 것**: `contexts/auth.tsx`의 `signInWithKakao`(웹=리다이렉트/네이티브=WebBrowser+code교환), `components/ui/kakao-button.tsx`, 로그인 화면 버튼, 소셜 닉네임용 트리거 보완(`0002`).
- **메모**: 카카오 개발자 Redirect URI = `https://<ref>.supabase.co/auth/v1/callback`. 이메일은 비즈앱 필요할 수 있어 닉네임 기반으로.

### DUPR 연동 대비
- **결정**: DUPR API는 파트너 승인제(공개 셀프서비스 아님, 가격 비공개). 지금은 자가입력, 구조만 미리 마련.
- **만든 것**: `profiles`에 `dupr_id`/`dupr_rating`/`dupr_verified`(`0001`) + 프로필 편집/표시.

### 프로젝트 세팅 + MVP
- **결정**: 스택 Expo(SDK56)+expo-router+Supabase, MVP는 커뮤니티 매칭. 모바일 타깃, 한국어 UI.
- **만든 것**: 인증(이메일)·프로필(DUPR 스타일 실력)·번개 모임(피드/생성/상세/참가)·매칭. DB `schema.sql`(RLS/트리거/뷰). AGENTS.md 관례, 프로젝트 스킬(add-screen/add-supabase-table/run-app).
- **메모**: Supabase 타입은 `type`만(interface 금지) — GenericTable 제약. 초기 PGRST205는 테이블 미생성이 원인(스키마 실행으로 해결).
