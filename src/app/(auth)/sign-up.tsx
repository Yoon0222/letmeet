import { useRouter } from 'expo-router';
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

import { translateError } from '@/app/(auth)/sign-in';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';

export default function SignUp() {
  const router = useRouter();
  const { signUp, signIn } = useAuth();
  const { show, hide } = useLoading();
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    if (!nickname.trim() || !email.trim() || !password) {
      Alert.alert('입력 확인', '모든 항목을 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('비밀번호', '비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('비밀번호 확인', '비밀번호가 일치하지 않아요. 다시 확인해주세요.');
      return;
    }
    setLoading(true);
    show();
    try {
      await signUp(email.trim(), password, nickname.trim());
      try {
        await signIn(email.trim(), password);
      } catch {
        Alert.alert(
          '가입 완료',
          '이메일 인증이 필요할 수 있어요. 메일함을 확인한 뒤 로그인해주세요.',
          [{ text: '확인', onPress: () => router.replace('/(auth)/sign-in') }],
        );
      }
    } catch (e: any) {
      Alert.alert('회원가입 실패', translateError(e?.message));
    } finally {
      setLoading(false);
      hide();
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>회원가입</Text>
            <Text style={styles.sub}>피클볼 커뮤니티에 합류하세요</Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="닉네임"
              placeholder="코트에서 불릴 이름"
              value={nickname}
              onChangeText={setNickname}
              maxLength={20}
            />
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
              placeholder="6자 이상"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TextField
              label="비밀번호 확인"
              placeholder="비밀번호를 다시 입력"
              secureTextEntry
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              hint={passwordConfirm.length > 0 && password !== passwordConfirm ? '비밀번호가 일치하지 않아요' : undefined}
            />
            <Button title="가입하기" onPress={onSubmit} loading={loading} style={{ marginTop: 8 }} />
          </View>

          <Button title="로그인으로 돌아가기" variant="outline" onPress={() => router.back()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { flexGrow: 1, padding: Spacing.four, justifyContent: 'center', gap: Spacing.four },
  header: { gap: 8 },
  title: { fontSize: 34, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
  form: { gap: Spacing.three },
});
