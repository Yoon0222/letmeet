---
name: add-screen
description: 피클 Expo 앱에 새 화면(라우트/탭/모달)을 프로젝트 관례대로 추가한다. expo-router 파일 구조, SafeAreaView, useTheme(), Spacing 패턴을 따른다. 새 페이지·화면·탭을 추가해 달라고 할 때 사용.
---

# 새 화면 추가 (피클 앱)

이 앱은 **expo-router**(파일 = 라우트)를 쓴다. `src/app/` 아래 위치가 곧 경로다.

## 1. 위치 정하기
- **로그인 후 일반 화면** → `src/app/(tabs)/<name>.tsx` (탭으로 노출) 또는 `src/app/<feature>/<name>.tsx` (스택 푸시)
- **모달** → `src/app/<feature>/<name>.tsx` + 루트 `src/app/_layout.tsx` 의 `<Stack>` 에 `presentation: 'modal'` 로 등록
- **비로그인 화면** → `src/app/(auth)/<name>.tsx`
- 새 탭이면 `src/app/(tabs)/_layout.tsx` 에 `<Tabs.Screen>` 추가(Ionicons 아이콘 지정).

## 2. 화면 템플릿 (이 패턴을 그대로 따를 것)
```tsx
import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function MyScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>제목</Text>
        {/* ... */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
});
```

## 3. 규칙 (반드시)
- import 는 `@/` 별칭. 파일명은 kebab-case.
- 색상은 **하드코딩 금지** → `useTheme()`. 브랜드 그린 = `theme.primary`. 라이트/다크 모두 확인.
- 간격은 `Spacing` 상수. 공용 UI 는 `src/components/ui/` 의 `Button`/`TextField`/`Avatar`/`Badge` 재사용.
- Supabase 데이터를 읽으면 `useFocusEffect` + `supabase.from(...)` 패턴(기존 `src/app/(tabs)/index.tsx` 참고).
- 사용자 텍스트·주석은 한국어.

## 4. 마무리
- `npx tsc --noEmit` 와 `npx expo lint` 를 통과시킨다.
- 새 라우트가 헤더/모달이면 루트 `_layout.tsx` 의 `<Stack.Screen>` 옵션을 등록했는지 확인.
