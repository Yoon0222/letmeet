---
name: run-app
description: 피클 Expo 개발 서버를 띄워 실기기/시뮬레이터에서 앱을 테스트한다. .env 의 Supabase 설정을 먼저 확인한다. 앱을 실행/시작하거나 폰에서 테스트해 달라고 할 때 사용.
---

# 앱 실행 (피클)

## 1. 사전 확인 — Supabase 설정
`.env` 에 두 값이 채워졌는지 확인:
```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```
- 비어 있으면 앱은 `config-missing` 안내 화면만 뜬다. 채우는 절차는 `README.md` 의 "빠른 시작" 참고.
- 채운 뒤엔 dev 서버를 **재시작**해야 env 가 반영된다.

## 2. 의존성 (최초 1회)
```bash
npm install
```

## 3. 실행
```bash
npm start          # Metro 서버 — 터미널 QR 을 Expo Go 앱(폰)으로 스캔하는 게 가장 빠름
# 또는
npm run android    # 안드로이드 에뮬레이터/기기
npm run ios        # iOS 시뮬레이터 (macOS)
npm run web        # 브라우저 미리보기
```

## 4. 코드만 검증하고 싶을 때 (서버 없이)
```bash
npx tsc --noEmit                                   # 타입 체크
npx expo lint                                      # 린트
npx expo export --platform ios --output-dir <tmp>  # 번들 전체 컴파일 확인
```

## 참고
- `@react-native-community/datetimepicker`, native tabs 등 일부는 Expo Go 에서 동작하지만, 추후 네이티브 모듈이 늘면 **development build**(`npx expo run:*` 또는 EAS)가 필요할 수 있다.
- 변경 후엔 항상 tsc + lint 를 통과시킬 것.
