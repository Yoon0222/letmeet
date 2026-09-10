import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';

// 입력값에서 숫자만 추출
function digitsOf(v: string) {
  return v.replace(/\D/g, '').slice(0, 11);
}

// 010-1234-5678 형태로 표시 포맷
function formatPhone(digits: string) {
  const d = digits.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 한국 휴대폰: 01[0/1/6/7/8/9] + 7~8자리 (총 10~11자리)
function isValidMobile(digits: string) {
  return /^01[016789]\d{7,8}$/.test(digits);
}

export default function OnboardingPhone() {
  const { session, refreshProfile, signOut } = useAuth();
  const [digits, setDigits] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = useMemo(() => isValidMobile(digits), [digits]);

  async function onSave() {
    const uid = session?.user.id;
    if (!uid || saving) return;
    if (!valid) {
      Alert.alert('전화번호 확인', '올바른 휴대폰 번호를 입력해 주세요. (예: 010-1234-5678)');
      return;
    }
    setSaving(true);
    // 본인 전용 테이블에 저장(없으면 생성) — 숫자만 저장
    const { error } = await supabase
      .from('user_contact')
      .upsert({ id: uid, phone: digits, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      Alert.alert('저장 실패', error.message);
      return;
    }
    // 게이트 해제 — refreshProfile 이 phone 을 다시 읽어 온보딩을 닫는다
    await refreshProfile();
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Ionicons name="call" size={26} color="#16C784" />
          </View>
          <Text style={styles.title}>전화번호를 입력해 주세요</Text>
          <Text style={styles.subtitle}>
            경기·예약 안내와 본인 확인을 위해 한 번만 등록하면 돼요.{'\n'}
            다른 사람에게는 공개되지 않아요.
          </Text>

          <View style={styles.fieldWrap}>
            <TextField
              label="휴대폰 번호"
              value={formatPhone(digits)}
              onChangeText={(v) => setDigits(digitsOf(v))}
              keyboardType="number-pad"
              placeholder="010-1234-5678"
              maxLength={13}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={onSave}
            />
            <View style={styles.privacyRow}>
              <Ionicons name="lock-closed" size={13} color="#707B87" />
              <Text style={styles.privacyText}>비공개 · 본인만 볼 수 있어요</Text>
            </View>
          </View>

          <View style={styles.spacer} />

          <Button title="확인" onPress={onSave} loading={saving} disabled={!valid} />
          <Text onPress={signOut} style={styles.signout}>
            다른 계정으로 로그인
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#070A0D' },
  content: { flex: 1, padding: Spacing.four, gap: Spacing.two },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(22,199,132,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  title: { fontSize: 24, fontWeight: '800', color: '#F8FAFC' },
  subtitle: { fontSize: 14, color: '#AAB4C0', lineHeight: 21, marginTop: 4 },
  fieldWrap: { marginTop: Spacing.four, gap: 8 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 2 },
  privacyText: { fontSize: 13, color: '#707B87' },
  spacer: { flex: 1 },
  signout: {
    textAlign: 'center',
    color: '#707B87',
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: Spacing.two,
    marginTop: Spacing.one,
  },
});
