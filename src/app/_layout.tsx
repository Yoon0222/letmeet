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

  useEffect(() => {
    if (initializing) return;

    const first = segments[0] as string | undefined;
    const second = segments[1] as string | undefined;
    const inAuthGroup = first === '(auth)';
    const onConfigScreen = first === 'config-missing';
    const needsAccount =
      (first === '(tabs)' && second === 'profile') ||
      (first === 'profile' && second === 'edit') ||
      (first === 'meetup' && second === 'create') ||
      (first === 'club' && second === 'create') ||
      (first === 'court' && second === 'reservations');

    if (!isSupabaseConfigured) {
      if (!onConfigScreen) router.replace('/config-missing');
      return;
    }
    if (!session && needsAccount) {
      router.replace('/(auth)/sign-in');
    } else if (session && (inAuthGroup || onConfigScreen)) {
      router.replace('/(tabs)');
    }
  }, [session, initializing, segments, router]);

  // 앱 부팅(세션 확인) 중에는 피넛 브랜드 스플래시를 띄운다
  if (initializing) {
    return <BootScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="config-missing" />
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
      <Stack.Screen name="court/index" options={{ headerShown: true, title: '코트 예약' }} />
      <Stack.Screen name="court/reservations" options={{ headerShown: true, title: '내 예약' }} />
      <Stack.Screen name="court/[id]" options={{ headerShown: true, title: '코트' }} />
      <Stack.Screen
        name="profile/edit"
        options={{ presentation: 'modal', headerShown: true, title: '프로필 수정' }}
      />
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
