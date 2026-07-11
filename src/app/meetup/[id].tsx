import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportBlock } from '@/components/report-block';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts, ParticipantWithProfile } from '@/lib/types';

export default function MeetupDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [meetup, setMeetup] = useState<MeetupWithCounts | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from('meetups_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('meetup_participants')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('meetup_id', id)
        .order('joined_at', { ascending: true }),
    ]);
    setMeetup(m ?? null);
    setParticipants((p as unknown as ParticipantWithProfile[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // load 는 비동기로 await 이후 setState 를 호출하므로 동기 cascading 렌더가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isHost = meetup?.host_id === uid;
  const approved = participants.filter((p) => p.status === 'approved');
  const pending = participants.filter((p) => p.status === 'pending');
  const myPart = participants.find((p) => p.user_id === uid);
  const isApproved = myPart?.status === 'approved';
  const isPending = myPart?.status === 'pending';
  const full = !!meetup && meetup.participant_count >= meetup.max_players;
  const closed = meetup?.status !== 'open';

  useEffect(() => {
    navigation.setOptions({
      title: meetup?.title ?? '모임 상세',
      headerRight:
        meetup && !isHost
          ? () => <ReportBlock targetType="meetup" targetId={meetup.id} targetUserId={meetup.host_id} targetLabel={meetup.title} onBlocked={() => router.back()} />
          : undefined,
    });
  }, [navigation, meetup, isHost, router]);

  async function join() {
    if (!uid || !id || !meetup) return;
    setActing(true);
    // 승인제면 pending, 아니면 바로 approved
    const { error } = await supabase
      .from('meetup_participants')
      .insert({ meetup_id: id, user_id: uid, status: meetup.require_approval ? 'pending' : 'approved' });
    setActing(false);
    if (error) {
      Alert.alert('참가 실패', error.message);
      return;
    }
    if (meetup.require_approval) Alert.alert('참가 신청 완료', '호스트 승인 후 참가가 확정돼요.');
    load();
  }

  // 참가 전 게스트비·승인 여부 확인
  function confirmJoin() {
    if (!meetup) return;
    const feeLine = meetup.fee > 0 ? `게스트비: ${meetup.fee.toLocaleString()}원\n` : '게스트비: 무료\n';
    const tailLine = meetup.require_approval ? '호스트 승인 후 참가가 확정됩니다.' : '이 모임에 참가할까요?';
    Alert.alert(meetup.require_approval ? '참가 신청' : '참가하기', `${feeLine}${tailLine}`, [
      { text: '닫기', style: 'cancel' },
      { text: meetup.require_approval ? '신청' : '참가', onPress: join },
    ]);
  }

  // 호스트: 참가 신청 승인/거절
  async function approve(userId: string) {
    if (!id) return;
    await supabase.from('meetup_participants').update({ status: 'approved' }).eq('meetup_id', id).eq('user_id', userId);
    load();
  }
  async function reject(userId: string) {
    if (!id) return;
    await supabase.from('meetup_participants').delete().eq('meetup_id', id).eq('user_id', userId);
    load();
  }

  // 호스트: 코트/장소 사진 업로드·변경
  async function pickPhoto() {
    if (!isHost || !id || uploading) return;
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
      const { error: upErr } = await supabase.storage.from('meetup-images').upload(path, buf, { contentType: img.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from('meetup-images').getPublicUrl(path).data.publicUrl;
      const { error: dbErr } = await supabase.from('meetups').update({ image_url: url }).eq('id', id);
      if (dbErr) throw dbErr;
      load();
    } catch (e) {
      Alert.alert('사진 업로드 실패', e instanceof Error ? e.message : '다시 시도해주세요.');
    } finally {
      setUploading(false);
    }
  }

  async function leave() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('meetup_participants')
      .delete()
      .eq('meetup_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('취소 실패', error.message);
      return;
    }
    load();
  }

  function confirmLeave() {
    Alert.alert(
      isPending ? '신청 취소' : '참가 취소',
      isPending ? '참가 신청을 취소할까요?' : '이 모임 참가를 취소할까요?',
      [
        { text: '닫기', style: 'cancel' },
        { text: isPending ? '신청 취소' : '참가 취소', style: 'destructive', onPress: leave },
      ],
    );
  }

  function confirmCancelMeetup() {
    Alert.alert('모임 취소', '모임을 취소하면 되돌릴 수 없어요. 진행할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '모임 취소',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await supabase.from('meetups').update({ status: 'cancelled' }).eq('id', id);
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

  if (!meetup) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>모임을 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 코트/장소 사진 (있으면 표시, 호스트는 탭해서 변경) */}
        {meetup.image_url ? (
          <Pressable onPress={pickPhoto} disabled={!isHost || uploading}>
            <Image source={{ uri: meetup.image_url }} style={styles.cover} />
            {isHost ? (
              <View style={styles.coverEdit}>
                <Ionicons name="camera" size={14} color="#fff" />
                <Text style={styles.coverEditText}>{uploading ? '올리는 중…' : '사진 변경'}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : isHost ? (
          <Pressable onPress={pickPhoto} disabled={uploading} style={styles.coverEmpty}>
            <Ionicons name="image-outline" size={22} color="#16C784" />
            <Text style={styles.coverEmptyText}>{uploading ? '올리는 중…' : '코트/장소 사진 추가'}</Text>
          </Pressable>
        ) : null}

        <View style={styles.statusRow}>
          {closed ? (
            <Badge label={meetup.status === 'cancelled' ? '취소된 모임' : '마감된 모임'} color="#E5484D" bg="rgba(229,72,77,0.14)" />
          ) : full ? (
            <Badge label="정원 마감" color="#F5A623" bg="rgba(245,166,35,0.16)" />
          ) : (
            <Badge label="모집중" />
          )}
        </View>

        <Text style={styles.title}>{meetup.title}</Text>

        <View style={styles.infoCard}>
          <InfoRow icon="time-outline" text={formatMeetupTime(meetup.start_time)} />
          <InfoRow icon="hourglass-outline" text={`약 ${Math.round(meetup.duration_min / 60 * 10) / 10}시간`} />
          <InfoRow icon="location-outline" text={`${meetup.location_name}${meetup.region ? ` · ${meetup.region}` : ''}`} />
          <InfoRow icon="ribbon-outline" text={`실력 ${skillRangeLabel(meetup.skill_min, meetup.skill_max)}`} />
          <InfoRow icon="people-outline" text={`정원 ${meetup.participant_count}/${meetup.max_players}명`} />
          <InfoRow icon="cash-outline" text={meetup.fee > 0 ? `게스트비 ${meetup.fee.toLocaleString()}원` : '게스트비 무료'} />
          {meetup.require_approval ? <InfoRow icon="shield-checkmark-outline" text="호스트 승인제 모임" /> : null}
        </View>

        {meetup.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>소개</Text>
            <Text style={styles.desc}>{meetup.description}</Text>
          </View>
        ) : null}

        {/* 호스트: 참가 신청 대기 목록 */}
        {isHost && pending.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>참가 신청 {pending.length}명</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((p) => (
                <View key={p.user_id} style={styles.pRow}>
                  <Avatar nickname={p.profiles?.nickname ?? '?'} uri={p.profiles?.avatar_url} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pName}>{p.profiles?.nickname ?? '알 수 없음'}</Text>
                    <Text style={styles.pMeta}>{p.profiles?.region || '지역 미설정'}</Text>
                  </View>
                  <Text onPress={() => approve(p.user_id)} style={styles.approveBtn}>승인</Text>
                  <Text onPress={() => reject(p.user_id)} style={styles.rejectBtn}>거절</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>참가자 {approved.length}명</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {approved.map((p) => (
              <View key={p.user_id} style={styles.pRow}>
                <Avatar nickname={p.profiles?.nickname ?? '?'} uri={p.profiles?.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.pNameRow}>
                    <Text style={styles.pName}>{p.profiles?.nickname ?? '알 수 없음'}</Text>
                    {p.user_id === meetup.host_id && <Badge label="호스트" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                  </View>
                  <Text style={styles.pMeta}>{p.profiles?.region || '지역 미설정'}</Text>
                </View>
                <Text style={styles.pSkill}>
                  {p.profiles ? `${p.profiles.skill_level.toFixed(1)} ${skillLabel(p.profiles.skill_level)}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {isHost ? (
          !closed ? (
            <Button title="모임 취소하기" variant="danger" onPress={confirmCancelMeetup} />
          ) : (
            <Button title="종료된 모임입니다" variant="secondary" disabled onPress={() => {}} />
          )
        ) : closed ? (
          <Button title="참가할 수 없는 모임입니다" variant="secondary" disabled onPress={() => {}} />
        ) : isPending ? (
          <Button title="참가 신청 취소 (승인 대기 중)" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : isApproved ? (
          <Button title="참가 취소" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : (
          <Button
            title={full ? '정원이 가득 찼어요' : meetup.require_approval ? '참가 신청하기' : '참가하기'}
            onPress={confirmJoin}
            disabled={full}
            loading={acting}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function InfoRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color="#16C784" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F6F7F9' },
  notFound: { color: '#6B7280', fontSize: 15 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  cover: { width: '100%', height: 180, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#E5E7EB' },
  coverEdit: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(17,24,39,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  coverEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coverEmpty: { height: 96, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row' },
  coverEmptyText: { fontSize: 14, fontWeight: '700', color: '#16C784' },
  statusRow: { flexDirection: 'row' },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', letterSpacing: -0.5 },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: Spacing.three,
    gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', color: '#111827', flex: 1 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  desc: { fontSize: 15, lineHeight: 22, color: '#6B7280', marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  pMeta: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  approveBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#16C784',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  rejectBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#F6F7F9' },
});
