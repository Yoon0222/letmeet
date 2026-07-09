import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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
    // load 는 비동기로 await 이후 setState 를 호출하므로 동기 cascading 렌더가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isOwner = club?.owner_id === uid;
  const joined = members.some((m) => m.user_id === uid);

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
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase.from('club_members').insert({ club_id: id, user_id: uid });
    setActing(false);
    if (error) {
      Alert.alert('가입 실패', error.message);
      return;
    }
    load();
  }

  async function leave() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('club_members')
      .delete()
      .eq('club_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('탈퇴 실패', error.message);
      return;
    }
    load();
  }

  function confirmLeave() {
    Alert.alert('클럽 탈퇴', '이 클럽에서 나갈까요?', [
      { text: '닫기', style: 'cancel' },
      { text: '탈퇴', style: 'destructive', onPress: leave },
    ]);
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
        <View style={styles.titleRow}>
          <View style={styles.icon}>
            <Ionicons name="people" size={26} color="#16C784" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{club.name}</Text>
            <Text style={styles.meta}>{club.region || '지역 미설정'} · 멤버 {club.member_count}명</Text>
          </View>
        </View>

        {club.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>소개</Text>
            <Text style={styles.desc}>{club.description}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>멤버 {members.length}명</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {members.map((m) => (
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
        ) : joined ? (
          <Button title="클럽 탈퇴" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : (
          <Button title="클럽 가입하기" onPress={join} loading={acting} />
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
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#F6F7F9' },
});
