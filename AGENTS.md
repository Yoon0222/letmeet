# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any Expo/React Native code. Do not rely on memory of older Expo APIs.

---

# 피넛 — 피클볼 커뮤니티 매칭 앱

피클볼 슈퍼앱의 1단계 MVP. 가까운 코트에서 함께 칠 사람을 찾는 **커뮤니티 매칭**(번개 모임 + 플레이어 매칭) 모바일 앱이다.

## 브랜드
- **이름: 피넛 (PEANUT)** — 앱 표시 이름은 "피넛". (내부 slug/scheme/bundleID 는 `pickleball` / `com.pickle.app` 유지 — 빌드·스토어·딥링크 안정성 때문에 건드리지 말 것)
- **브랜드 가치: Play · Engage · Achieve**
- **슬로건: for sports nuts** (peanut ↔ nuts 워드플레이)
- "피클볼"은 종목명이라 그대로 쓰고, **앱 브랜드 표기는 "피넛"** 으로 통일한다. (기존 "피클" 표기가 남아 있으면 피넛으로 교체)

## 스택
- **Expo SDK 56** (React Native 0.85) + **expo-router**(파일 기반 라우팅, typed routes)
- **Supabase** — Auth(이메일) / Postgres / RLS / 실시간
- **TypeScript** (strict)
- 상태관리: React Context (`src/contexts/auth.tsx`) — 별도 라이브러리 없음
- 아이콘: `@expo/vector-icons`(Ionicons). 날짜: `date-fns`(`ko` 로케일)

## 실행 / 검증
```bash
npm start            # Metro 개발 서버 (Expo Go 앱으로 QR 스캔)
npm run android      # 안드로이드
npm run ios          # iOS (macOS 필요)
npx tsc --noEmit     # 타입 체크 — 변경 후 반드시 통과시킬 것
npx expo lint        # 린트 — 변경 후 반드시 통과시킬 것
```
- `.env`(루트)에 `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 필요. 비어 있으면 앱이 `config-missing` 안내 화면을 띄운다.
- 번들 전체 검증이 필요하면: `npx expo export --platform ios --output-dir <scratch>` (JS 그래프 컴파일 확인용).

## 폴더 구조
```
src/
├── app/                  # expo-router 라우트 (디렉토리 = URL)
│   ├── _layout.tsx       # 루트: Provider + 인증 가드(세션 유무로 (auth)/(tabs) 분기)
│   ├── config-missing.tsx
│   ├── (auth)/           # 비로그인 그룹: sign-in, sign-up
│   ├── (tabs)/           # 로그인 그룹(하단 탭): index(모임), matches(매칭), profile(내정보)
│   ├── meetup/           # create(모달), [id](상세)
│   └── profile/edit.tsx  # 프로필 수정(모달)
├── components/
│   ├── meetup-card.tsx
│   └── ui/               # button, text-field, avatar, badge — 새 공용 UI는 여기에
├── contexts/auth.tsx     # useAuth(): session, profile, signIn/Up/Out, refreshProfile
├── lib/
│   ├── supabase.ts       # supabase 클라이언트 + isSupabaseConfigured
│   ├── types.ts          # 도메인 타입 + Supabase `Database` 제네릭 타입
│   └── format.ts         # 날짜/실력 포맷 유틸 (한국어)
└── constants/theme.ts    # Brand 색상, Colors(light/dark), Spacing

supabase/
├── schema.sql            # 전체 스키마(테이블+RLS+트리거+뷰) — 최초 1회 실행
└── migrations/           # 이후 변경은 번호순 마이그레이션 파일로 추가
```

## 코딩 규칙 (이 코드베이스의 관례)
- **경로 별칭** `@/` → `src/`. import 는 이 별칭을 쓴다.
- **파일명은 kebab-case** (`meetup-card.tsx`, `text-field.tsx`).
- **색상은 하드코딩 금지** — `useTheme()` 로 받은 테마 색을 쓴다. 브랜드 그린은 `theme.primary`(#3DBA6F). 라이트/다크 모드 모두 동작해야 함.
- **간격**은 `Spacing` 상수 사용(`Spacing.three` = 16 등).
- 화면은 `SafeAreaView`(react-native-safe-area-context) + `useTheme()` 패턴을 따른다. 기존 `src/app/(tabs)/index.tsx` 를 레퍼런스로.
- **사용자 메시지는 한국어**. 코드 주석도 한국어로 간결하게.
- `Alert.alert` 로 에러를 노출하고, Supabase 에러 메시지는 가능하면 한국어로 번역(`translateError` 참고).

## Supabase / DB 작업 시 주의
- **`types.ts` 의 도메인 타입은 반드시 `type` 별칭으로** 정의한다(`interface` 금지). interface 는 Supabase 의 `GenericTable`(Record<string, unknown>) 제약을 만족하지 못해 쿼리 타입이 `never` 로 무너진다. 각 테이블/뷰에는 `Relationships: []` 도 포함한다.
- 스키마를 바꾸면: ① `supabase/schema.sql` 갱신 ② `supabase/migrations/NNNN_*.sql` 추가(이미 실행한 사람용 ALTER) ③ `src/lib/types.ts` 의 타입과 `Database` 갱신 — 세 가지를 항상 함께.
- 모든 테이블은 **RLS** 적용: 조회는 공개, 쓰기는 본인/호스트만. 새 테이블도 동일 원칙.
- 새 사용자 `profiles` 행은 `handle_new_user` 트리거가 자동 생성한다(앱에서 insert 하지 말 것).

## 도메인 메모
- **실력**은 DUPR 스타일 `2.0~8.0` numeric. 라벨은 `skillLabel()`.
- **DUPR 연동 대비** 필드(`dupr_id`/`dupr_rating`/`dupr_verified`)가 `profiles` 에 있다. 현재는 자가입력(미인증), 추후 DUPR 파트너 API 로 검증 예정.

## 로드맵 (다음 단계 후보)
모임 채팅/푸시 → 클럽 관리 → 코트 예약+결제(지도·PG) → 경기 기록/엘로 랭킹 → 대회/마켓. 자세한 건 `README.md`.
