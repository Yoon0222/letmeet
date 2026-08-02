import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '@/contexts/auth';
import { verifyDupr } from '@/lib/dupr';
import { AppAlert as Alert } from '@/lib/feedback';

// DUPR 계정 연결(SSO). web-admin/dupr-connect 페이지(DUPR 로그인 iframe)를 앱 안 WebView 로 열고,
// 로그인+동의 완료 시 페이지가 postMessage 로 보낸 duprId 를 받아 dupr-verify 로 레이팅을 저장한다.
const CONNECT_URL = process.env.EXPO_PUBLIC_DUPR_CONNECT_URL ?? 'https://pinut.org/dupr-connect';

export default function DuprConnectScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const handled = useRef(false);
  const [saving, setSaving] = useState(false);

  async function onMessage(e: WebViewMessageEvent) {
    if (handled.current) return;
    let data: { type?: string; duprId?: string } | null = null;
    try {
      data = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (data?.type !== 'dupr-sso' || !data.duprId) return;
    handled.current = true;
    setSaving(true);

    // 동의 완료 → 파트너 API 로 이제 레이팅 조회 가능. verified 로 저장.
    const { ok, result, error } = await verifyDupr(data.duprId, true);
    setSaving(false);
    if (!ok) {
      Alert.alert('DUPR 연결 실패', error ?? '다시 시도해 주세요.');
      router.back();
      return;
    }
    await refreshProfile();
    const parts = [
      result?.doubles != null ? `복식 ${result.doubles.toFixed(1)}` : null,
      result?.singles != null ? `단식 ${result.singles.toFixed(1)}` : null,
    ].filter(Boolean);
    router.back();
    setTimeout(() => Alert.alert('DUPR 연결 완료', parts.length ? `인증됐어요 · ${parts.join(' · ')}` : 'DUPR 계정이 연결됐어요.'), 300);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <WebView
        source={{ uri: CONNECT_URL }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator color="#16C784" />
          </View>
        )}
      />
      {saving ? (
        <View style={styles.center}>
          <ActivityIndicator color="#16C784" size="large" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.85)' },
});
