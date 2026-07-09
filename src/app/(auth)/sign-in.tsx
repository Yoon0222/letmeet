import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { KakaoButton } from '@/components/ui/kakao-button';
import { TextField } from '@/components/ui/text-field';
import { KAKAO_LOGIN_ENABLED } from '@/constants/features';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';

export default function SignIn() {
  const { signIn, signInWithKakao } = useAuth();
  const { withLoading } = useLoading();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);

  async function onKakao() {
    setKakaoLoading(true);
    try {
      await withLoading(signInWithKakao());
    } catch (e: any) {
      Alert.alert('카카오 로그인 실패', translateError(e?.message));
    } finally {
      setKakaoLoading(false);
    }
  }

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert('입력 확인', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      await withLoading(signIn(email.trim(), password));
    } catch (e: any) {
      Alert.alert('로그인 실패', translateError(e?.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoText}>P!</Text>
            </View>
            <Text style={styles.brand}>P!NUT</Text>
            <Text style={styles.tagline}>가까운 피클볼 메이트를 찾아보세요</Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="이메일"
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label="비밀번호"
              placeholder="비밀번호"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Button title="로그인" onPress={onSubmit} loading={loading} style={{ marginTop: 8 }} />

            <View style={styles.socialArea}>
              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>또는</Text>
                <View style={styles.line} />
              </View>
              <View style={styles.socialRow}>
                <SocialButton icon="logo-apple" />
                <SocialButton icon="logo-google" />
                {KAKAO_LOGIN_ENABLED ? null : <SocialButton icon="chatbubble-ellipses-outline" />}
              </View>
              {KAKAO_LOGIN_ENABLED ? <KakaoButton onPress={onKakao} loading={kakaoLoading} /> : null}
            </View>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>아직 계정이 없으신가요? </Text>
            <Link href="/(auth)/sign-up" style={styles.link}>
              회원가입
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SocialButton({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable style={styles.socialBtn}>
      <Ionicons name={icon} size={20} color="#111827" />
    </Pressable>
  );
}

export function translateError(msg?: string): string {
  if (!msg) return '잠시 후 다시 시도해주세요.';
  if (/invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/email not confirmed/i.test(msg)) return '이메일 인증이 필요합니다. 메일함을 확인해주세요.';
  if (/already registered/i.test(msg)) return '이미 가입된 이메일입니다.';
  if (/password should be at least/i.test(msg)) return '비밀번호는 6자 이상이어야 합니다.';
  return msg;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { flexGrow: 1, padding: Spacing.four, justifyContent: 'center', gap: Spacing.five },
  logo: { alignItems: 'center', gap: 8 },
  logoBadge: {
    width: 82,
    height: 82,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: '#16C784',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 34, fontWeight: '900', color: '#FFFFFF' },
  brand: { fontSize: 34, fontWeight: '900', color: '#111827' },
  tagline: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  form: { gap: Spacing.three },
  socialArea: { gap: Spacing.three, marginTop: 8 },
  socialRow: { flexDirection: 'row', gap: 16 },
  socialBtn: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 13, color: '#9CA3AF' },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#6B7280' },
  link: { fontWeight: '700', color: '#16C784' },
});
