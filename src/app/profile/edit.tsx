import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { PEANUT_AVATARS, peanutFromUrl, peanutUrl } from '@/constants/avatars';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 갤러리에서 사진 선택 → Storage 업로드 → profiles.avatar_url 갱신
  async function pickAvatar() {
    const uid = session?.user.id;
    if (!uid || uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 올리려면 갤러리 접근 권한이 필요해요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled) return;
    const img = result.assets[0];
    setUploading(true);
    try {
      const ext = (img.uri.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${uid}/avatar_${Date.now()}.${ext}`;
      const arraybuffer = await fetch(img.uri).then((r) => r.arrayBuffer());
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, arraybuffer, { contentType: img.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: url, updated_at: new Date().toISOString() })
        .eq('id', uid);
      if (dbErr) throw dbErr;
      setAvatarUrl(url);
      await refreshProfile();
    } catch (e) {
      Alert.alert('사진 업로드 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setUploading(false);
    }
  }

  // 피넛 캐릭터 선택 → avatar_url 을 'peanut:NN' 으로 저장
  async function choosePeanut(index0: number) {
    const uid = session?.user.id;
    if (!uid || uploading) return;
    const val = peanutUrl(index0);
    setUploading(true);
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: val, updated_at: new Date().toISOString() })
      .eq('id', uid);
    setUploading(false);
    if (error) {
      Alert.alert('변경 실패', error.message);
      return;
    }
    setAvatarUrl(val);
    await refreshProfile();
  }

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
        <View style={styles.avatarWrap}>
          <Pressable onPress={pickAvatar} disabled={uploading}>
            <Avatar nickname={nickname || '?'} uri={avatarUrl} size={96} />
            <View style={[styles.avatarBadge, { backgroundColor: theme.primary, borderColor: theme.background }]}>
              <Ionicons name="camera" size={16} color="#fff" />
            </View>
          </Pressable>
          <Text onPress={pickAvatar} style={[styles.avatarText, { color: theme.primary }]}>
            {uploading ? '처리 중…' : '사진 올리기'}
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: theme.textSecondary }]}>피넛 캐릭터 선택</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}>
            {PEANUT_AVATARS.map((src, i) => {
              const selected = peanutFromUrl(avatarUrl) === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => choosePeanut(i)}
                  style={[styles.peanutCell, { borderColor: selected ? theme.primary : theme.border }]}>
                  <Image source={src} style={styles.peanutImg} contentFit="cover" />
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

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
  avatarWrap: { alignItems: 'center', gap: 8, marginBottom: Spacing.two },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '700', paddingVertical: 4, paddingHorizontal: 8 },
  peanutCell: { borderWidth: 2, borderRadius: 30, padding: 2 },
  peanutImg: { width: 52, height: 52, borderRadius: 26 },
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
