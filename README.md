# 피클 🎾 — 피클볼 커뮤니티 매칭 앱

가까운 코트에서 함께 칠 사람을 찾는 피클볼 슈퍼앱입니다.
**Expo (React Native) + Supabase** 기반의 모바일 앱과, 대회 운영을 위한 **Next.js 관리자 웹**으로 구성됩니다.

이 저장소는 두 개의 앱을 담습니다.

| 앱 | 위치 | 스택 | 대상 |
| --- | --- | --- | --- |
| 📱 모바일 앱 | 저장소 루트 | Expo SDK 56 · React Native · expo-router | 일반 사용자 |
| 🖥️ 관리자 웹 | [`web-admin/`](web-admin/) | Next.js 16 · React 19 · Tailwind | 대회 주최자/운영자 |

두 앱은 **같은 Supabase 프로젝트(DB·Auth)** 를 공유합니다.

---

## 기능 (현재)

### 📱 모바일 앱
| 영역 | 내용 |
| --- | --- |
| 🔐 인증 | 이메일 + **카카오** 로그인 (Supabase Auth) |
| 🏠 홈 | 요약 허브 — 다가오는 내 모임 · 빠른 실행 · 추천 모임 · 추천 클럽 |
| ⚡ 매칭 | 번개 모임 피드(지역 필터), 모임 생성(시간·장소·실력대·정원), 참가/취소 |
| 👥 클럽 | 동호회 개설, 목록/상세, 가입/탈퇴 |
| 👤 내 정보 | 프로필(닉네임·실력 DUPR 2.0~8.0·지역·플레이 스타일), 참여 모임 관리, 로그아웃 |

### 🖥️ 관리자 웹 (web-admin)
- **대회(tournaments)** 개설 · 목록 · 상세 · 참가신청(승인/대기) 관리
- **역할 기반 접근** — `player < organizer < court_manager < super_admin`. 대회 개설은 `organizer` 이상만.

---

## 빠른 시작

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 실행
   - 테이블(profiles / meetups / clubs / tournaments 등), RLS 정책, 트리거, 뷰가 한 번에 생성됩니다.
   - 이미 예전 스키마를 실행했다면, [`supabase/migrations/`](supabase/migrations/) 의 `0001`~`0005` 를 순서대로 실행하세요.
3. **Authentication → Providers**
   - **Email** 활성화 (빠른 테스트를 위해 "Confirm email" 을 끄면 가입 즉시 로그인. 운영 시엔 켜두세요.)
   - **Kakao** Provider 설정 — 카카오 개발자 콘솔의 Redirect URI 를 `https://<ref>.supabase.co/auth/v1/callback` 로 등록.
4. 관리자 웹을 쓰려면 최초 **super_admin** 을 지정합니다 (SQL Editor):
   ```sql
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'YOUR@EMAIL');
   ```
5. **Project Settings → API** 에서 `URL` 과 `anon public` 키 복사

### 2. 모바일 앱 실행
프로젝트 루트의 `.env` 를 채웁니다 ([`.env.example`](.env.example) 참고):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```
```bash
npm install        # 최초 1회
npm start          # Metro 개발 서버
```
- Expo SDK 56 은 Expo Go 와 호환되지 않으므로 실기기는 **개발 빌드**로 실행합니다:
  `eas build -p android --profile development` 후 `npx expo start --dev-client`
- 웹 미리보기는 `npm run web`
- `.env` 가 비어 있으면 앱에 **Supabase 설정 안내 화면**이 표시됩니다.

### 3. 관리자 웹 실행
`web-admin/.env.local` 을 만들고 **같은 Supabase 프로젝트** 키를 넣습니다:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```
```bash
cd web-admin
npm install
npm run dev        # http://localhost:3000
```

---

## 프로젝트 구조

```
src/                              # 📱 모바일 앱 (Expo)
├── app/                          # expo-router 파일 기반 라우팅
│   ├── _layout.tsx               # 루트: Provider + 인증 가드 + 로딩 오버레이
│   ├── config-missing.tsx        # .env 미설정 안내
│   ├── (auth)/                   # 비로그인 그룹: sign-in / sign-up
│   ├── (tabs)/                   # 로그인 그룹 (하단 탭)
│   │   ├── index.tsx             # 홈 (요약 허브)
│   │   ├── matches.tsx           # 매칭 = 번개 모임 피드
│   │   ├── clubs.tsx             # 클럽 목록
│   │   └── profile.tsx           # 내 정보
│   ├── meetup/                   # create(모달) · [id](상세)
│   ├── club/                     # create(모달) · [id](상세)
│   └── profile/edit.tsx          # 프로필 수정 (모달)
├── components/                   # meetup-card, club-card, ui/(button·avatar·kakao-button·loading-overlay 등)
├── contexts/                     # auth(세션·프로필), loading(전역 로딩)
├── lib/                          # supabase · types(도메인+Database) · format
└── constants/theme.ts            # 브랜드 색상/간격

web-admin/                        # 🖥️ 관리자 웹 (Next.js)
├── app/                          # login · tournaments(목록/[id]/new)
├── components/                   # protected(역할 가드) · app-header
└── lib/                          # supabase · use-session · types · format

supabase/
├── schema.sql                    # 전체 스키마 (최초 1회 실행)
└── migrations/                   # 0001 dupr · 0002 kakao · 0003 clubs · 0004 tournaments · 0005 roles
```

---

## 개발 스크립트

**모바일 앱 (루트)**
```bash
npm start            # 개발 서버
npm run android      # 안드로이드 실행
npm run ios          # iOS 실행 (macOS)
npm run web          # 웹 미리보기
npx tsc --noEmit     # 타입 체크
npx expo lint        # 린트
```

**관리자 웹 (web-admin/)**
```bash
npm run dev          # 개발 서버 (localhost:3000)
npm run build        # 프로덕션 빌드
npm run lint         # 린트
```

---

## 데이터 모델 요약
- **profiles** — `auth.users` 와 1:1, 회원가입 트리거로 자동 생성. 실력(DUPR)·지역·`role` 포함.
- **meetups / meetup_participants** — 번개 모임과 참가자(M:N). 생성 시 호스트 자동 참가.
- **clubs / club_members** — 동호회와 회원(M:N).
- **tournaments / tournament_entries** — 대회와 참가신청(승인/대기).
- **뷰** — `meetups_with_counts` · `clubs_with_counts` · `tournaments_with_counts` (본체 + 개설자 정보 + 인원 집계).
- **역할** — `my_role()` 헬퍼 + `enforce_role_change` 트리거로 권한 상승 차단. 부여는 `super_admin` 만.
- 모든 테이블에 **RLS** 적용: 조회는 공개, 쓰기는 본인/호스트/주최자만.

---

## 로드맵
- [x] **커뮤니티 매칭** — 번개 모임(매칭 탭) + 홈 허브
- [x] **클럽(동호회)** — 개설 · 회원 관리
- [x] **카카오 로그인**
- [x] **대회 1단계** — 공유 DB + 관리자 웹(개설·참가신청 관리) + 역할 체계
- [ ] 대회 2단계 — 브래킷 대진/운영, "내 차례" 카카오 알림톡
- [ ] 코트 예약 + 결제 (지도·PG 연동)
- [ ] 모임 채팅 / 푸시 알림
- [ ] 경기 기록 / 엘로 랭킹
- [ ] 용품 마켓
