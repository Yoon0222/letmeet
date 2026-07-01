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

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/contexts/auth';
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
    const inAuthGroup = first === '(auth)';
    const onConfigScreen = first === 'config-missing';

    if (!isSupabaseConfigured) {
      if (!onConfigScreen) router.replace('/config-missing');
      return;
    }
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && (inAuthGroup || onConfigScreen)) {
      router.replace('/(tabs)');
    }
  }, [session, initializing, segments, router]);

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
          <AuthProvider>
            <View style={{ flex: 1, backgroundColor: Colors[scheme].background }}>
              <RootNavigator />
            </View>
          </AuthProvider>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
