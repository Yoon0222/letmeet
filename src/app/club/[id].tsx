import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { ReportBlock } from '@/components/report-block';
import { Button } from '@/components/ui/button';
import { CLUB_SUBSCRIPTION_ENABLED } from '@/constants/features';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { cancelClubSubscription } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import type { ClubMemberWithProfile, ClubPostWithAuthor, ClubSession, ClubSubscription, ClubWithCounts } from '@/lib/types';

const fmtYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

type ClubMenu = { key: string; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; path: '/club/board' | '/club/sessions' | '/club/tournaments' | '/club/members'; comingSoon?: boolean };
// 경기 결과는 정기모임 상세의 대진/순위 탭으로 통합돼 별도 메뉴 제거 (2026-09-08)
const CLUB_MENUS: ClubMenu[] = [
  { key: 'board', label: '게시판', desc: '공지 · 클럽원 소통', icon: 'chatbox-ellipses', path: '/club/board' },
  { key: 'sessions', label: '정기모임', desc: '참석 투표 · 대진 · 순위 · DUPR 반영', icon: 'calendar', path: '/club/sessions' },
  { key: 'tournaments', label: '월례대회', desc: '클럽 토너먼트 개설·진행', icon: 'trophy', path: '/club/tournaments', comingSoon: true },
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
  const [posts, setPosts] = useState<ClubPostWithAuthor[]>([]);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sub, setSub] = useState<ClubSubscription | null>(null);
  const [nowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!id) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: c }, { data: m }, { data: p }, { data: sessionRows }] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('club_members')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('club_id', id)
        .order('joined_at', { ascending: true }),
      supabase
        .from('club_posts_with_authors')
        .select('*')
        .eq('club_id', id)
        .order('is_notice', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('club_sessions')
        .select('*')
        .eq('club_id', id)
        .gte('session_date', today)
        .neq('status', 'canceled')
        .order('session_date', { ascending: true })
        .limit(10),
    ]);
    setClub(c ?? null);
    setMembers((m as unknown as ClubMemberWithProfile[]) ?? []);
    setPosts((p as ClubPostWithAuthor[] | null) ?? []);
    const nextSessions = (sessionRows as ClubSession[] | null) ?? [];
    setSessions(nextSessions);
    const { count } = await supabase
      .from('club_match_results')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', id);
    setMatchCount(count ?? 0);
    // 구독 정보 — 클럽장 본인만 조회(안전 컬럼만, 빌링키 제외)
    if (c && c.owner_id === uid) {
      const { data: s } = await supabase
        .from('club_subscriptions')
        .select('id, club_id, owner_id, card_company, card_number_masked, amount, status, current_period_start, current_period_end, next_charge_at, last_charge_at, fail_count, canceled_at, created_at, updated_at')
        .eq('club_id', id)
        .maybeSingle();
      setSub((s as ClubSubscription | null) ?? null);
    } else {
      setSub(null);
    }
    setLoading(false);
  }, [id, uid]);

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
        club && isOwner
          ? () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="클럽 설정"
                hitSlop={8}
                onPress={() => router.push({ pathname: '/club/edit', params: { clubId: club.id } })}
                style={styles.headerSettingsButton}>
                <Ionicons name="settings-outline" size={22} color="#F8FAFC" />
              </Pressable>
            )
          : club
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

  function goSubscribe() {
    if (!id) return;
    router.push({ pathname: '/payment/subscribe', params: { clubId: id, clubName: club?.name ?? '' } });
  }
  async function cancelSub() {
    if (!id) return;
    setActing(true);
    const res = await cancelClubSubscription(id);
    setActing(false);
    if (!res.ok) {
      Alert.alert('해지 실패', res.error);
      return;
    }
    Alert.alert('구독 해지', res.activeUntil ? `${fmtYmd(res.activeUntil)}까지 이용할 수 있어요. 이후 자동 결제가 멈춰요.` : '다음 결제가 취소됐어요.');
    load();
  }
  function confirmCancelSub() {
    Alert.alert(
      '구독 해지',
      sub?.current_period_end ? `해지해도 ${fmtYmd(sub.current_period_end)}까지 이용할 수 있어요. 이후 자동 결제가 멈춰요.` : '자동 결제를 멈출까요?',
      [
        { text: '닫기', style: 'cancel' },
        { text: '구독 해지', style: 'destructive', onPress: cancelSub },
      ],
    );
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (result.canceled) return;
    const img = result.assets[0];
    setUploading(true);
    try {
      const ext = (img.uri.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${id}/cover_${Date.now()}.${ext}`;
      const buf = await fetch(img.uri).then((r) => r.arrayBuffer());
      if (!buf || buf.byteLength === 0) throw new Error('이미지를 읽지 못했어요 (0바이트). 다른 사진으로 시도해 주세요.');
      const { error: upErr } = await supabase.storage.from('club-images').upload(path, buf, { contentType: img.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from('club-images').getPublicUrl(path).data.publicUrl;
      const { error: dbErr } = await supabase.from('clubs').update({ image_url: url }).eq('id', id);
      if (dbErr) throw dbErr;
      load();
    } catch (e) {
      // 실제 원인을 최대한 드러낸다(스토리지 에러는 Error 가 아닐 수 있음).
      const detail =
        e instanceof Error
          ? e.message
          : e && typeof e === 'object'
            ? (e as { message?: string; error?: string }).message ?? (e as { error?: string }).error ?? JSON.stringify(e)
            : String(e);
      console.warn('[club cover] upload failed', e);
      Alert.alert('사진 업로드 실패', detail || '알 수 없는 오류');
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

  const approvedMembers = members.filter((member) => member.status === 'approved');
  const upcoming = sessions[0] ?? null;
  const canSeeClubContent = isApprovedMember || isOwner;
  const upcomingTime = upcoming?.start_at
    ? new Date(upcoming.start_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  const openMenu = (menu: ClubMenu) => {
    if (menu.comingSoon) {
      Alert.alert('추후 오픈', `${menu.label} 기능은 곧 열려요. 조금만 기다려주세요!`);
      return;
    }
    router.push({ pathname: menu.path, params: { clubId: club.id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.titleRow}>
          <Pressable onPress={pickPhoto} disabled={!isOwner || uploading} style={styles.logoWrap}>
            {club.image_url ? (
              <Image source={{ uri: club.image_url }} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="people" size={28} color="#16C784" />
              </View>
            )}
            {isOwner ? (
              <View style={styles.logoBadge}>
                <Ionicons name={uploading ? 'ellipsis-horizontal' : 'camera'} size={12} color="#fff" />
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{club.name}</Text>
            <Text style={styles.meta}>{club.description || `${club.region || '지역 미설정'}에서 함께 즐기는 피클볼 클럽`}</Text>
          </View>
          {isPremiumUsable ? <Badge label="PREMIUM" color="#16C784" bg="rgba(22,199,132,0.14)" /> : null}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}><Text style={styles.statValue}>{club.member_count}</Text><Text style={styles.statLabel}>멤버</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statValue}>{sessions.length}</Text><Text style={styles.statLabel}>예정 모임</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}><Text style={styles.statValue}>{matchCount}</Text><Text style={styles.statLabel}>경기 기록</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>우리 클럽 회원</Text>
            <Pressable onPress={() => openMenu(CLUB_MENUS[3])} style={styles.moreButton}>
              <Text style={styles.moreText}>전체 보기</Text><Ionicons name="chevron-forward" size={14} color="#707B87" />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.memberRow}>
            {approvedMembers.slice(0, 8).map((member) => (
              <View key={member.user_id} style={styles.memberItem}>
                {member.profiles.avatar_url ? <Image source={{ uri: member.profiles.avatar_url }} style={styles.avatar} /> : (
                  <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{member.profiles.nickname.slice(0, 1)}</Text></View>
                )}
                <Text style={styles.memberName} numberOfLines={1}>{member.profiles.nickname}</Text>
              </View>
            ))}
            {approvedMembers.length === 0 ? <Text style={styles.emptyInline}>아직 승인된 회원이 없어요.</Text> : null}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>다가오는 일정</Text>
            {canSeeClubContent ? <Pressable onPress={() => openMenu(CLUB_MENUS[1])} style={styles.moreButton}><Text style={styles.moreText}>전체 보기</Text><Ionicons name="chevron-forward" size={14} color="#707B87" /></Pressable> : null}
          </View>
          <Pressable disabled={!canSeeClubContent} onPress={() => openMenu(CLUB_MENUS[1])} style={styles.scheduleCard}>
            <View style={styles.dateBox}>
              <Text style={styles.dateMonth}>{upcoming ? `${Number(upcoming.session_date.slice(5, 7))}월` : '-'}</Text>
              <Text style={styles.dateDay}>{upcoming ? Number(upcoming.session_date.slice(8, 10)) : '-'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleTitle}>{upcoming?.title || '예정된 일정이 없어요'}</Text>
              <Text style={styles.scheduleMeta}>{upcoming ? `${upcomingTime ? `${upcomingTime} · ` : ''}${upcoming.location || '장소 미정'} · 코트 ${upcoming.court_count}면` : '새 정기모임이 등록되면 여기에 표시돼요.'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#707B87" />
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>공지사항</Text>
            {canSeeClubContent ? <Pressable onPress={() => openMenu(CLUB_MENUS[0])} style={styles.moreButton}><Text style={styles.moreText}>전체 보기</Text><Ionicons name="chevron-forward" size={14} color="#707B87" /></Pressable> : null}
          </View>
          <View style={styles.noticeList}>
            {posts.length > 0 && canSeeClubContent ? posts.map((post) => (
              <Pressable key={post.id} onPress={() => router.push({ pathname: '/club/post/[id]', params: { id: post.id, clubId: club.id } } as never)} style={styles.noticeRow}>
                <Ionicons name={post.is_notice ? 'megaphone' : 'document-text-outline'} size={16} color={post.is_notice ? '#16C784' : '#707B87'} />
                <Text style={styles.noticeTitle} numberOfLines={1}>{post.title}</Text>
                <Text style={styles.noticeDate}>{post.created_at.slice(5, 10).replace('-', '.')}</Text>
              </Pressable>
            )) : <Text style={styles.emptyInline}>{canSeeClubContent ? '등록된 공지가 없어요.' : '클럽 가입 후 공지를 확인할 수 있어요.'}</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>경기 기록</Text>
            {canSeeClubContent ? <Pressable onPress={() => openMenu(CLUB_MENUS[1])} style={styles.moreButton}><Text style={styles.moreText}>전체 보기</Text><Ionicons name="chevron-forward" size={14} color="#707B87" /></Pressable> : null}
          </View>
          <View style={styles.recordCard}>
            <View style={styles.recordMetric}><Text style={styles.recordLabel}>누적 경기</Text><Text style={styles.recordValue}>{matchCount}<Text style={styles.recordUnit}> 경기</Text></Text></View>
            <View style={styles.recordDivider} />
            <View style={styles.recordMetric}><Text style={styles.recordLabel}>등록 회원</Text><Text style={styles.recordValue}>{club.member_count}<Text style={styles.recordUnit}> 명</Text></Text></View>
            <View style={styles.recordDivider} />
            <View style={styles.recordMetric}><Text style={styles.recordLabel}>예정 모임</Text><Text style={styles.recordValue}>{sessions.length}<Text style={styles.recordUnit}> 회</Text></Text></View>
          </View>
        </View>

        {canSeeClubContent ? (
          <View style={styles.quickGrid}>
            {CLUB_MENUS.filter((menu) => menu.key === 'sessions' || menu.key === 'tournaments' || (menu.key === 'members' && isOwner)).map((menu) => (
              <Pressable key={menu.key} onPress={() => openMenu(menu)} style={styles.quickButton}>
                <Ionicons name={menu.icon} size={18} color={menu.comingSoon ? '#707B87' : '#16C784'} />
                <Text style={styles.quickLabel}>{menu.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {isOwner ? (
        <View style={styles.manageSection}>
          <Text style={styles.sectionTitle}>클럽 운영</Text>
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
          {club?.premium_status === 'none' || club?.tier !== 'premium' ? (
            <Button title="1개월 무료 체험 시작" onPress={startPremiumTrial} loading={acting} style={styles.premiumButton} />
          ) : CLUB_SUBSCRIPTION_ENABLED ? (
            sub && sub.status === 'active' ? (
              <View style={styles.subInfo}>
                <Text style={styles.subLine}>
                  {sub.card_company ? `${sub.card_company} ` : ''}
                  {sub.card_number_masked || '카드'} · 월 {sub.amount.toLocaleString('ko-KR')}원
                </Text>
                <Text style={styles.subSub}>다음 결제 {sub.next_charge_at ? fmtYmd(sub.next_charge_at) : '-'}</Text>
                <Button title="구독 해지" variant="outline" onPress={confirmCancelSub} loading={acting} style={styles.premiumButton} />
              </View>
            ) : sub && sub.status === 'canceled' ? (
              <View style={styles.subInfo}>
                <Text style={styles.subSub}>{sub.current_period_end ? `${fmtYmd(sub.current_period_end)}까지 이용 · 자동결제 해지됨` : '자동결제 해지됨'}</Text>
                <Button title="다시 구독하기" onPress={goSubscribe} loading={acting} style={styles.premiumButton} />
              </View>
            ) : (
              <View style={styles.subInfo}>
                {club?.premium_status === 'past_due' ? (
                  <Text style={styles.subWarn}>결제가 실패해 프리미엄이 중지됐어요.</Text>
                ) : isTrialing ? (
                  <Text style={styles.subSub}>체험 종료 후 자동 결제하려면 카드를 등록하세요.</Text>
                ) : null}
                <Button title="구독하기 (월 5,500원)" onPress={goSubscribe} loading={acting} style={styles.premiumButton} />
              </View>
            )
          ) : (
            <Text style={styles.subSub}>구독 결제는 곧 지원될 예정이에요.</Text>
          )}
          </View>
        </View>
        ) : null}
      </ScrollView>

      {!isOwner ? <View style={styles.actionBar}>
        {isPending ? (
          <Button title="가입 신청 취소 (승인 대기 중)" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : isApprovedMember ? (
          <Button title="클럽 탈퇴" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : (
          <Button title="가입 신청하기" onPress={join} loading={acting} />
        )}
      </View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  notFound: { color: '#AAB4C0', fontSize: 15 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.five },
  hero: { gap: Spacing.three },
  cover: { width: '100%', height: 170, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D' },
  coverEdit: { position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(17,24,39,0.7)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  coverEditText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  coverEmpty: { height: 96, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row' },
  coverEmptyText: { fontSize: 14, fontWeight: '700', color: '#16C784' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 52, height: 52, borderRadius: 14, borderCurve: 'continuous', backgroundColor: 'rgba(22,199,132,0.14)', alignItems: 'center', justifyContent: 'center' },
  logoWrap: { width: 66, height: 66 },
  logo: { width: 66, height: 66, borderRadius: 33, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 2, borderColor: '#16C784' },
  logoPlaceholder: { width: 66, height: 66, borderRadius: 33, borderCurve: 'continuous', backgroundColor: 'rgba(22,199,132,0.14)', borderWidth: 2, borderColor: '#16C784', alignItems: 'center', justifyContent: 'center' },
  logoBadge: { position: 'absolute', right: -3, bottom: -3, width: 24, height: 24, borderRadius: 999, backgroundColor: '#16C784', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#070A0D' },
  title: { flexShrink: 1, fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  headerSettingsButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  meta: { fontSize: 13, lineHeight: 18, color: '#AAB4C0', marginTop: 3 },
  statsRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#707B87', fontSize: 11, fontWeight: '700' },
  statDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.09)' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  moreButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 1, paddingLeft: 10 },
  moreText: { color: '#707B87', fontSize: 12, fontWeight: '700' },
  memberRow: { gap: 12, paddingRight: Spacing.three },
  memberItem: { width: 52, alignItems: 'center', gap: 6 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#10161D' },
  avatarFallback: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#182129', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  avatarInitial: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  memberName: { maxWidth: 52, color: '#AAB4C0', fontSize: 11, fontWeight: '700' },
  emptyInline: { color: '#707B87', fontSize: 13, lineHeight: 20, fontWeight: '600', paddingVertical: 8 },
  scheduleCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  dateBox: { width: 48, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(22,199,132,0.14)' },
  dateMonth: { color: '#16C784', fontSize: 10, fontWeight: '800' },
  dateDay: { color: '#F8FAFC', fontSize: 21, fontWeight: '900' },
  scheduleTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
  scheduleMeta: { color: '#AAB4C0', fontSize: 12, lineHeight: 17, fontWeight: '600', marginTop: 5 },
  noticeList: { paddingHorizontal: 14, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  noticeRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.09)' },
  noticeTitle: { flex: 1, color: '#F8FAFC', fontSize: 13, fontWeight: '700' },
  noticeDate: { color: '#707B87', fontSize: 10, fontWeight: '600' },
  recordCard: { minHeight: 80, flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  recordMetric: { flex: 1, alignItems: 'center', gap: 7 },
  recordLabel: { color: '#707B87', fontSize: 11, fontWeight: '700' },
  recordValue: { color: '#F8FAFC', fontSize: 18, fontWeight: '900' },
  recordUnit: { color: '#AAB4C0', fontSize: 11, fontWeight: '700' },
  recordDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.09)' },
  quickGrid: { flexDirection: 'row', gap: 8 },
  quickButton: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  quickLabel: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  manageSection: { gap: 10, paddingTop: Spacing.two },
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
  subInfo: { gap: 8, marginTop: 4 },
  subLine: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  subSub: { color: '#AAB4C0', fontSize: 13, fontWeight: '600' },
  subWarn: { color: '#F5A623', fontSize: 13, fontWeight: '700' },
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
  menuCardSoon: { opacity: 0.55 },
  soonChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)' },
  soonChipTxt: { color: '#AAB4C0', fontSize: 11, fontWeight: '900' },
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
