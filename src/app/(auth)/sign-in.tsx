import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

export default function SignIn() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!email || !password) {
      Alert.alert('입력 확인', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // 성공 시 루트 가드가 (tabs) 로 이동시킴
    } catch (e: any) {
      Alert.alert('로그인 실패', translateError(e?.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <View style={[styles.logoBadge, { backgroundColor: theme.primary }]}>
              <Ionicons name="tennisball" size={34} color="#fff" />
            </View>
            <Text style={[styles.brand, { color: theme.text }]}>피클</Text>
            <Text style={[styles.tagline, { color: theme.textSecondary }]}>
              가까운 피클볼 메이트를 찾아보세요
            </Text>
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
              placeholder="••••••••"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <Button title="로그인" onPress={onSubmit} loading={loading} style={{ marginTop: 4 }} />
          </View>

          <View style={styles.footer}>
            <Text style={{ color: theme.textSecondary }}>아직 계정이 없으신가요? </Text>
            <Link href="/(auth)/sign-up" style={[styles.link, { color: theme.primary }]}>
              회원가입
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  safe: { flex: 1 },
  content: { flexGrow: 1, padding: Spacing.four, justifyContent: 'center', gap: Spacing.five },
  logo: { alignItems: 'center', gap: 10 },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  tagline: { fontSize: 15 },
  form: { gap: Spacing.three },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  link: { fontWeight: '700' },
});
