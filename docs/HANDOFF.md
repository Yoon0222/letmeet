# HANDOFF

Last updated: 2026-07-14 (Claude: 대회 진행 방식 KDK/단체전 + 부팅 수정)

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
