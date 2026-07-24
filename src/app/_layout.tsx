import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootScreen } from '@/components/ui/boot-screen';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { I18nProvider } from '@/contexts/i18n';
import { LoadingProvider } from '@/contexts/loading';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isSupabaseConfigured } from '@/lib/supabase';

export const unstable_settings = { initialRouteName: '(tabs)' };

function RootNavigator() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Supabase 설정이 비어 있으면 안내 화면으로. (로그인 가드는 아래 Stack.Protected 가 선언적으로 처리)
  useEffect(() => {
    if (initializing) return;
    if (!isSupabaseConfigured && (segments[0] as string | undefined) !== 'config-missing') {
      router.replace('/config-missing');
    }
  }, [initializing, segments, router]);

  // 앱 부팅(세션 확인) 중에는 피넛 브랜드 스플래시를 띄운다
  if (initializing) {
    return <BootScreen />;
  }

  // 로그인 필수. 비로그인 상태에선 보호 화면이 네비게이터에 아예 등록되지 않으므로
  // 리다이렉트 방식과 달리 홈이 한 프레임도 노출되지 않는다.
  const signedIn = !!session;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* 비로그인 전용 */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      {/* 로그인 필요 — 앱의 모든 화면 */}
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="meetup/create"
          options={{ presentation: 'modal', headerShown: true, title: '모임 만들기' }}
        />
        <Stack.Screen name="meetup/[id]" options={{ headerShown: true, title: '모임 상세' }} />
        <Stack.Screen
          name="club/create"
          options={{ presentation: 'modal', headerShown: true, title: '클럽 만들기' }}
        />
        <Stack.Screen name="club/[id]" options={{ headerShown: true, title: '클럽' }} />
        <Stack.Screen name="tournament/[id]" options={{ headerShown: true, title: '대회' }} />
        <Stack.Screen name="player/[id]" options={{ headerShown: true, title: '플레이어' }} />
        <Stack.Screen
          name="community/create"
          options={{ presentation: 'modal', headerShown: true, title: '글쓰기' }}
        />
        <Stack.Screen name="community/[id]" options={{ headerShown: true, title: '게시글' }} />
        <Stack.Screen name="payment/webview" options={{ headerShown: true, title: '결제' }} />
        <Stack.Screen name="profile/connections" options={{ headerShown: true, title: '연결된 로그인' }} />
        <Stack.Screen name="court/index" options={{ headerShown: true, title: '코트 예약' }} />
        <Stack.Screen name="court/reservations" options={{ headerShown: true, title: '내 예약' }} />
        <Stack.Screen name="court/[id]" options={{ headerShown: true, title: '코트' }} />
        <Stack.Screen
          name="profile/edit"
          options={{ presentation: 'modal', headerShown: true, title: '프로필 수정' }}
        />
      </Stack.Protected>

      {/* 가드 밖 — 딥링크 복귀 핸들러는 세션 교환 전(비로그인)에 열리므로 항상 등록해 둔다 */}
      <Stack.Screen name="config-missing" />
      <Stack.Screen name="auth-callback" />
      <Stack.Screen name="payment/success" />
      <Stack.Screen name="payment/fail" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'unspecified' ? 'light' : colorScheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <I18nProvider>
            <AuthProvider>
              <LoadingProvider>
                <View style={{ flex: 1, backgroundColor: Colors[scheme].background }}>
                  <RootNavigator />
                </View>
              </LoadingProvider>
            </AuthProvider>
          </I18nProvider>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
