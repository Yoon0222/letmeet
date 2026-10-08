import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useRef, useState } from 'react';
import { InteractionManager, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { checkStoreUpdate } from '@/lib/store-update';
import { supabase } from '@/lib/supabase';
import type { AppConfig } from '@/lib/types';
import { isBelow } from '@/lib/version';

// 현재 앱(빌드) 버전. 스토어 배포본과 동일(app.json version).
const CURRENT = Constants.expoConfig?.version ?? '0.0.0';

// 스토어 링크 — app_config 값 우선, 비어 있으면 앱 설정(App Store ID / 패키지명)으로 만든다.
// ios_url 이 비어 있으면 iOS 강제 업데이트 화면에 버튼이 없어 막다른 화면이 되던 문제 방지.
function storeUrl(cfg: AppConfig): string {
  if (Platform.OS === 'ios') {
    if (cfg.ios_url) return cfg.ios_url;
    const appStoreId = Constants.expoConfig?.ios?.infoPlist?.AppStoreID;
    return appStoreId ? `https://apps.apple.com/app/id${appStoreId}` : '';
  }
  if (cfg.android_url) return cfg.android_url;
  const pkg = Constants.expoConfig?.android?.package;
  return pkg ? `https://play.google.com/store/apps/details?id=${pkg}` : '';
}

function openStore(cfg: AppConfig) {
  const url = storeUrl(cfg);
  if (url) Linking.openURL(url).catch(() => {});
}

// 앱 버전 게이트 — 실행 시 app_config 를 읽어 현재 버전과 비교.
//   min_version 미만 = 강제(차단 화면). 권장 안내는 스토어 체크(checkStoreUpdate)가 담당(latest_version 미사용).
export function UpdateGate({ children }: { children: React.ReactNode }) {
  const [forced, setForced] = useState<AppConfig | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 1) 강제 업데이트(cross-platform) — app_config.min_version 미만이면 차단.
      const { data } = await supabase.from('app_config').select('*').eq('id', 1).maybeSingle();
      if (!alive) return;
      const cfg = data as AppConfig | null;
      if (cfg && isBelow(CURRENT, cfg.min_version)) {
        setForced(cfg);
        return;
      }
      // 2) 강제가 아니면 → 스토어 인앱 업데이트 체크(권유). 네이티브 모듈 없으면 no-op.
      //    부팅/네비게이션 전환이 끝난 뒤 안내한다 — 전환 중 안내가 뜨면 iOS 에서 프리즈 위험.
      if (!checked.current) {
        checked.current = true;
        InteractionManager.runAfterInteractions(() => {
          void checkStoreUpdate();
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (forced) {
    const hasUrl = !!storeUrl(forced);
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
