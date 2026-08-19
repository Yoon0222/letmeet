import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { ReportBlock } from '@/components/report-block';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { supabase } from '@/lib/supabase';
import type { ClubMemberWithProfile, ClubWithCounts } from '@/lib/types';

type ClubMenu = { key: string; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; path: '/club/sessions' | '/club/tournaments' | '/club/results' | '/club/members' };
const CLUB_MENUS: ClubMenu[] = [
  { key: 'sessions', label: '정기모임', desc: '참석 투표 · 아메리카노 대진', icon: 'calendar', path: '/club/sessions' },
  { key: 'tournaments', label: '월례대회', desc: '클럽 토너먼트 개설·진행', icon: 'trophy', path: '/club/tournaments' },
  { key: 'results', label: '경기 결과', desc: '기록 · DUPR 반영', icon: 'podium', path: '/club/results' },
  { key: 'members', label: '회원 관리', desc: '멤버 · 임원 임명 · 가입 승인', icon: 'people', path: '/club/members' },
];

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
  const [nowMs] = useState(() => Date.now());

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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isOwner = club?.owner_id === uid;
  const myMembership = members.find((m) => m.user_id === uid);
  const isApprovedMember = myMembership?.status === 'approved';
  const isPending = myMembership?.status === 'pending';
  const isTrialing = club?.premium_status === 'trialing' && !!club.premium_trial_ends_at && new Date(club.premium_trial_ends_at).getTime() > nowMs;
  const isPremiumUsable = club?.tier === 'premium' && (club.premium_status === 'active' || isTrialing);
  const trialDaysLeft = isTrialing && club?.premium_trial_ends_at
    ? Math.max(0, Math.ceil((new Date(club.premium_trial_ends_at).getTime() - nowMs) / 86400000))
    : null;

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
    // 클럽 가입은 항상 승인제 — 신청(pending) 후 운영자 승인 필요
    const { error } = await supabase
      .from('club_members')
      .insert({ club_id: id, user_id: uid, status: 'pending' });
    setActing(false);
    if (error) {
      Alert.alert('가입 실패', error.message);
      return;
    }
    Alert.alert('가입 신청 완료', '운영자 승인 후 가입돼요.');
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

  async function startPremiumTrial() {
    if (!isOwner || !id) return;
    setActing(true);
    const trialEnd = new Date();
    trialEnd.setMonth(trialEnd.getMonth() + 1);
    const { error } = await supabase
      .from('clubs')
      .update({
        tier: 'premium',
        premium_status: 'trialing',
        premium_started_at: new Date().toISOString(),
        premium_trial_ends_at: trialEnd.toISOString(),
      })
      .eq('id', id);
    setActing(false);
    if (error) {
      Alert.alert('업그레이드 실패', error.message);
      return;
    }
    Alert.alert('무료 체험 시작', '프리미엄 클럽 기능을 1개월 동안 사용할 수 있어요.');
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
            </Text>
          </View>
        </View>

        {club.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>소개</Text>
            <Text style={styles.desc}>{club.description}</Text>
          </View>
        ) : null}

        <View style={styles.premiumCard}>
          <View style={styles.premiumTop}>
            <View>
              <Text style={styles.premiumEyebrow}>{isPremiumUsable ? 'PREMIUM CLUB' : 'CLUB PLAN'}</Text>
              <Text style={styles.premiumTitle}>
                {isPremiumUsable ? '경기 결과 관리 사용 중' : '프리미엄 클럽으로 업그레이드'}
              </Text>
            </View>
            <Badge
              label={isPremiumUsable ? (trialDaysLeft ? `체험 ${trialDaysLeft}일` : 'Premium') : 'Free'}
              color={isPremiumUsable ? '#16C784' : '#AAB4C0'}
              bg={isPremiumUsable ? 'rgba(22,199,132,0.14)' : 'rgba(255,255,255,0.07)'}
            />
          </View>
          <Text style={styles.premiumBody}>
            {isPremiumUsable
              ? '클럽 멤버끼리 진행한 경기 결과를 기록하고 히스토리로 확인할 수 있어요.'
              : '프리미엄 클럽은 클럽 내부 경기 결과 기록을 사용할 수 있어요. 1개월 무료 체험 후 구독으로 전환됩니다.'}
          </Text>
          {isOwner && !isPremiumUsable ? (
            <Button title="1개월 무료 체험 시작" onPress={startPremiumTrial} loading={acting} style={styles.premiumButton} />
          ) : null}
        </View>

        {/* 클럽 활동 메뉴 — 각각 전용 페이지로. 비회원은 회원 관리만 노출 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>클럽 활동</Text>
          <View style={styles.menuList}>
            {(isApprovedMember || isOwner ? CLUB_MENUS : CLUB_MENUS.filter((menu) => menu.key === 'members')).map((menu) => (
              <Pressable
                key={menu.key}
                onPress={() => router.push({ pathname: menu.path, params: { clubId: club.id } })}
                style={styles.menuCard}>
                <View style={styles.menuIcon}>
                  <Ionicons name={menu.icon} size={20} color="#16C784" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuLabel}>{menu.label}</Text>
                  <Text style={styles.menuDesc}>{menu.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#707B87" />
              </Pressable>
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
          <Button title="가입 신청하기" onPress={join} loading={acting} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  notFound: { color: '#AAB4C0', fontSize: 15 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  cover: { width: '100%', height: 170, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D' },
  coverEdit: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(17,24,39,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  coverEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coverEmpty: { height: 96, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row' },
  coverEmptyText: { fontSize: 14, fontWeight: '700', color: '#16C784' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 52, height: 52, borderRadius: 14, borderCurve: 'continuous', backgroundColor: 'rgba(22,199,132,0.14)', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#F8FAFC', letterSpacing: -0.5 },
  meta: { fontSize: 14, color: '#AAB4C0', marginTop: 2 },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  desc: { fontSize: 15, lineHeight: 22, color: '#AAB4C0', marginTop: 6 },
  premiumCard: {
    marginTop: Spacing.two,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 12,
  },
  premiumTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  premiumEyebrow: { color: '#16C784', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  premiumTitle: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', marginTop: 6 },
  premiumBody: { color: '#AAB4C0', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  premiumButton: { marginTop: 2 },
  menuList: { marginTop: 10, gap: 10 },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,199,132,0.12)',
  },
  menuLabel: { color: '#F8FAFC', fontSize: 16, fontWeight: '800' },
  menuDesc: { color: '#AAB4C0', fontSize: 13, fontWeight: '600', marginTop: 3 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  recordButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16C784',
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
  },
  recordButtonText: { color: '#07100D', fontSize: 13, fontWeight: '900' },
  lockedBox: {
    marginTop: 10,
    minHeight: 64,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.three,
  },
  lockedText: { flex: 1, color: '#AAB4C0', fontSize: 14, fontWeight: '700' },
  resultList: { marginTop: 10, gap: 10 },
  resultCard: {
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 10,
  },
  resultMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultDate: { color: '#AAB4C0', fontSize: 12, fontWeight: '800' },
  resultRecorder: { color: '#707B87', fontSize: 12, fontWeight: '700' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamName: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  winnerName: { color: '#16C784' },
  scoreText: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  winnerScore: { color: '#16C784' },
  resultNote: { color: '#AAB4C0', fontSize: 13, lineHeight: 18 },
  duprRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2 },
  duprBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  duprBadgeText: { color: '#16C784', fontSize: 12, fontWeight: '800' },
  duprHint: { color: '#707B87', fontSize: 12, fontWeight: '700' },
  duprBtn: {
    minHeight: 30,
    minWidth: 84,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16C784',
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 12,
  },
  duprBtnText: { color: '#07100D', fontSize: 12, fontWeight: '900' },
  tournamentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
  },
  tournamentTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  tournamentMeta: { color: '#AAB4C0', fontSize: 13, fontWeight: '700', marginTop: 3 },
  mRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  mMeta: { fontSize: 13, color: '#AAB4C0', marginTop: 1 },
  mSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  approveBtn: { backgroundColor: '#16C784', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  approveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  rejectBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  rejectText: { color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', backgroundColor: '#070A0D' },
});
