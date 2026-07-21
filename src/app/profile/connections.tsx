import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { UserIdentity } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APPLE_LOGIN_ENABLED, GOOGLE_LOGIN_ENABLED, KAKAO_LOGIN_ENABLED } from '@/constants/features';
import { Spacing } from '@/constants/theme';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';

type LinkableProvider = 'google' | 'kakao';

type Row = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** OAuth 로 새로 연결 가능한지 (이메일·애플은 여기서 추가 불가) */
  linkProvider: LinkableProvider | null;
  /** 설정에서 켜졌거나 이미 연결된 경우에만 노출 */
  enabled: boolean;
};

export default function Connections() {
  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getUserIdentities();
    setIdentities(data?.identities ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const connected = (key: string) => identities.some((i) => i.provider === key);
  const canUnlink = identities.length > 1; // 마지막 로그인 수단은 해제 불가

  async function link(provider: LinkableProvider) {
    setBusy(provider);
    try {
      if (Platform.OS === 'web') {
        const { error } = await supabase.auth.linkIdentity({
          provider,
          options: { redirectTo: window.location.origin + '/profile/connections' },
        });
        if (error) throw error;
        return; // 웹은 리다이렉트로 떠남
      }
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.linkIdentity({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      if (data?.url) {
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type === 'success' && res.url) {
          const code = Linking.parse(res.url).queryParams?.code;
          if (typeof code === 'string') await supabase.auth.exchangeCodeForSession(code);
        }
      }
      load();
    } catch (e) {
      Alert.alert('연결 실패', e instanceof Error ? e.message : '잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(null);
    }
  }

  function confirmUnlink(identity: UserIdentity, label: string) {
    if (!canUnlink) {
      Alert.alert('해제 불가', '로그인 수단이 하나뿐이라 해제할 수 없어요. 다른 로그인을 먼저 연결해주세요.');
      return;
    }
    confirmDestructive('연결 해제', `${label} 로그인 연결을 해제할까요?`, '해제', async () => {
      setBusy(identity.provider);
      const { error } = await supabase.auth.unlinkIdentity(identity);
      setBusy(null);
      if (error) {
        Alert.alert('해제 실패', error.message);
        return;
      }
      load();
    });
  }

  const rows: Row[] = [
    { key: 'email', label: '이메일', icon: 'mail-outline', color: '#6B7280', linkProvider: null, enabled: true },
    { key: 'google', label: '구글', icon: 'logo-google', color: '#111827', linkProvider: 'google', enabled: GOOGLE_LOGIN_ENABLED },
    { key: 'apple', label: '애플', icon: 'logo-apple', color: '#111827', linkProvider: null, enabled: APPLE_LOGIN_ENABLED },
    { key: 'kakao', label: '카카오', icon: 'chatbubble-ellipses-outline', color: '#3C1E1E', linkProvider: 'kakao', enabled: KAKAO_LOGIN_ENABLED },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.desc}>이 계정에 연결된 로그인 수단이에요. 여러 개를 연결하면 어느 방법으로든 같은 계정으로 로그인할 수 있어요.</Text>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color="#16C784" /></View>
        ) : (
          <View style={{ gap: Spacing.three }}>
            {rows
              .filter((r) => r.enabled || connected(r.key))
              .map((r) => {
                const isOn = connected(r.key);
                const identity = identities.find((i) => i.provider === r.key);
                return (
                  <View key={r.key} style={styles.row}>
                    <View style={styles.iconWrap}>
                      <Ionicons name={r.icon} size={20} color={r.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.label}>{r.label}</Text>
                      <Text style={[styles.state, isOn && styles.stateOn]}>{isOn ? '연결됨' : '연결 안 됨'}</Text>
                    </View>
                    {isOn ? (
                      identity && (r.key !== 'email' || canUnlink) ? (
                        <Pressable onPress={() => confirmUnlink(identity, r.label)} disabled={busy === r.key} hitSlop={8}>
                          <Text style={styles.unlink}>해제</Text>
                        </Pressable>
                      ) : (
                        <Ionicons name="checkmark-circle" size={22} color="#16C784" />
                      )
                    ) : r.linkProvider ? (
                      <Pressable onPress={() => link(r.linkProvider!)} disabled={busy === r.key} style={styles.linkBtn}>
                        <Text style={styles.linkText}>{busy === r.key ? '연결 중…' : '연결하기'}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
          </View>
        )}

        <Text style={styles.hint}>· 로그인 수단이 하나뿐이면 해제할 수 없어요.{'\n'}· 같은 이메일이면 자동으로 한 계정으로 연결돼요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 40 },
  center: { paddingVertical: 40, alignItems: 'center' },
  desc: { fontSize: 14, lineHeight: 20, color: '#6B7280' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: Spacing.three,
  },
  iconWrap: { width: 40, height: 40, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#F6F7F9', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '700', color: '#111827' },
  state: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  stateOn: { color: '#16C784', fontWeight: '600' },
  linkBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#16C784' },
  linkText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  unlink: { fontSize: 13, fontWeight: '700', color: '#E5484D', padding: 6 },
  hint: { fontSize: 12, lineHeight: 18, color: '#9CA3AF', marginTop: 4 },
});
