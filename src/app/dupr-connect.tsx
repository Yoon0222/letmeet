import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { useAuth } from '@/contexts/auth';
import { getDuprSsoConfig, verifyDupr } from '@/lib/dupr';
import { AppAlert as Alert } from '@/lib/feedback';

// DUPR 계정 연결(SSO). base64(clientKey)/ssoBase 는 서버(Supabase 시크릿)에서 받아
// web-admin/dupr-connect 페이지에 URL 로 넘긴다(웹에 키를 중복 저장하지 않음).
// 그 페이지가 DUPR 로그인 iframe 을 띄우고, 완료 시 duprId 를 postMessage 로 돌려준다.
const CONNECT_URL = process.env.EXPO_PUBLIC_DUPR_CONNECT_URL ?? 'https://pinut.org/dupr-connect';

export default function DuprConnectScreen() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const handled = useRef(false);
  const [saving, setSaving] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [configErr, setConfigErr] = useState<string | null>(null);

  // 서버에서 SSO 설정 받아 웹뷰 URL 구성
  useEffect(() => {
    (async () => {
      const cfg = await getDuprSsoConfig();
      if (!cfg) {
        setConfigErr('DUPR 연동이 아직 준비 중이에요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const q = `ck=${encodeURIComponent(cfg.clientKeyB64)}&sso=${encodeURIComponent(cfg.ssoBase)}`;
      setUri(`${CONNECT_URL}?${q}`);
    })();
  }, []);

  async function onMessage(e: WebViewMessageEvent) {
    if (handled.current) return;
    let data:
      | { type?: string; duprId?: string; id?: string; userToken?: string; refreshToken?: string; subscriptions?: unknown }
      | null = null;
    try {
      data = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    // DUPR SSO 는 6자리 duprId(공개 코드)를 준다. 없으면 내부 id 로 폴백.
    const candidate = data?.duprId ?? data?.id;
    if (data?.type !== 'dupr-sso' || !candidate) return;
    handled.current = true;
    setSaving(true);

    // 동의 완료 → 파트너 API 로 이제 조회 가능. 자격/토큰(SSO)도 함께 저장.
    const { ok, result, error } = await verifyDupr(candidate, true, {
      userToken: data.userToken,
      refreshToken: data.refreshToken,
      subscriptions: data.subscriptions,
    });
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
    // 레이팅이 아직 없는(NR) 계정도 연결은 성공 — 그에 맞는 안내.
    const doneMsg = parts.length
      ? `인증됐어요 · ${parts.join(' · ')}`
      : '인증됐어요 · 아직 DUPR 레이팅이 없어요(경기 후 반영)';
    setTimeout(() => Alert.alert('DUPR 연결 완료', doneMsg), 300);
  }

  if (configErr) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text style={styles.errText}>{configErr}</Text>
      </SafeAreaView>
    );
  }
  if (!uri) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color="#16C784" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <WebView
        source={{ uri }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.overlay}>
            <ActivityIndicator color="#16C784" />
          </View>
        )}
      />
      {saving ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#16C784" size="large" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  errText: { color: '#AAB4C0', fontSize: 15, textAlign: 'center', padding: 24 },
});
