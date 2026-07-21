import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';

// 네이티브 소셜 로그인(구글·카카오) 복귀 처리.
// 로그인 후 pickleball://auth-callback?code=... 로 앱이 열리면 여기서 code 를 세션으로 교환한다.
// (웹은 detectSessionInUrl 이 자동 처리하므로 이 화면을 거치지 않는다)
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      try {
        const code = typeof params.code === 'string' ? params.code : undefined;
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } catch {
        // 실패해도 로그인 화면/홈으로 보내 사용자가 다시 시도할 수 있게
      } finally {
        router.replace('/(tabs)');
      }
    })();
  }, [params.code, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator color="#16C784" />
      <Text style={styles.text}>로그인 중…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F6F7F9' },
  text: { fontSize: 15, color: '#6B7280' },
});
