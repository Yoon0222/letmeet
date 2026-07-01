# 피클 🎾 — 피클볼 커뮤니티 매칭 앱

가까운 코트에서 함께 칠 사람을 찾는 피클볼 모바일 앱입니다.
**Expo (React Native) + Supabase** 로 만들어졌으며, 첫 번째 MVP는 **커뮤니티 매칭**(번개 모임 + 플레이어 매칭)에 집중합니다.

> 장기 로드맵: 클럽 관리 · 코트 예약 · 경기 기록/랭킹 · 대회 주최 · 용품 판매 (아래 [로드맵](#로드맵) 참고)

---

## 기능 (현재 MVP)

| 영역 | 내용 |
| --- | --- |
| 🔐 인증 | 이메일 회원가입 / 로그인 (Supabase Auth) |
| 👤 프로필 | 닉네임, 실력(DUPR 2.0~8.0), 활동 지역, 플레이 스타일, 소개 |
| 📅 번개 모임 | 모임 피드(지역 필터), 모임 생성(시간·장소·실력대·정원), 참가/취소 |
| 🤝 플레이어 매칭 | 같은 지역 + 실력 근접 순으로 추천되는 플레이어 목록 |
| 🙋 내 정보 | 내 프로필, 참여 중인 모임 관리, 로그아웃 |

---

## 빠른 시작

### 1. Supabase 프로젝트 준비
1. [supabase.com](https://supabase.com) 에서 무료 프로젝트 생성
2. **SQL Editor** 에 [`supabase/schema.sql`](supabase/schema.sql) 전체 내용을 붙여넣고 실행
   - 테이블(profiles, meetups, meetup_participants), RLS 정책, 트리거, 뷰가 한 번에 생성됩니다.
3. **Authentication → Providers → Email** 활성화
   - 빠른 테스트를 위해 **"Confirm email" 을 끄면** 가입 즉시 로그인됩니다. (운영 시엔 켜두세요.)
4. **Project Settings → API** 에서 `URL` 과 `anon public` 키 복사

### 2. 환경변수 설정
프로젝트 루트의 `.env` 파일을 채웁니다 ([`.env.example`](.env.example) 참고):
```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 3. 실행
```bash
npm install        # 최초 1회
npm start          # Metro 개발 서버
```
- 휴대폰에 **Expo Go** 앱 설치 후 터미널 QR 코드 스캔 (가장 빠름)
- 또는 `npm run android` / `npm run ios`

> `.env` 가 비어 있으면 앱에 **Supabase 설정 안내 화면**이 표시됩니다.

---

## 프로젝트 구조

```
src/
├── app/                      # expo-router 파일 기반 라우팅
│   ├── _layout.tsx           # 루트: Provider + 인증 가드(로그인/탭 분기)
│   ├── config-missing.tsx    # .env 미설정 안내
│   ├── (auth)/               # 비로그인 그룹
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── (tabs)/               # 로그인 그룹 (하단 탭)
│   │   ├── index.tsx         # 모임 피드
│   │   ├── matches.tsx       # 플레이어 매칭
│   │   └── profile.tsx       # 내 정보
│   ├── meetup/
│   │   ├── create.tsx        # 모임 생성 (모달)
│   │   └── [id].tsx          # 모임 상세 + 참가/취소
│   └── profile/edit.tsx      # 프로필 수정 (모달)
├── components/
│   ├── meetup-card.tsx
│   └── ui/                   # button, text-field, avatar, badge
├── contexts/auth.tsx         # 세션 + 프로필 전역 상태
├── lib/
│   ├── supabase.ts           # Supabase 클라이언트
│   ├── types.ts              # 도메인 + Database 타입
│   └── format.ts             # 날짜/실력 포맷 유틸
└── constants/theme.ts        # 브랜드 색상/간격

supabase/schema.sql           # DB 스키마 (한 번에 실행)
```

---

## 개발 스크립트
```bash
npm start            # 개발 서버
npm run android      # 안드로이드 실행
npm run ios          # iOS 실행 (macOS)
npm run web          # 웹 미리보기
npx tsc --noEmit     # 타입 체크
npx expo lint        # 린트
```

---

## 데이터 모델 요약
- **profiles** — `auth.users` 와 1:1. 회원가입 시 트리거로 자동 생성.
- **meetups** — 번개 모임. 생성 시 호스트가 자동으로 참가자에 등록됨.
- **meetup_participants** — 모임↔사용자 M:N.
- **meetups_with_counts** (뷰) — 모임 + 호스트 정보 + 참가자 수.
- 모든 테이블에 **RLS** 적용: 조회는 공개, 쓰기는 본인/호스트만.

---

## 로드맵
- [x] **1단계 — 커뮤니티 매칭** (현재): 번개 모임 + 플레이어 매칭
- [ ] 2단계 — 모임 채팅 / 푸시 알림
- [ ] 3단계 — 클럽(동호회) 개설·회원 관리
- [ ] 4단계 — 코트 예약 + 결제 (지도·PG 연동)
- [ ] 5단계 — 경기 기록 / 엘로 랭킹
- [ ] 6단계 — 대회 주최(브래킷) / 용품 마켓
