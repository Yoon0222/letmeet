# 피클 — 작업 일지 (WORKLOG)

피클볼 커뮤니티 슈퍼앱의 핵심 결정·작업 기록. 날짜 섹션(`## YYYY-MM-DD`)이 최신순으로 위에 오고, 같은 날짜 안에서는 최신 작업(`### 제목`)이 위로 온다.

## 열린 항목
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
