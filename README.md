# 피넛 🥜 — 피클볼 슈퍼앱

> **PEANUT** — **P**lay · **E**ngage · **A**chieve
> 슬로건: _for sports nuts_ — 스포츠에 진심인 사람들을 위해

번개 모임 매칭부터 클럽 운영, 코트 예약·결제, 대회 진행, **DUPR 공식 레이팅 연동**까지 담은 피클볼 슈퍼앱입니다.
**Expo (React Native) + Supabase** 모바일 앱과, 운영을 위한 **Next.js 관리자 웹**으로 구성됩니다. (현재 모바일 v3.2.2, 스토어 출시)

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
| 🔐 인증 | 이메일 · **카카오 · 구글 · 애플** 로그인, 연결된 로그인 관리, 회원 탈퇴 |
| 🏠 홈 | 다가오는 내 일정(모임·대회·예약) · 코트 예약 바로가기 · 추천 모임/클럽 · 모집 중 대회 · **내 클럽 공지** |
| ⚡ 모임(번개) | **일반/DUPR 매치 탭 분리**, 모임 생성(단식·복식·자유, DUPR 인증/DUPR+ 조건), 참가 승인·게스트비, 경기 기록(방 형태 따라 단·복식, 최종 점검 모달 → **DUPR 서버 등록**), 기록 완료 시 목록에서 자동 숨김, 수정·삭제는 운영자 요청 흐름 |
| 🏟️ 코트 | 네이버 지도 검색, 시간제 예약, **토스페이먼츠 결제**, 코트별 단계형 환불 정책, 내 예약 관리·취소 환불 |
| 👥 클럽 | 개설·가입 승인·임원 임명, **프리미엄 구독(토스 자동결제)** — 게시판(공지·댓글, 홈 노출) · **정기모임**(참석 투표 → 아메리카노 대진(단식/복식) → 점수 → 순위, 모임/대진/순위 탭, **선수 DUPR 인증 뱃지** + DUPR 일괄 등록) · 월례대회(추후 오픈) |
| 🏆 대회 | 공개 대회 목록(**필터 모달: 종목·연도·월**, 클럽 월례대회 제외), 참가 신청·복식 파트너 검색, 대진표(조 순위 + 브래킷), 내 차례 푸시 |
| 🏅 DUPR | **공식 파트너 연동(운영 키)** — SSO 계정 연결/해제, 단·복식 레이팅 + 추이 그래프, RATING 웹훅 자동 반영, DUPR 인증 모임·대회 게이팅(DUPR+ 는 Premium+Verified 만) |
| 💬 커뮤니티 | 카테고리 게시판(글·댓글) |
| 👤 내 정보 | 프로필·피넛 아바타 25종/업로드, DUPR 레이팅 카드·그래프, 자격 칩 |
| ⋯ 기타 | 알림함, 고객지원(분쟁 접수), 사업자 정보 표기, 강제 업데이트 게이트 |

### 🖥️ 관리자 웹 (web-admin)
- **대회 개설·운영** — 진행 방식 3종: 조별+토너먼트 / KDK 개인전 / 단체전(오더 동시제출·서브매치), 점수 입력·자동 진행, DUPR+ 대회 설정
- **코트 관리** — 코트 등록·운영시간·가격·**환불 정책(단계형)**, 예약/결제 현황, 코트 등록 요청 처리
- **경기 요청 처리** — 사용자가 요청한 기록 수정·삭제를 운영자가 실행(DUPR 재등록/삭제 연동)
- **역할 기반 접근** — `player < organizer < court_manager < super_admin`
- **감사 로그** — 시간·행위자·역할·행위별 검색 필터
- **사용자 관리 · 신고 처리 · 랜딩/환불정책 페이지**

### ⚡ Edge Functions (Supabase)
`dupr-verify`(SSO 연결·해제·자격 동기화) · `dupr-match`(경기 등록/수정/삭제) · `dupr-webhook`(RATING 수신) · `toss-confirm`/`toss-cancel`(코트 결제·환불) · `toss-billing-issue`/`charge`/`cancel`(클럽 구독) · `notify-turn`/`notify-tie`(대회 푸시)

---

## 빠른 시작

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 실행
   - 테이블·RLS·트리거·뷰가 한 번에 생성됩니다. 기존 DB는 [`supabase/migrations/`](supabase/migrations/) 를 번호순(`0001`~`0088`)으로 실행하세요.
3. **Authentication → Providers** — Email 활성화, 소셜(카카오·구글·애플)은 각 콘솔에서 리다이렉트 URI `https://<ref>.supabase.co/auth/v1/callback` 등록 후 키 입력
4. **Edge Functions 배포** (DUPR·결제·알림 사용 시):
   ```bash
   npx supabase functions deploy dupr-verify dupr-match dupr-webhook toss-confirm toss-cancel toss-billing-issue toss-billing-charge toss-billing-cancel notify-turn notify-tie
   ```
   시크릿(값은 각 콘솔에서 발급): `DUPR_CLIENT_KEY/SECRET/API_BASE/SSO_BASE/PUBLIC_BASE/WEBHOOK_SECRET`, `TOSS_SECRET_KEY`
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

---

## 프로젝트 구조

```
src/                              # 📱 모바일 앱 (Expo)
├── app/                          # expo-router 파일 기반 라우팅
│   ├── _layout.tsx               # 루트: Provider + 인증 가드 + 결제 딥링크 복귀
│   ├── (auth)/                   # 비로그인: sign-in / sign-up
│   ├── (tabs)/                   # 하단 탭: index(홈)·matches(모임)·court(코트)·community·more(전체)
│   │                             #  + clubs·tournaments·profile (전체 메뉴 경유)
│   ├── meetup/                   # 모임 생성·상세·경기 기록(record)
│   ├── club/                     # 상세·게시판(board/post)·정기모임(sessions, session/[id]·score·match-edit)
│   │                             #  ·반복 스케줄·회원 관리·월례대회
│   ├── court/                    # 코트 목록(지도)·상세·내 예약
│   ├── payment/                  # 코트 결제·클럽 구독(빌링)·콜백
│   ├── tournament/[id].tsx       # 대회 상세 (정보/참가/대진 탭)
│   ├── dupr-connect.tsx          # DUPR SSO 연결
│   └── community/ · player/ · profile/ · notifications · support
├── components/                   # 카드·브래킷·DUPR 레이팅 그래프·사업자 푸터·ui/
├── contexts/                     # auth · loading · notifications · i18n
└── lib/                          # supabase · types · dupr · payments · americano · format …

web-admin/                        # 🖥️ 관리자 웹 (Next.js)
└── app/                          # tournaments · courts · court-requests · match-requests
                                  #  · users · audit · reports · payment · refund-policy · landing

supabase/
├── schema.sql                    # 전체 스키마 (최초 1회)
├── functions/                    # Edge Functions 10종 (위 표 참고)
└── migrations/                   # 0001 ~ 0088 (번호순 실행)
```

---

## 데이터 모델 요약
- **profiles** — 가입 트리거로 자동 생성. 실력·지역·역할·푸시 토큰 + **DUPR**(`dupr_id`·단/복식 레이팅·`dupr_status`·프리미엄 자격) — DUPR 컬럼은 서버(service_role)만 쓰기.
- **meetups / meetup_matches** — 번개 모임(종목·DUPR 인증/DUPR+), 경기 기록(게임 스코어, DUPR 등록 상태). 수정·삭제는 **match_change_requests** 로 운영자에게 요청.
- **clubs / club_members** — 클럽·회원(승인·임원). 프리미엄 구독 상태(토스 빌링) 포함.
- **club_sessions / club_session_players / club_session_matches** — 정기모임·참석 투표·아메리카노 대진(단/복식, DUPR 모드·등록 상태). 반복 스케줄은 `club_session_schedules`.
- **club_posts / club_post_comments** — 클럽 게시판(공지는 홈 노출).
- **courts / court_reservations / payments** — 코트·시간제 예약·토스 결제(환불 정책 단계별).
- **tournaments / tournament_entries / tournament_matches** — 대회(3개 진행 방식, `club_id` 로 클럽 월례대회 구분) · 참가(복식 파트너) · 대진.
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
- [ ] 클럽 월례대회 오픈 (기능 구현 완료, 노출 대기)
- [ ] 대회 참가비 결제·대기열 승격 알림톡, 진행자 노쇼 호출
- [ ] 모임/클럽 채팅 · 용품 마켓
