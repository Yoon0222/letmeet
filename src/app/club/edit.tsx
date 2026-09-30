import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { Club } from '@/lib/types';

export default function EditClub() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clubId) return;
    const { data } = await supabase.from('clubs').select('*').eq('id', clubId).maybeSingle();
    const nextClub = data as Club | null;
    if (!nextClub || nextClub.owner_id !== session?.user.id) {
      Alert.alert('접근할 수 없어요', '클럽장만 클럽 정보를 수정할 수 있어요.', [{ text: '확인', onPress: () => router.back() }]);
      setLoading(false);
      return;
    }
    setClub(nextClub);
    setName(nextClub.name);
    setRegion(nextClub.region);
    setDescription(nextClub.description);
    setLoading(false);
  }, [clubId, router, session?.user.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function save() {
    if (!clubId || !club) return;
    if (!name.trim()) {
      Alert.alert('입력 확인', '클럽 이름을 입력해주세요.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('clubs').update({
      name: name.trim(),
      region: region.trim(),
      description: description.trim(),
    }).eq('id', clubId).eq('owner_id', session?.user.id ?? '');
    setSaving(false);
    if (error) {
      Alert.alert('저장 실패', error.message);
      return;
    }
    Alert.alert('저장 완료', '클럽 정보가 변경됐어요.', [{ text: '확인', onPress: () => router.back() }]);
  }

  function confirmDelete() {
    Alert.alert('클럽 삭제', '클럽의 회원, 게시글, 일정과 경기 기록이 모두 삭제되며 되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '클럽 삭제',
        style: 'destructive',
        onPress: async () => {
          if (!clubId) return;
          const { error } = await supabase.from('clubs').delete().eq('id', clubId).eq('owner_id', session?.user.id ?? '');
          if (error) {
            Alert.alert('삭제 실패', error.message);
            return;
          }
          router.dismissAll();
          router.replace('/(tabs)/clubs');
        },
      },
    ]);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }

  if (!club) return null;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <TextField label="클럽 이름" value={name} onChangeText={setName} maxLength={30} />
            <TextField label="활동 지역" value={region} onChangeText={setRegion} placeholder="예: 서울 송파구" />
            <TextField
              label="클럽 소개"
              value={description}
              onChangeText={setDescription}
              placeholder="클럽 소개, 정기 모임 시간, 회비 등"
              multiline
              maxLength={300}
              style={styles.descriptionInput}
            />
            <Button title="변경사항 저장" onPress={save} loading={saving} />
          </View>

          <View style={styles.dangerSection}>
            <Text style={styles.dangerTitle}>위험 작업</Text>
            <Text style={styles.dangerDescription}>클럽 삭제 시 모든 클럽 데이터가 함께 삭제되며 복구할 수 없어요.</Text>
            <Button title="클럽 삭제" variant="danger" onPress={confirmDelete} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.five, paddingBottom: 60 },
  form: { gap: Spacing.three },
  descriptionInput: { minHeight: 120, textAlignVertical: 'top' },
  dangerSection: { gap: 10, paddingTop: Spacing.four, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)' },
  dangerTitle: { color: '#DC2626', fontSize: 16, fontWeight: '900' },
  dangerDescription: { color: '#AAB4C0', fontSize: 13, lineHeight: 19, fontWeight: '600', marginBottom: 4 },
});
