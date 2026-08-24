import { Stack } from 'expo-router';

// 비로그인 그룹의 초기 화면은 항상 로그인. (terms 가 초기 화면으로 잡혀 앱이 잠기던 문제 방지)
export const unstable_settings = { initialRouteName: 'sign-in' };

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
      {/* 이용약관은 버튼으로만 진입하는 모달 — 직접 랜딩되지 않게 */}
      <Stack.Screen name="terms" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
