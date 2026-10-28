# 피넛 🥜 — 피클볼 슈퍼앱

> **PEANUT** — **P**lay · **E**ngage · **A**chieve
> 슬로건: _for sports nuts_ — 스포츠에 진심인 사람들을 위해

번개 모임 매칭부터 클럽 운영, 코트 예약·결제, 대회 진행, **DUPR 공식 레이팅 연동**, 참여 이벤트(챌린지)까지 담은 피클볼 슈퍼앱입니다.
**Expo (React Native) + Supabase** 모바일 앱과, 운영을 위한 **Next.js 관리자 웹**으로 구성됩니다.
(코드 기준 모바일 **v4.1.0** · 2026-10-13 현재 App Store 공개 버전은 4.0.0)

이 저장소는 두 개의 앱을 담습니다.

| 앱 | 위치 | 스택 | 대상 |
| --- | --- | --- | --- |
| 📱 모바일 앱 | 저장소 루트 | Expo SDK 56 · React Native · expo-router | 일반 사용자 |
| 🖥️ 관리자 웹 | [`web-admin/`](web-admin/) | Next.js 16 · React 19 · Tailwind | 운영자/코트 관리자/대회 주최자 |

두 앱은 **같은 Supabase 프로젝트(DB·Auth·Edge Functions)** 를 공유합니다.

---

## 기능 (현재)

### 📱 모바일 앱 — 하단 탭: 홈 · 모임 · 코트 · 커뮤니티 · 전체
| 영역 | 내용 |
| --- | --- |
| 🔐 인증 | 이메일 · **카카오 · 구글 · 애플** 로그인, **전화번호 온보딩**(로그인 방식과 무관하게 1회 수집), 연결된 로그인 관리, 회원 탈퇴 |
| 🏠 홈 | 다가오는 내 일정(모임·대회·예약) · 코트 예약 바로가기 · 추천 모임/클럽 · 모집 중 대회 · **내 클럽 공지** · **이벤트(챌린지) 카드** · 호스트용 "완료 처리할 모임" · 이벤트 팝업 |
| ⚡ 모임(번개) | **일반/DUPR 매치 탭 분리**, 모임 생성(단식·복식·자유, DUPR 인증/DUPR+ 조건), 참가 승인·게스트비, 경기 기록(방 형태 따라 단·복식, 최종 점검 모달 → **DUPR 서버 등록**), 기록 완료 시 목록에서 자동 숨김, 수정·삭제는 운영자 요청 흐름, **모임 완료 처리**(시작 뒤 호스트가 참석/불참을 확정 — 확정 뒤 정정은 운영자만) |
| 🎯 이벤트(챌린지) | 번개 참석 횟수로 달성하는 이벤트(예: **피넛 10매치 챌린지**). **인스타그램 아이디를 등록해 참여 신청**한 사람만, 신청 뒤 완료 처리된 참석만 인정. 진행률·날짜별 인정 내역·불인정 사유 표시. 횟수는 서버가 출석 기록에서 매번 계산하고, 시작·종료·노출은 서버 설정이라 **앱 업데이트 없이** 운영 |
| 🏟️ 코트 | 네이버 지도 검색, 시간제 예약, **토스페이먼츠 결제**, 코트별 단계형 환불 정책, 내 예약 관리·취소 환불 |
| 👥 클럽 | 개설·수정·가입 승인·임원 임명, **프리미엄 구독(토스 자동결제)** + 플랜 관리 화면(체험·구독·해지) — 게시판(공지·댓글, 홈 노출) · **정기모임**(참석 투표 → 아메리카노 대진(단식/복식) → 점수 → 순위, 모임/대진/순위 탭, **선수 DUPR 인증 뱃지** + DUPR 일괄 등록) · 월례대회(추후 오픈) · 프리미엄 플러스 + **회비 자동결제**(구현 완료, 스위치로 숨김 — 아래 "기능 스위치") |
| 🏆 대회 | 공개 대회 목록(**필터 모달: 종목·연도·월**, 최신 일정 순, 클럽 월례대회 제외), 참가 신청·복식 파트너 검색, **참가비 결제(토스)**, 내 현황 카드, 대진표(조 순위 + 브래킷), 내 차례 푸시, 출전 확인은 운영자가 처리, 결승 확정 시 자동 종료 |
| 🏅 DUPR | **공식 파트너 연동(운영 키)** — SSO 계정 연결/해제, 단·복식 레이팅 + 추이 그래프, RATING 웹훅 자동 반영, DUPR 인증 모임·대회 게이팅(DUPR+ 는 Premium+Verified 만) |
| 💬 커뮤니티 | 카테고리 게시판(글·댓글) |
| 👤 내 정보 | 프로필·피넛 아바타 25종/업로드, DUPR 레이팅 카드·그래프, 자격 칩 |
| ⋯ 기타 | 알림함, 푸시(iOS APNs · Android FCM), 고객지원(분쟁 접수), 사업자 정보 표기, 업데이트 안내(스토어 버전 확인) · 강제 업데이트 게이트 |

### 🖥️ 관리자 웹 (web-admin)
- **대회 개설·운영** — 진행 방식 3종: 조별+토너먼트 / KDK 개인전 / 단체전(오더 동시제출·서브매치), 점수 입력·자동 진행, 코트 배정 탭, 참가비 결제 현황, 출전 확인, DUPR+ 대회 설정
- **챌린지(이벤트) 관리** — 기간·목표·하루 한도·완료 유예·종료 후 노출 일수 설정과 켜기/끄기, 참여 현황(인스타그램 아이디·신청 시각, 검색·정렬·달성자 필터·CSV), 사용자별 인정 내역, 완료·출석·완료 시각·참여 신청 정정
- **이벤트 팝업 관리** — 앱 홈에 띄우는 팝업(이미지·기간)
- **코트 관리** — 코트 등록·운영시간·가격·**환불 정책(단계형)**, 예약/결제 현황, 코트 등록 요청 처리
- **경기 요청 처리** — 사용자가 요청한 기록 수정·삭제를 운영자가 실행(DUPR 재등록/삭제 연동)
- **역할 기반 접근** — `player < organizer < court_manager < super_admin`
- **감사 로그** — 시간·행위자·역할·행위별 검색 필터
- **사용자 관리 · 신고 처리 · 랜딩/환불정책 페이지**

### ⚡ Edge Functions (Supabase)
`dupr-verify`(SSO 연결·해제·자격 동기화) · `dupr-match`(경기 등록/수정/삭제) · `dupr-webhook`(RATING 수신) · `toss-confirm`/`toss-cancel`(코트·대회 참가비 결제·환불) · `toss-billing-issue`/`change-plan`/`charge`/`cancel`(클럽 구독 — `charge` 는 정기 작업용) · `club-dues-enroll`/`card`/`pay-now`/`charge`/`refund`(클럽 회비 자동결제 — `charge` 는 정기 작업용) · `notify-turn`/`notify-tie`(대회 푸시)

번개 완료 처리와 챌린지는 Edge Function 없이 **DB 함수**(`meetup_complete`, `challenge_join`, `challenge_progress` 등)로 동작합니다.

---

## 빠른 시작

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 실행
   - 테이블·RLS·트리거·뷰가 한 번에 생성됩니다. 기존 DB는 [`supabase/migrations/`](supabase/migrations/) 를 번호순(`0001`~`0099`)으로 실행하세요.
3. **Authentication → Providers** — Email 활성화, 소셜(카카오·구글·애플)은 각 콘솔에서 리다이렉트 URI `https://<ref>.supabase.co/auth/v1/callback` 등록 후 키 입력
4. **Edge Functions 배포** (DUPR·결제·알림 사용 시):
   ```bash
   npx supabase functions deploy dupr-verify dupr-match toss-confirm toss-cancel toss-billing-issue toss-billing-change-plan toss-billing-cancel club-dues-enroll club-dues-card club-dues-pay-now club-dues-refund notify-turn notify-tie
   ```
   ```bash
   npx supabase functions deploy dupr-webhook toss-billing-charge club-dues-charge --no-verify-jwt
   ```
   두 번째 줄은 외부 웹훅·정기 작업이 부르는 함수라 JWT 검증 없이 배포합니다(함수 안에서 자체 비밀값으로 확인).
   시크릿(값은 각 콘솔에서 발급): `DUPR_CLIENT_KEY/SECRET/API_BASE/SSO_BASE/PUBLIC_BASE/WEBHOOK_SECRET`, `TOSS_SECRET_KEY` 등
5. 최초 **super_admin** 지정:
   ```sql
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'YOUR@EMAIL');
   ```
6. **Project Settings → API** 에서 `URL` 과 `anon public` 키 복사

### 2. 모바일 앱 실행
프로젝트 루트 `.env` ([`.env.example`](.env.example) 참고):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
EXPO_PUBLIC_NAVER_MAP_CLIENT_ID=...        # 코트 지도
EXPO_PUBLIC_TOSS_CLIENT_KEY=...            # 결제 (테스트 키 가능)
```
```bash
npm install        # 최초 1회
npm start          # Metro 개발 서버
```
- Expo SDK 56 은 Expo Go 와 호환되지 않으므로 실기기는 **개발 빌드**로: `eas build -p android --profile development` → `npx expo start --dev-client`
- `.env` 가 비어 있으면 앱에 설정 안내 화면이 표시됩니다.

### 3. 관리자 웹 실행
`web-admin/.env.local` 에 **같은 Supabase 프로젝트** 키:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```
```bash
cd web-admin
npm install
npm run dev        # http://localhost:3000
```
배포는 `web-admin/` 폴더에서 `npx vercel --prod` (루트 아님).

### 4. 검증
```bash
npx tsc --noEmit     # 타입 체크
npx expo lint        # 린트
```
스토어 빌드는 `eas build --platform all --profile production` (빌드 번호는 EAS 가 자동으로 올립니다. 버전은 `app.json` 의 `version`).

---

## 기능 스위치

| 스위치 | 위치 | 지금 |
| --- | --- | --- |
| 소셜 로그인(카카오·구글·애플) | `src/constants/features.ts` | 켜짐 |
| 클럽 프리미엄 구독 결제 `CLUB_SUBSCRIPTION_ENABLED` | `src/constants/features.ts` | 켜짐 |
| 프리미엄 플러스 `CLUB_PLUS_ENABLED` · 클럽 회비 `CLUB_DUES_ENABLED` | `src/constants/features.ts` (+ 서버 `club_plans.active`, `platform_billing_settings.dues_enabled`) | **꺼짐** — 출시 조건(토스 지급대행 계약 등)이 갖춰지면 앱·서버를 함께 켭니다 |
| 챌린지(이벤트) | 서버 `challenges` 표(관리자 웹 `/challenges`) | 서버에서 만들고 켜면 앱에 나타나고, 종료 뒤 노출 일수가 지나면 저절로 사라집니다 |

## 운영 반영 순서

스키마가 바뀐 릴리스는 **DB → Edge Functions → 관리자 웹 → 앱** 순서로 반영합니다(앱이 먼저 나가면 없는 표·함수를 부릅니다).
운영 DB 에 실행할 SQL 은 마이그레이션마다 [`docs/`](docs/) 의 `PROD_APPLY_NNNN.sql` 로 정리해 둡니다(머리말에 내용·영향·확인 쿼리). 작업 기록은 [`docs/WORKLOG.md`](docs/WORKLOG.md).

---

## 프로젝트 구조

```
src/                              # 📱 모바일 앱 (Expo)
├── app/                          # expo-router 파일 기반 라우팅
│   ├── _layout.tsx               # 루트: Provider + 인증 가드 + 결제 딥링크 복귀
│   ├── (auth)/                   # 비로그인: sign-in / sign-up
│   ├── onboarding/phone.tsx      # 전화번호 온보딩
│   ├── (tabs)/                   # 하단 탭: index(홈)·matches(모임)·court(코트)·community·more(전체)
│   │                             #  + clubs·tournaments·profile (전체 메뉴 경유)
│   ├── meetup/                   # 모임 생성·상세·경기 기록(record)·완료 처리(complete)
│   ├── challenge/[id].tsx        # 이벤트(챌린지) 상세 — 참여 신청·진행률·인정 내역
│   ├── club/                     # 상세·만들기·수정·게시판(board/post)·정기모임(sessions, session/[id]·score·match-edit)
│   │                             #  ·반복 스케줄·회원 관리·월례대회·플랜 관리(plan)·회비(dues*)
│   ├── court/                    # 코트 목록(지도)·상세·내 예약
│   ├── payment/                  # 코트 결제·클럽 구독(빌링)·회비 카드 등록·콜백
│   ├── tournament/[id].tsx       # 대회 상세 (정보/참가/대진 탭)
│   ├── dupr-connect.tsx          # DUPR SSO 연결
│   └── community/ · player/ · profile/ · notifications · support
├── components/                   # 카드·브래킷·DUPR 레이팅 그래프·홈 챌린지 카드·사업자 푸터·ui/
├── constants/                    # theme · features(기능 스위치)
├── contexts/                     # auth · loading · notifications · i18n
└── lib/                          # supabase · types · dupr · payments · club-plan · dues · challenge · americano · format …

web-admin/                        # 🖥️ 관리자 웹 (Next.js)
└── app/                          # tournaments · courts · court-requests · match-requests · users
                                  #  · events(팝업) · challenges · audit · reports · payment · refund-policy · landing

supabase/
├── schema.sql                    # 전체 스키마 (최초 1회)
├── functions/                    # Edge Functions 16종 (위 목록 참고) + _shared
└── migrations/                   # 0001 ~ 0099 (번호순 실행)

docs/                             # WORKLOG(작업 일지) · HANDOFF · PROD_APPLY_*.sql(운영 DB 반영용)
```

---

## 데이터 모델 요약
- **profiles** — 가입 트리거로 자동 생성. 실력·지역·역할·푸시 토큰 + **DUPR**(`dupr_id`·단/복식 레이팅·`dupr_status`·프리미엄 자격) — DUPR 컬럼은 서버(service_role)만 쓰기. 전화번호는 본인만 읽는 **user_contact** 에 따로 둡니다.
- **meetups / meetup_matches** — 번개 모임(종목·DUPR 인증/DUPR+), 경기 기록(게임 스코어, DUPR 등록 상태). 수정·삭제는 **match_change_requests** 로 운영자에게 요청.
- **meetup_completions / meetup_attendance** — 번개 완료 기록과 출석(참석·불참·미확인). `meetups.status='closed'` 는 모집 마감일 뿐이라 완료 판단에 쓰지 않습니다. 번개가 지워져도 기록이 남도록 제목·시작 시각·참석 인원을 완료 시점에 적어 둡니다. 쓰기는 서버 함수로만.
- **challenges / challenge_enrollments** — 이벤트 설정(기간·목표·하루 한도·유예·노출 일수)과 참여 신청(인스타그램 아이디). **횟수는 저장하지 않고** 출석 기록에서 매번 계산합니다(운영자 정정이 바로 반영).
- **clubs / club_members** — 클럽·회원(승인·임원). 등급은 서버가 판정(`effective_plan`)하고 앱은 직접 바꾸지 못합니다.
- **club_plans / club_subscriptions / club_subscription_charges** — 플랜 가격표(프리미엄·프리미엄 플러스)와 구독·결제 이력(토스 빌링).
- **club_dues_plans / club_dues / club_dues_charges / club_dues_settlements** 외 — 클럽 회비(주기·금액), 회원별 회비, 결제 장부, 정산. 회원 카드·동의는 `member_billing_cards`·`club_dues_mandates`. (스위치로 꺼져 있음)
- **club_sessions / club_session_players / club_session_matches** — 정기모임·참석 투표·아메리카노 대진(단/복식, DUPR 모드·등록 상태). 반복 스케줄은 `club_session_schedules`.
- **club_posts / club_post_comments** — 클럽 게시판(공지는 홈 노출).
- **courts / court_reservations / payments** — 코트·시간제 예약·토스 결제(환불 정책 단계별).
- **tournaments / tournament_entries / tournament_matches** — 대회(3개 진행 방식, `club_id` 로 클럽 월례대회 구분) · 참가(복식 파트너·참가비 결제·출전 확인) · 대진.
- **event_popups / app_config** — 홈 이벤트 팝업, 앱 버전 게이트(`min_version`).
- **audit_logs** — 운영 행위 감사 로그(불변, super_admin 조회).
- 모든 테이블 **RLS**: 조회는 공개(민감 정보 제외), 쓰기는 본인/호스트/운영자만.

---

## 로드맵
- [x] 커뮤니티 매칭(번개) · 클럽 · 커뮤니티 게시판
- [x] 소셜 로그인 4종 (이메일·카카오·구글·애플)
- [x] 대회 — 진행 방식 3종(조별+토너먼트 / KDK / 단체전) + 대진표·푸시
- [x] 코트 예약 + 토스페이먼츠 결제 + 환불 정책
- [x] 클럽 프리미엄 — 구독 결제(빌링) · 정기모임 대진/순위 · 게시판
- [x] **DUPR 공식 연동** — SSO·레이팅·웹훅·인증 경기 등록 (운영 키 전환 완료)
- [x] 토스 실결제 개통(라이브 키) · 대회 참가비 결제 · 안드로이드 FCM 푸시 · 전화번호 온보딩
- [x] 4.0.0 디자인 리프레시 · 클럽 수정 화면
- [x] **번개 완료 처리 + 챌린지(이벤트)** — 피넛 10매치 챌린지 (4.1.0)
- [ ] 프리미엄 플러스 + 클럽 회비 자동결제 — 구현 완료·숨김. 남은 것: 관리자 정산 화면, 출시 조건(토스 지급대행 계약·법률/세무 검토)
- [ ] 챌린지 후속 — 호스트 "완료 처리" 알림, 관리자 대리 신청·완료 화면
- [ ] 클럽 월례대회 오픈 (기능 구현 완료, 노출 대기)
- [ ] 대기열 승격 알림톡, 진행자 노쇼 호출
- [ ] 모임/클럽 채팅 · 용품 마켓


## 코드 이용 및 제3자 고지

저장소는 공개되어 있지만, 프로젝트 자체 작성 코드에 MIT 라이선스나 별도의 재사용·수정·재배포·상업적 이용 허가를 부여하지 않습니다. 해당 이용에는 권리자의 사전 허락이 필요합니다.

Expo 등 제3자 코드에는 각 제공자의 라이선스가 별도로 적용됩니다. 기존 Expo 저작권 및 MIT 고지 원문은 [Expo 제3자 고지](third-party/EXPO-NOTICE.txt)에 보존하며, 이 고지는 프로젝트 자체 코드 전체에 대한 MIT 이용허락을 뜻하지 않습니다. 기타 의존성 및 포함된 제3자 자료의 고지는 그대로 유지합니다.
