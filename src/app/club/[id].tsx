import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ReportBlock } from '@/components/report-block';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { ClubMemberWithProfile, ClubWithCounts } from '@/lib/types';

export default function ClubDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [club, setClub] = useState<ClubWithCounts | null>(null);
  const [members, setMembers] = useState<ClubMemberWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('club_members')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('club_id', id)
        .order('joined_at', { ascending: true }),
    ]);
    setClub(c ?? null);
    setMembers((m as unknown as ClubMemberWithProfile[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isOwner = club?.owner_id === uid;
  const myMembership = members.find((m) => m.user_id === uid);
  const isApprovedMember = myMembership?.status === 'approved';
  const isPending = myMembership?.status === 'pending';
  const approved = members.filter((m) => m.status === 'approved');
  const pending = members.filter((m) => m.status === 'pending');

  useEffect(() => {
    navigation.setOptions({
      title: club?.name ?? '클럽',
      headerRight:
        club && !isOwner
          ? () => <ReportBlock targetType="club" targetId={club.id} targetUserId={club.owner_id} targetLabel={club.name} onBlocked={() => router.back()} />
          : undefined,
    });
  }, [navigation, club, isOwner, router]);

  async function join() {
    if (!uid || !id || !club) return;
    setActing(true);
    // 승인 필요 클럽이면 pending, 아니면 즉시 approved
    const { error } = await supabase
      .from('club_members')
      .insert({ club_id: id, user_id: uid, status: club.require_approval ? 'pending' : 'approved' });
    setActing(false);
    if (error) {
      Alert.alert('가입 실패', error.message);
      return;
    }
    if (club.require_approval) Alert.alert('가입 신청 완료', '운영자 승인 후 가입돼요.');
    load();
  }

  async function leave() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase.from('club_members').delete().eq('club_id', id).eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('취소 실패', error.message);
      return;
    }
    load();
  }

  function confirmLeave() {
    Alert.alert(isPending ? '가입 신청 취소' : '클럽 탈퇴', isPending ? '가입 신청을 취소할까요?' : '이 클럽에서 나갈까요?', [
      { text: '닫기', style: 'cancel' },
      { text: isPending ? '신청 취소' : '탈퇴', style: 'destructive', onPress: leave },
    ]);
  }

  // 운영자: 가입 요청 승인/거절
  async function approve(userId: string) {
    if (!id) return;
    await supabase.from('club_members').update({ status: 'approved' }).eq('club_id', id).eq('user_id', userId);
    load();
  }
  async function reject(userId: string) {
    if (!id) return;
    await supabase.from('club_members').delete().eq('club_id', id).eq('user_id', userId);
    load();
  }

  function confirmDelete() {
    Alert.alert('클럽 삭제', '클럽을 삭제하면 되돌릴 수 없어요. 진행할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await supabase.from('clubs').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  // 운영자: 클럽 대표 사진 업로드/변경
  async function pickPhoto() {
    if (!isOwner || !id || uploading) return;
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.7 });
    if (result.canceled) return;
    const img = result.assets[0];
    setUploading(true);
    try {
      const ext = (img.uri.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${id}/cover_${Date.now()}.${ext}`;
      const buf = await fetch(img.uri).then((r) => r.arrayBuffer());
      const { error: upErr } = await supabase.storage.from('club-images').upload(path, buf, { contentType: img.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from('club-images').getPublicUrl(path).data.publicUrl;
      const { error: dbErr } = await supabase.from('clubs').update({ image_url: url }).eq('id', id);
      if (dbErr) throw dbErr;
      load();
    } catch (e) {
      Alert.alert('사진 업로드 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }
  if (!club) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>클럽을 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 대표 사진 (있으면 표시, 운영자는 탭해서 변경) */}
        {club.image_url ? (
          <Pressable onPress={pickPhoto} disabled={!isOwner || uploading}>
            <Image source={{ uri: club.image_url }} style={styles.cover} />
            {isOwner ? (
              <View style={styles.coverEdit}>
                <Ionicons name="camera" size={14} color="#fff" />
                <Text style={styles.coverEditText}>{uploading ? '올리는 중…' : '사진 변경'}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : isOwner ? (
          <Pressable onPress={pickPhoto} disabled={uploading} style={styles.coverEmpty}>
            <Ionicons name="image-outline" size={22} color="#16C784" />
            <Text style={styles.coverEmptyText}>{uploading ? '올리는 중…' : '클럽 대표 사진 추가'}</Text>
          </Pressable>
        ) : null}

        <View style={styles.titleRow}>
          <View style={styles.icon}>
            <Ionicons name="people" size={26} color="#16C784" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{club.name}</Text>
            <Text style={styles.meta}>
              {club.region || '지역 미설정'} · 멤버 {club.member_count}명
              {club.require_approval ? ' · 승인제' : ''}
            </Text>
          </View>
        </View>

        {club.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>소개</Text>
            <Text style={styles.desc}>{club.description}</Text>
          </View>
        ) : null}

        {/* 운영자: 가입 요청 대기 목록 */}
        {isOwner && pending.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>가입 요청 {pending.length}명</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((m) => (
                <View key={m.user_id} style={styles.mRow}>
                  <Avatar nickname={m.profiles?.nickname ?? '?'} uri={m.profiles?.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mName}>{m.profiles?.nickname ?? '알 수 없음'}</Text>
                    <Text style={styles.mMeta}>{m.profiles?.region || '지역 미설정'}</Text>
                  </View>
                  <Pressable onPress={() => approve(m.user_id)} style={styles.approveBtn}>
                    <Text style={styles.approveText}>승인</Text>
                  </Pressable>
                  <Pressable onPress={() => reject(m.user_id)} style={styles.rejectBtn}>
                    <Text style={styles.rejectText}>거절</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>멤버 {approved.length}명</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {approved.map((m) => (
              <View key={m.user_id} style={styles.mRow}>
                <Avatar nickname={m.profiles?.nickname ?? '?'} uri={m.profiles?.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.mNameRow}>
                    <Text style={styles.mName}>{m.profiles?.nickname ?? '알 수 없음'}</Text>
                    {m.role === 'owner' && <Badge label="운영자" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                  </View>
                  <Text style={styles.mMeta}>{m.profiles?.region || '지역 미설정'}</Text>
                </View>
                <Text style={styles.mSkill}>
                  {m.profiles ? `${m.profiles.skill_level.toFixed(1)} ${skillLabel(m.profiles.skill_level)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {isOwner ? (
          <Button title="클럽 삭제" variant="danger" onPress={confirmDelete} />
        ) : isPending ? (
          <Button title="가입 신청 취소 (승인 대기 중)" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : isApprovedMember ? (
          <Button title="클럽 탈퇴" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : (
          <Button title={club.require_approval ? '가입 신청하기' : '클럽 가입하기'} onPress={join} loading={acting} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F7F9' },
  notFound: { color: '#6B7280', fontSize: 15 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  cover: { width: '100%', height: 170, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#E5E7EB' },
  coverEdit: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(17,24,39,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  coverEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coverEmpty: { height: 96, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row' },
  coverEmptyText: { fontSize: 14, fontWeight: '700', color: '#16C784' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 52, height: 52, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  meta: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  desc: { fontSize: 15, lineHeight: 22, color: '#6B7280', marginTop: 6 },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  mMeta: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  mSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  approveBtn: { backgroundColor: '#16C784', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  approveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  rejectText: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#F6F7F9' },
});
