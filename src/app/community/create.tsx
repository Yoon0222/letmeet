import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { COMMUNITY_CATEGORIES } from '@/lib/community';
import { supabase } from '@/lib/supabase';
import type { CommunityCategory } from '@/lib/types';

const MAX_IMAGES = 5;

export default function CommunityCreate() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [category, setCategory] = useState<CommunityCategory>('free');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [images, setImages] = useState<string[]>([]); // 업로드 완료된 public URL
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function pickImages() {
    if (uploading || images.length >= MAX_IMAGES) return;
    let ImagePicker: typeof import('expo-image-picker');
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      ImagePicker = require('expo-image-picker');
    } catch {
      Alert.alert('사진 업로드', '이 기능은 최신 앱 빌드에서 사용할 수 있어요.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('권한 필요', '사진을 올리려면 갤러리 접근 권한이 필요해요.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.7,
    });
    if (result.canceled || !uid) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const img of result.assets) {
        const ext = (img.uri.split('.').pop() ?? 'jpg').toLowerCase();
        const path = `${uid}/${Date.now()}_${Math.round(img.fileSize ?? 0)}.${ext}`;
        const buf = await fetch(img.uri).then((r) => r.arrayBuffer());
        const { error: upErr } = await supabase.storage
          .from('community-images')
          .upload(path, buf, { contentType: img.mimeType ?? 'image/jpeg', upsert: true });
        if (upErr) throw upErr;
        urls.push(supabase.storage.from('community-images').getPublicUrl(path).data.publicUrl);
      }
      setImages((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch (e) {
      Alert.alert('사진 업로드 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(url: string) {
    setImages((prev) => prev.filter((u) => u !== url));
  }

  async function submit() {
    if (!uid) return;
    const t = title.trim();
    if (!t) {
      Alert.alert('제목을 입력해주세요');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .insert({ author_id: uid, category, title: t, body: body.trim(), images })
        .select('id')
        .single();
      if (error) throw error;
      router.replace(`/community/${data.id}` as never);
    } catch (e) {
      Alert.alert('등록 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 카테고리 */}
          <Text style={styles.label}>카테고리</Text>
          <View style={styles.cats}>
            {COMMUNITY_CATEGORIES.map((c) => {
              const active = category === c.key;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  style={[styles.cat, active && { backgroundColor: c.bg, borderColor: c.color }]}>
                  <Ionicons name={c.icon} size={14} color={active ? c.color : '#9CA3AF'} />
                  <Text style={[styles.catText, active && { color: c.color }]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* 제목 */}
          <Text style={styles.label}>제목</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="제목을 입력하세요"
            placeholderTextColor="#9CA3AF"
            style={styles.titleInput}
            maxLength={100}
          />

          {/* 본문 */}
          <Text style={styles.label}>내용</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="자유롭게 이야기해보세요"
            placeholderTextColor="#9CA3AF"
            style={styles.bodyInput}
            multiline
            textAlignVertical="top"
          />

          {/* 사진 */}
          <Text style={styles.label}>사진 (최대 {MAX_IMAGES}장)</Text>
          <View style={styles.imageRow}>
            {images.map((url) => (
              <View key={url} style={styles.imageWrap}>
                <Image source={{ uri: url }} style={styles.image} />
                <Pressable onPress={() => removeImage(url)} style={styles.imageRemove} hitSlop={6}>
                  <Ionicons name="close" size={14} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
            {images.length < MAX_IMAGES ? (
              <Pressable onPress={pickImages} disabled={uploading} style={styles.imageAdd}>
                {uploading ? (
                  <ActivityIndicator color="#16C784" />
                ) : (
                  <>
                    <Ionicons name="camera-outline" size={22} color="#9CA3AF" />
                    <Text style={styles.imageAddText}>추가</Text>
                  </>
                )}
              </Pressable>
            ) : null}
          </View>

          <Button
            title={saving ? '등록 중…' : '등록'}
            onPress={submit}
            disabled={saving || uploading || !title.trim()}
            style={{ marginTop: Spacing.four }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: Spacing.four, gap: 8, paddingBottom: 40 },
  label: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: Spacing.three },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  catText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  titleInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    height: 50,
  },
  bodyInput: {
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 14,
    minHeight: 160,
  },
  imageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  imageWrap: { position: 'relative' },
  image: { width: 84, height: 84, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#F3F4F6' },
  imageRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAdd: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  imageAddText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
});
