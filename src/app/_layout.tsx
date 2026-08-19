import {
  DarkTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SystemBars } from 'react-native-edge-to-edge';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootScreen } from '@/components/ui/boot-screen';
import { FeedbackHost } from '@/components/ui/feedback-host';
import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { I18nProvider } from '@/contexts/i18n';
import { LoadingProvider } from '@/contexts/loading';
import { NotificationsProvider } from '@/contexts/notifications';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isBarePaymentAppReturn } from '@/lib/payment-return-state';
import { isSupabaseConfigured } from '@/lib/supabase';

export const unstable_settings = { initialRouteName: '(tabs)' };

// 앱은 다크 전용 팔레트(#070A0D). 네비게이션 테마 배경을 기기 색상모드와 무관하게 다크로
// 고정 → 화면 전환/마운트 때 라이트 배경(스톡 DefaultTheme rgb(242,242,242))이 한 프레임
// 비쳐 깜빡이던 문제 제거. (씬 배경은 이 테마의 background/card 를 따른다)
const AppNavTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: '#070A0D', card: '#070A0D' },
};

function getUrlQuery(url: string) {
  const questionIndex = url.indexOf('?');
  if (questionIndex < 0) return new URLSearchParams();
  return new URLSearchParams(url.slice(questionIndex + 1));
}

function extractPaymentRedirectUrl(url: string) {
  if (!url.startsWith('pickleball://')) return null;

  const query = getUrlQuery(url);
  const nestedUrl = query.get('url');
  const normalizedUrl = nestedUrl ? decodeURIComponent(nestedUrl) : url;

  if (
    normalizedUrl.includes('/payment/success') ||
    normalizedUrl.includes('/payment/fail') ||
    (query.has('paymentKey') && query.has('orderId') && query.has('amount')) ||
    query.has('code') ||
    query.has('message')
  ) {
    return normalizedUrl;
  }

  return null;
}

function RootNavigator() {
  const { session, initializing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const signedIn = !!session;

  // Supabase 설정이 비어 있으면 안내 화면으로. (로그인 가드는 아래 Stack.Protected 가 선언적으로 처리)
  useEffect(() => {
    if (initializing) return;
    if (!isSupabaseConfigured && (segments[0] as string | undefined) !== 'config-missing') {
      router.replace('/config-missing');
    }
  }, [initializing, segments, router]);

  useEffect(() => {
    if (initializing || !signedIn) return;

    const routePaymentRedirect = (url: string | null) => {
      if (!url) return;
      if (isBarePaymentAppReturn(url)) {
        return;
      }

      const paymentRedirectUrl = extractPaymentRedirectUrl(url);
      if (!paymentRedirectUrl) return;

      router.replace({
        pathname: '/payment/callback',
        params: { url: paymentRedirectUrl },
      });
    };

    Linking.getInitialURL().then(routePaymentRedirect).catch((error: unknown) => {
      console.warn('[payment] initial redirect read failed', error);
    });

    const subscription = Linking.addEventListener('url', (event) => {
      routePaymentRedirect(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [initializing, router, signedIn]);

  // 앱 부팅(세션 확인) 중에는 피넛 브랜드 스플래시를 띄운다
  if (initializing) {
    return <BootScreen />;
  }

  // 로그인 필수. 비로그인 상태에선 보호 화면이 네비게이터에 아예 등록되지 않으므로
  // 리다이렉트 방식과 달리 홈이 한 프레임도 노출되지 않는다.
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
        <Stack.Screen name="meetup/record/[id]" options={{ headerShown: true, title: '경기 기록' }} />
        <Stack.Screen
          name="club/create"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: '클럽 만들기',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="club/[id]"
          options={{
            headerShown: true,
            title: '클럽',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="tournament/[id]" options={{ headerShown: true, title: '대회' }} />
        <Stack.Screen
          name="club/sessions"
          options={{ headerShown: true, title: '정기모임', headerStyle: { backgroundColor: '#070A0D' }, headerTintColor: '#F8FAFC', headerShadowVisible: false }}
        />
        <Stack.Screen
          name="club/tournaments"
          options={{ headerShown: true, title: '월례대회', headerStyle: { backgroundColor: '#070A0D' }, headerTintColor: '#F8FAFC', headerShadowVisible: false }}
        />
        <Stack.Screen
          name="club/results"
          options={{ headerShown: true, title: '경기 결과', headerStyle: { backgroundColor: '#070A0D' }, headerTintColor: '#F8FAFC', headerShadowVisible: false }}
        />
        <Stack.Screen
          name="club/members"
          options={{ headerShown: true, title: '회원 관리', headerStyle: { backgroundColor: '#070A0D' }, headerTintColor: '#F8FAFC', headerShadowVisible: false }}
        />
        <Stack.Screen
          name="club/tournament-create"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: '월례대회 개설',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="club/session-create"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: '정기모임 개설',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="club/session/[id]"
          options={{
            headerShown: true,
            title: '정기모임',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="club/session/score"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: '경기 결과',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="club/session/match-edit"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: '대진 편집',
            headerStyle: { backgroundColor: '#070A0D' },
            headerTintColor: '#F8FAFC',
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen name="player/[id]" options={{ headerShown: true, title: '플레이어' }} />
        <Stack.Screen
          name="community/create"
          options={{ presentation: 'modal', headerShown: true, title: '글쓰기' }}
        />
        <Stack.Screen name="community/[id]" options={{ headerShown: true, title: '게시글' }} />
        <Stack.Screen name="profile/connections" options={{ headerShown: true, title: '연결된 로그인' }} />
        <Stack.Screen name="court/index" options={{ headerShown: true, title: '코트 예약' }} />
        <Stack.Screen name="court/reservations" options={{ headerShown: true, title: '내 예약' }} />
        <Stack.Screen name="court/[id]" options={{ headerShown: true, title: '코트' }} />
        <Stack.Screen name="payment/court" options={{ headerShown: false }} />
        <Stack.Screen name="payment/callback" options={{ headerShown: true, title: '결제 확인' }} />
        <Stack.Screen name="notifications" options={{ headerShown: true, title: '알림' }} />
        <Stack.Screen name="support" options={{ headerShown: true, title: '고객지원' }} />
        <Stack.Screen name="dupr-connect" options={{ headerShown: true, title: 'DUPR 연결' }} />
        <Stack.Screen
          name="profile/edit"
          options={{ presentation: 'modal', headerShown: true, title: '프로필 수정' }}
        />
      </Stack.Protected>

      {/* 가드 밖 — 딥링크 복귀 핸들러는 세션 교환 전(비로그인)에 열리므로 항상 등록해 둔다 */}
      <Stack.Screen name="config-missing" />
      <Stack.Screen name="auth-callback" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const scheme = colorScheme === 'unspecified' ? 'light' : colorScheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={AppNavTheme}>
          <I18nProvider>
            <AuthProvider>
              <NotificationsProvider>
                <LoadingProvider>
                  <View style={{ flex: 1, backgroundColor: Colors[scheme].background }}>
                    <RootNavigator />
                    <FeedbackHost />
                  </View>
                </LoadingProvider>
              </NotificationsProvider>
            </AuthProvider>
          </I18nProvider>
          <SystemBars style="light" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
