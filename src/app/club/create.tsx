import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useLoading } from '@/contexts/loading';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function CreateClub() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { show, hide } = useLoading();

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit() {
    if (!name.trim()) {
      Alert.alert('입력 확인', '클럽 이름을 입력해주세요.');
      return;
    }
    if (!session?.user.id) return;
    setSaving(true);
    show();
    const { data, error } = await supabase
      .from('clubs')
      .insert({
        owner_id: session.user.id,
        name: name.trim(),
        region: region.trim(),
        description: description.trim(),
      })
      .select('id')
      .single();
    setSaving(false);
    hide();
    if (error) {
      Alert.alert('생성 실패', error.message);
      return;
    }
    router.replace(`/club/${data.id}`);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="클럽 이름"
          value={name}
          onChangeText={setName}
          placeholder="예: 송파 피클볼 클럽"
          maxLength={30}
        />
        <TextField
          label="활동 지역"
          value={region}
          onChangeText={setRegion}
          placeholder="예: 서울 송파구"
        />
        <TextField
          label="소개 (선택)"
          value={description}
          onChangeText={setDescription}
          placeholder="클럽 소개, 정기 모임 시간, 회비 등"
          multiline
          maxLength={300}
          style={{ minHeight: 110, textAlignVertical: 'top' }}
        />
        <Button title="클럽 만들기" onPress={onSubmit} loading={saving} style={{ marginTop: Spacing.two }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
});
