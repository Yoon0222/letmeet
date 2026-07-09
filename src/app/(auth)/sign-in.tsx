import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
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
import { useI18n } from '@/contexts/i18n';
import { useLoading } from '@/contexts/loading';
import type { TranslationKey } from '@/i18n/translations';

export default function SignIn() {
  const { t } = useI18n();
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
      Alert.alert(t('auth.kakaoFailed'), translateAuthError(e?.message, t));
    } finally {
      setKakaoLoading(false);
    }
  }

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert(t('auth.missingCredentialsTitle'), t('auth.missingCredentialsBody'));
      return;
    }
    setLoading(true);
    try {
      await withLoading(signIn(email.trim(), password));
    } catch (e: any) {
      Alert.alert(t('auth.signInFailed'), translateAuthError(e?.message, t));
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
            <Image
              source={require('@/assets/images/icon.png')}
              style={styles.logoBadge}
              resizeMode="cover"
            />
            <Text style={styles.brand}>{t('common.appName')}</Text>
            <Text style={styles.tagline}>{t('auth.signInSubtitle')}</Text>
          </View>

          <View style={styles.form}>
            <TextField
              label={t('auth.email')}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label={t('auth.password')}
              placeholder={t('auth.password')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Button title={t('auth.signIn')} onPress={onSubmit} loading={loading} style={{ marginTop: 8 }} />

            <View style={styles.socialArea}>
              <View style={styles.divider}>
                <View style={styles.line} />
                <Text style={styles.dividerText}>{t('auth.or')}</Text>
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
            <Text style={styles.footerText}>{t('auth.noAccount')} </Text>
            <Link href="/(auth)/sign-up" style={styles.link}>
              {t('auth.signUp')}
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

function translateAuthError(
  msg: string | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (!msg) return t('auth.errors.fallback');
  if (/invalid login credentials/i.test(msg)) return t('auth.errors.invalidLogin');
  if (/email not confirmed/i.test(msg)) return t('auth.errors.emailNotConfirmed');
  if (/already registered/i.test(msg)) return t('auth.errors.alreadyRegistered');
  if (/password should be at least/i.test(msg)) return t('auth.errors.shortPassword');
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
    overflow: 'hidden',
  },
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
