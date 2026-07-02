# 피클 — 작업 일지 (WORKLOG)

피클볼 커뮤니티 슈퍼앱의 핵심 결정·작업 기록. 날짜 섹션(`## YYYY-MM-DD`)이 최신순으로 위에 오고, 같은 날짜 안에서는 최신 작업(`### 제목`)이 위로 온다.

## 열린 항목
- [x] Supabase에 `0004_tournaments.sql` 실행 (대회 테이블) — 적용됨(테이블 200 확인)
- [x] 권한(역할) 체계 코드 완료 (role + RLS + 트리거 + 관리자 웹 게이트 + 사용자관리)
- [ ] Supabase에 `0005_roles.sql` 실행 + 최초 super_admin 부트스트랩 SQL — 사용자
- [ ] 대회 2단계: 모바일 참가 신청 화면 + 대진표(싱글 엘리) + 내 차례 알림
- [ ] Supabase에 `0003_clubs.sql` 마이그레이션 실행 (클럽 테이블 생성) — 사용자
- [ ] 카카오 로그인: 카카오 개발자 + Supabase Kakao Provider 설정 — 사용자
- [ ] 안드로이드 개발 빌드(EAS) 실행: `eas build -p android --profile development` — 사용자
- [ ] 노션 MCP 커넥터를 **현재 Claude Code 환경에 재연결** (이 세션엔 노션 도구 없음 → qa-report/워크로그 노션 미러링 대기) — 사용자
- [x] 노션 커넥터 연결 + "피클 — 기능 현황 & 로드맵" 페이지 생성
- [x] 변경분 커밋 (카카오·빌드설정·홈·탭재편·클럽·QA/워크로그) — `7879045`
- [x] Supabase 프로젝트 연결 + 스키마 실행 (ref `pjfhxkvdjipvdmfsacie`)
- [x] MVP 커뮤니티 매칭 구현 및 웹에서 동작 확인

### 향후 대형 에픽 (상세는 노션 로드맵)
- [ ] 코트 예약(사용자) + 네이버 지도 연동 + 결제
- [ ] 대회: 개설·운영(관리자) · 참여 · 내 차례 카카오톡 알림톡
- [ ] 웹 관리자 페이지(별도 웹앱) + 권한(역할) 체계
- [ ] 커뮤니티 화면 (자유게시판 · 후기 · 팁)
- [ ] 실력·성장: 경기기록/통계 대시보드 · 코치 마켓 · 게이미피케이션(챌린지·뱃지·스트릭)
- [ ] 매칭 고도화: 실시간 "지금 칠 사람" · 정기 파트너 · 출석/노쇼 관리
- [ ] 편의: 코트 디렉토리·리뷰 · 날씨 · 더치페이 · 카톡 공유/캘린더
- [ ] 수익화: 프리미엄 · 대회 참가비 · 상점 수수료 · 광고
- [ ] 상점 화면 (피클볼 용품 판매) — 로드맵 가장 마지막

---

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
