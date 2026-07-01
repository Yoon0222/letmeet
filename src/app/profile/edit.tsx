import { useRouter } from 'expo-router';
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

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { PLAY_STYLE_LABELS, type PlayStyle } from '@/lib/types';

export default function EditProfile() {
  const theme = useTheme();
  const router = useRouter();
  const { session, profile, refreshProfile } = useAuth();

  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [skill, setSkill] = useState(profile?.skill_level ?? 3.5);
  const [region, setRegion] = useState(profile?.region ?? '');
  const [style, setStyle] = useState<PlayStyle>(profile?.play_style ?? 'all');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [duprId, setDuprId] = useState(profile?.dupr_id ?? '');
  const [saving, setSaving] = useState(false);

  function adjustSkill(delta: number) {
    setSkill((s) => Math.min(8, Math.max(2, Math.round((s + delta) * 10) / 10)));
  }

  async function onSave() {
    if (!nickname.trim()) {
      Alert.alert('닉네임', '닉네임을 입력해주세요.');
      return;
    }
    if (!session?.user.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        nickname: nickname.trim(),
        skill_level: skill,
        region: region.trim(),
        play_style: style,
        bio: bio.trim(),
        dupr_id: duprId.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.user.id);
    setSaving(false);
    if (error) {
      Alert.alert('저장 실패', error.message);
      return;
    }
    await refreshProfile();
    router.back();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="닉네임"
          value={nickname}
          onChangeText={setNickname}
          maxLength={20}
          placeholder="닉네임"
        />

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>실력 (DUPR 기준)</Text>
          <View style={[styles.skillRow, { backgroundColor: theme.backgroundElement }]}>
            <Pressable onPress={() => adjustSkill(-0.5)} style={styles.stepBtn}>
              <Text style={[styles.stepTxt, { color: theme.primary }]}>−</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.skillVal, { color: theme.text }]}>{skill.toFixed(1)}</Text>
              <Text style={[styles.skillLbl, { color: theme.textSecondary }]}>{skillLabel(skill)}</Text>
            </View>
            <Pressable onPress={() => adjustSkill(0.5)} style={styles.stepBtn}>
              <Text style={[styles.stepTxt, { color: theme.primary }]}>+</Text>
            </Pressable>
          </View>
        </View>

        <TextField
          label="활동 지역"
          value={region}
          onChangeText={setRegion}
          placeholder="예: 서울 강남구"
          hint="같은 지역 플레이어와 모임을 우선 추천해드려요"
        />

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>플레이 스타일</Text>
          <View style={styles.styleRow}>
            {(Object.keys(PLAY_STYLE_LABELS) as PlayStyle[]).map((s) => {
              const active = style === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setStyle(s)}
                  style={[
                    styles.styleBtn,
                    {
                      backgroundColor: active ? theme.primary : theme.backgroundElement,
                    },
                  ]}>
                  <Text style={{ color: active ? '#fff' : theme.textSecondary, fontWeight: '700' }}>
                    {PLAY_STYLE_LABELS[s]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <TextField
          label="소개"
          value={bio}
          onChangeText={setBio}
          placeholder="간단한 자기소개 (선택)"
          multiline
          maxLength={150}
          style={{ minHeight: 90, textAlignVertical: 'top' }}
        />

        <TextField
          label="DUPR ID (선택)"
          value={duprId}
          onChangeText={setDuprId}
          placeholder="예: 1234567"
          autoCapitalize="none"
          hint="지금은 표시용이며, 추후 DUPR 연동 시 자동으로 검증됩니다"
        />

        <Button title="저장" onPress={onSave} loading={saving} style={{ marginTop: Spacing.two }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', marginLeft: 2 },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  stepBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 28, fontWeight: '800' },
  skillVal: { fontSize: 26, fontWeight: '800' },
  skillLbl: { fontSize: 12, fontWeight: '600' },
  styleRow: { flexDirection: 'row', gap: 8 },
  styleBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});
