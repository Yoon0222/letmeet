# 피클 — 작업 일지 (WORKLOG)

피클볼 커뮤니티 슈퍼앱의 핵심 결정·작업 기록. 날짜 섹션(`## YYYY-MM-DD`)이 최신순으로 위에 오고, 같은 날짜 안에서는 최신 작업(`### 제목`)이 위로 온다.

## 열린 항목
- [x] Supabase에 `0004_tournaments.sql` 실행 (대회 테이블) — 적용됨(테이블 200 확인)
- [x] 권한(역할) 체계 코드 완료 (role + RLS + 트리거 + 관리자 웹 게이트 + 사용자관리)
- [x] `0005_roles.sql` 실행 + super_admin 부트스트랩(`관리자`=ysshin93) — 완료
- [x] `0006_tournament_matches.sql` (+ 뷰 재생성) 실행 — 완료, 조별→4강→결승 QA 통과
- [ ] Supabase에 `0007_discipline.sql` 실행 (단식/복식) — 사용자
- [ ] **Supabase에 `0008_partner.sql` 실행** (복식 파트너 회원 연결 `partner_id`) — 사용자 · 실행 전 대회 상세 참가자 조회 실패함
- [ ] **Supabase에 `0009_audit.sql` 실행** (감사 로그 테이블+트리거) — 사용자 · 실행 후부터 행위 기록, `/audit`(슈퍼관리자)에서 조회
- [ ] **Supabase에 `0010_push_token.sql` 실행** (profiles.push_token) — 사용자
- [ ] **Edge Function 배포** `supabase functions deploy notify-turn` (내 경기 차례 푸시) — 사용자 · 실기기 빌드 + Android FCM 자격 필요
- [x] 대회 2단계 — 모바일 참가 신청 화면(대회 탭/목록/상세/신청) 완료
- [ ] 대회 2단계 나머지: 앱 대진표/내 경기 열람, **선수 앱 푸시(내 차례)**, **진행자 "카톡 울리기"(노쇼 호출)**, 3·4위전, 정원 자동 마감
- [ ] 대회 **선착순 참가 + 결제/대기열 흐름**(설계만): 신청 순서대로 처리, `입금 대기`도 정원에 포함(자리 예약) → 결제 완료 시 `참가 확정`, 신청 후 **24h 미입금 자동 취소**. 정원 차면 이후 신청은 `대기 신청`, 취소/자동취소로 자리 나면 **대기열 맨 앞 자동 승격 + 카카오톡 입금 요청(알림톡)+24h**. 무료 대회(fee=0)는 신청 즉시 확정(대기열 없음). 실제 결제는 PG(포트원/토스) 가맹점 계약·통신판매업 필요 → 나중에 연동
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

## 2026-07-03

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
