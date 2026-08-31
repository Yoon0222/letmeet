import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { AppConfig } from '@/lib/types';
import { isBelow } from '@/lib/version';

// 현재 앱(빌드) 버전. 스토어 배포본과 동일(app.json version).
const CURRENT = Constants.expoConfig?.version ?? '0.0.0';

function openStore(cfg: AppConfig) {
  const url = Platform.OS === 'ios' ? cfg.ios_url : cfg.android_url;
  if (url) Linking.openURL(url).catch(() => {});
}

// 앱 버전 게이트 — 실행 시 app_config 를 읽어 현재 버전과 비교.
//   min_version 미만 = 강제(차단 화면), latest_version 미만 = 권장(1회 안내). 기본값이면 아무것도 안 함.
export function UpdateGate({ children }: { children: React.ReactNode }) {
  const [forced, setForced] = useState<AppConfig | null>(null);
  const softShown = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from('app_config').select('*').eq('id', 1).maybeSingle();
      if (!alive || !data) return;
      const cfg = data as AppConfig;
      if (isBelow(CURRENT, cfg.min_version)) {
        setForced(cfg);
      } else if (isBelow(CURRENT, cfg.latest_version) && !softShown.current) {
        softShown.current = true;
        Alert.alert(
          '새 버전이 있어요',
          cfg.notice || '더 나은 사용을 위해 최신 버전으로 업데이트해 주세요.',
          [
            { text: '나중에', style: 'cancel' },
            { text: '업데이트', onPress: () => openStore(cfg) },
          ],
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (forced) {
    const hasUrl = !!(Platform.OS === 'ios' ? forced.ios_url : forced.android_url);
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="rocket-outline" size={44} color="#16C784" />
          </View>
          <Text style={styles.title}>업데이트가 필요해요</Text>
          <Text style={styles.body}>{forced.notice || '원활한 사용을 위해 최신 버전으로 업데이트해 주세요.'}</Text>
          {hasUrl ? (
            <Pressable style={styles.btn} onPress={() => openStore(forced)}>
              <Text style={styles.btnTxt}>지금 업데이트</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,199,132,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.22)',
    marginBottom: 8,
  },
  title: { color: '#F8FAFC', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { color: '#AAB4C0', fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  btn: {
    marginTop: 12,
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#16C784',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: { color: '#07100D', fontSize: 16, fontWeight: '900' },
});
