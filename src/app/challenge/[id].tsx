import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import {
  challengeGraceEndMs,
  challengePeriodLabel,
  challengeRemainingLabel,
  dailyLimitLabel,
  entryReasonLabel,
  fetchChallenge,
  fetchChallengeEntries,
  fetchChallengeProgress,
  joinChallenge,
  kstDate,
  kstDayLabel,
  leaveChallenge,
  normalizeInstagramId,
} from '@/lib/challenge';
import { AppAlert as Alert } from '@/lib/feedback';
import type { Challenge, ChallengeEntry, ChallengeProgress } from '@/lib/types';
import { AppColors } from '@/theme';

// 챌린지(이벤트) 상세 — 참여 신청(인스타그램 아이디 등록), 기간·규칙, 내 진행률, 날짜별 인정 내역.
//   참여 신청·취소는 서버 함수(challenge_join / challenge_leave)가 하고, 숫자와 인정 여부도 모두 서버가 계산한다.
//   참여 신청한 사람만 집계되고, 신청한 뒤에 완료 처리된 참석부터 인정된다.
export default function ChallengeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [instagram, setInstagram] = useState(''); // 입력 중인 인스타그램 아이디
  const [editing, setEditing] = useState(false); // 참여 중에 아이디를 바꾸는 중
  const [saving, setSaving] = useState<'join' | 'leave' | null>(null);
  const [failure, setFailure] = useState<string | null>(null); // 실패 사유 — 토스트가 사라져도 화면에 남긴다

  const load = useCallback(async () => {
    if (!id || !uid) return;
    try {
      const c = await fetchChallenge(id);
      if (c === undefined) throw new Error('challenge_load_failed'); // 못 읽은 것을 "진행 중인 이벤트가 아님"으로 보여주지 않는다
      if (!c) {
        setChallenge(null);
        setLoadFailed(false);
        return;
      }
      const [p, list] = await Promise.all([fetchChallengeProgress(id), fetchChallengeEntries(id)]);
      if (!p) throw new Error('challenge_load_failed');
      setChallenge(c);
      setProgress(p);
      setEntries(list);
      setNowMs(Date.now());
      setLoadFailed(false);
    } catch {
      // 못 읽은 것을 "기록 없음"·"참여 전"으로 보여주지 않는다
      setLoadFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>이벤트 정보를 불러오지 못했어요</Text>
          <Text style={styles.centerBody}>네트워크 상태를 확인하고 다시 시도해주세요.</Text>
          <Button
            title="다시 시도"
            variant="outline"
            onPress={() => {
              setLoadFailed(false);
              setLoading(true);
              load();
            }}
            style={styles.wide}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!challenge || !progress) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>지금은 진행 중인 이벤트가 아니에요</Text>
          <Button title="돌아가기" variant="outline" onPress={() => router.back()} style={styles.wide} />
        </View>
      </SafeAreaView>
    );
  }

  const goal = progress.goal_count;
  const ratio = goal > 0 ? Math.min(1, progress.progress / goal) : 0;
  const ended = nowMs > new Date(challenge.ends_at).getTime();
  // 끝났지만 아직 완료 처리가 인정되는 기간(유예) — 이때는 횟수가 더 오를 수 있어 확정처럼 말하지 않는다
  const graceEndMs = challengeGraceEndMs(challenge);
  const inGrace = ended && nowMs <= graceEndMs;
  const left = Math.max(0, goal - progress.progress);
  const limit = challenge.daily_limit;
  const enrolled = progress.enrolled;
  const busy = saving !== null;

  // 참여 신청 / 아이디 변경 — 둘 다 같은 서버 함수(이미 신청했으면 아이디만 바뀐다)
  async function submitInstagram(normalized: string) {
    setFailure(null);
    setSaving('join');
    const res = await joinChallenge(challenge!.id, normalized);
    setSaving(null);
    if (!res.ok) {
      setFailure(res.error);
      Alert.alert(enrolled ? '아이디 변경 실패' : '참여 신청 실패', res.error);
      return;
    }
    Alert.alert(enrolled ? '아이디 변경 완료' : '참여 신청 완료', enrolled ? `@${normalized} 으로 바꿨어요.` : '지금부터 완료 처리되는 참석이 인정돼요.');
    setEditing(false);
    setInstagram('');
    load();
  }

  function confirmInstagram() {
    const normalized = normalizeInstagramId(instagram);
    if (!normalized) {
      setFailure('인스타그램 아이디를 확인해주세요. 영문·숫자·밑줄(_)·마침표(.)만, 30자까지 쓸 수 있어요.');
      return;
    }
    if (enrolled) {
      submitInstagram(normalized);
      return;
    }
    Alert.alert(
      '참여 신청',
      `인스타그램 @${normalized} 으로 참여 신청할까요?\n참여 신청한 뒤에 완료 처리된 참석부터 인정돼요. 아이디와 참여 기록은 참여 확인·당첨 안내를 위해 운영자가 확인해요.`,
      [
        { text: '닫기', style: 'cancel' },
        { text: '참여 신청', onPress: () => submitInstagram(normalized) },
      ],
    );
  }

  function confirmLeave() {
    Alert.alert('참여 취소', '참여를 취소하면 지금까지의 기록이 이 이벤트에서 빠져요. 다시 신청하면 그때부터 새로 인정돼요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '참여 취소',
        style: 'destructive',
        onPress: async () => {
          setFailure(null);
          setSaving('leave');
          const res = await leaveChallenge(challenge!.id);
          setSaving(null);
          if (!res.ok) {
            setFailure(res.error);
            Alert.alert('참여 취소 실패', res.error);
            return;
          }
          Alert.alert('참여 취소 완료', '이 이벤트 참여를 취소했어요.');
          setEditing(false);
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={AppColors.primary}
            />
          }>
          {/* 이벤트 요약 + (참여 중이면) 진행률 */}
          <View style={[styles.card, enrolled && progress.achieved && styles.cardAchieved]}>
            <View style={styles.rowBetween}>
              <Text style={styles.title}>{challenge.title}</Text>
              <View style={[styles.badge, enrolled && progress.achieved && styles.badgeAchieved]}>
                <Text style={[styles.badgeText, enrolled && progress.achieved && styles.badgeTextAchieved]}>
                  {enrolled && progress.achieved ? '달성 완료' : challengeRemainingLabel(challenge, nowMs)}
                </Text>
              </View>
            </View>
            <Text style={styles.sub}>
              {challengePeriodLabel(challenge)} · {dailyLimitLabel(challenge)}
            </Text>
            {enrolled ? (
              <>
                <View style={styles.countRow}>
                  <Text style={styles.count}>{progress.progress}</Text>
                  <Text style={styles.goal}> / {goal}</Text>
                </View>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
                </View>
                {progress.achieved ? (
                  <View style={styles.achievedRow}>
                    <Ionicons name="trophy" size={18} color={AppColors.primary} />
                    <Text style={styles.achievedText}>
                      {progress.achieved_at ? `${kstDayLabel(progress.achieved_at)}에 ` : ''}
                      {goal}회를 모두 채웠어요!
                    </Text>
                  </View>
                ) : inGrace ? (
                  <Text style={styles.sub}>
                    이벤트가 끝났어요. 지금까지 {progress.progress}회가 인정됐어요. 끝나기 전에 열린 모임은{' '}
                    {kstDayLabel(new Date(graceEndMs).toISOString())}까지 완료 처리되면 더 반영돼요.
                  </Text>
                ) : ended ? (
                  <Text style={styles.sub}>이벤트가 끝났어요. {progress.progress}회가 인정됐어요.</Text>
                ) : (
                  <Text style={styles.sub}>{left}회 더 참석하면 달성이에요.</Text>
                )}
                {/* 실제 참석 횟수는 인정 횟수와 다를 수 있다(같은 날 여러 번 참석, 목표를 넘겨 참석) */}
                {progress.actual_count !== progress.progress ? (
                  <Text style={styles.muted}>
                    실제 참석 {progress.actual_count}회 · 인정 {progress.credited_count}회
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.sub}>번개 모임에 {goal}회 참석하면 달성이에요. 아래에서 참여 신청을 해주세요.</Text>
            )}
          </View>

          {/* 참여 신청 / 참여 정보 */}
          {!enrolled ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>참여 신청</Text>
              {ended ? (
                <Text style={styles.sub}>이벤트가 끝나 참여 신청을 받지 않아요.</Text>
              ) : (
                <>
                  <TextField
                    label="인스타그램 아이디"
                    value={instagram}
                    onChangeText={(v) => {
                      setFailure(null);
                      setInstagram(v);
                    }}
                    placeholder="예: pinut.official"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={80}
                    editable={!busy}
                    hint="@ 없이 입력해도 돼요. 아이디는 참여 확인과 당첨 안내에만 쓰고, 운영자만 볼 수 있어요."
                  />
                  {failure ? <Text style={styles.failure}>{failure}</Text> : null}
                  <Button title="참여 신청하기" onPress={confirmInstagram} loading={saving === 'join'} disabled={busy || instagram.trim().length === 0} />
                  <Text style={styles.muted}>참여 신청한 뒤에 완료 처리된 참석부터 인정돼요. 신청하지 않으면 번개에 참석해도 이 이벤트에는 집계되지 않아요.</Text>
                </>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>참여 정보</Text>
              {editing ? (
                <>
                  <TextField
                    label="인스타그램 아이디"
                    value={instagram}
                    onChangeText={(v) => {
                      setFailure(null);
                      setInstagram(v);
                    }}
                    placeholder={progress.instagram_id ?? '예: pinut.official'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={80}
                    editable={!busy}
                  />
                  {failure ? <Text style={styles.failure}>{failure}</Text> : null}
                  <View style={styles.buttonRow}>
                    <Button
                      title="취소"
                      variant="outline"
                      onPress={() => {
                        setEditing(false);
                        setInstagram('');
                        setFailure(null);
                      }}
                      disabled={busy}
                      style={styles.flex}
                    />
                    <Button title="저장" onPress={confirmInstagram} loading={saving === 'join'} disabled={busy || instagram.trim().length === 0} style={styles.flex} />
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.rowBetween}>
                    <View style={styles.flex}>
                      <Text style={styles.line}>인스타그램 @{progress.instagram_id}</Text>
                      {progress.enrolled_at ? <Text style={styles.muted}>{kstDayLabel(progress.enrolled_at)}에 참여 신청 · 이후의 참석부터 인정</Text> : null}
                    </View>
                    <Pressable onPress={() => setEditing(true)} disabled={busy} hitSlop={8}>
                      <Text style={styles.link}>아이디 변경</Text>
                    </Pressable>
                  </View>
                  {failure ? <Text style={styles.failure}>{failure}</Text> : null}
                </>
              )}
            </View>
          )}

          {/* 참여 규칙 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>참여 방법</Text>
            {challenge.description ? <Text style={styles.sub}>{challenge.description}</Text> : null}
            <Rule text="인스타그램 아이디를 등록해 참여 신청을 해주세요. 신청한 뒤에 완료 처리된 참석부터 인정돼요." />
            <Rule text={`기간 안에 번개 모임에 ${goal}회 참석하면 달성이에요.`} />
            <Rule
              text={`하루 ${limit}회까지만 인정돼요. 모임이 열린 날과 완료 처리된 날 둘 다에 적용돼서, 같은 날 여러 번 참석했거나 여러 날의 모임이 하루에 몰아서 완료 처리되면 ${limit}회만 인정돼요.`}
            />
            <Rule text="모임이 끝나고 호스트가 '모임 완료 처리'에서 참석으로 확인한 모임만 인정돼요. 호스트도 본인을 참석으로 체크해야 해요." />
            <Rule text="참석자가 2명 이상인 모임만 인정돼요. 취소된 모임, 불참·미확인은 제외돼요." />
            <Rule
              text={
                challenge.completion_grace_days > 0
                  ? `인정 날짜는 호스트가 완료 처리한 날(한국 시간)이에요. 이벤트가 끝나기 전에 열린 모임은 종료 후 ${challenge.completion_grace_days}일 안에 완료 처리되면 인정돼요.`
                  : '인정 날짜는 호스트가 완료 처리한 날(한국 시간)이에요. 이벤트가 끝나기 전에 완료 처리돼야 인정돼요.'
              }
            />
          </View>

          {/* 인정 내역 — 참여 중일 때만 */}
          {enrolled ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>내 참여 기록</Text>
              {entries.length === 0 ? (
                <>
                  <Text style={styles.sub}>아직 기록이 없어요. 번개 모임에 참석하고 호스트에게 완료 처리를 부탁해보세요.</Text>
                  {!ended ? <Button title="번개 모임 찾기" variant="outline" onPress={() => router.push('/(tabs)/matches')} /> : null}
                </>
              ) : (
                entries.map((e) => (
                  // 번개가 지워졌으면(호스트 탈퇴 등) 기록만 보여주고 상세로는 가지 않는다
                  <Pressable
                    key={e.completion_id}
                    onPress={() => e.meetup_id && router.push(`/meetup/${e.meetup_id}` as never)}
                    disabled={!e.meetup_id}
                    style={styles.entryRow}>
                    <View style={styles.flex}>
                      {/* 인정 날짜는 완료 처리한 날 — 모임이 다른 날에 열렸으면 그 날짜도 보여준다(하루 한도는 둘 다에 걸린다) */}
                      <Text style={styles.entryDate}>
                        {kstDate(new Date(e.meetup_start_time).getTime()) === e.credit_date
                          ? kstDayLabel(e.credit_date)
                          : `${kstDayLabel(e.credit_date)} 완료 · ${kstDayLabel(e.meetup_start_time)} 모임`}
                      </Text>
                      <Text style={styles.entryTitle} numberOfLines={1}>
                        {e.meetup_title}
                      </Text>
                      {!e.credited && e.reason ? <Text style={styles.entryReason}>{entryReasonLabel(e.reason, limit)}</Text> : null}
                    </View>
                    {e.credited ? (
                      <View style={styles.creditBadge}>
                        <Text style={styles.creditText}>{e.credit_no ? `${e.credit_no}회차 인정` : '인정'}</Text>
                      </View>
                    ) : (
                      <View style={styles.noCreditBadge}>
                        <Text style={styles.noCreditText}>인정 안 됨</Text>
                      </View>
                    )}
                  </Pressable>
                ))
              )}
            </View>
          ) : null}

          {/* 끝난 이벤트는 참여를 취소할 수 없다(다시 신청할 수 없어 되돌릴 길이 없다) */}
          {enrolled && !editing && !ended ? (
            <Pressable onPress={confirmLeave} disabled={busy} hitSlop={8} style={styles.leave}>
              {saving === 'leave' ? <ActivityIndicator color={AppColors.textMuted} /> : <Text style={styles.leaveText}>이벤트 참여 취소</Text>}
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View style={styles.ruleRow}>
      <Ionicons name="checkmark" size={15} color={AppColors.primary} style={styles.ruleIcon} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  centerTitle: { color: AppColors.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  centerBody: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  wide: { alignSelf: 'stretch', marginTop: Spacing.two },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: Spacing.three,
    gap: 10,
  },
  cardAchieved: { borderColor: AppColors.primary, backgroundColor: 'rgba(22,199,132,0.10)' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  title: { flex: 1, color: AppColors.textPrimary, fontSize: 20, fontWeight: '900' },
  sectionTitle: { color: AppColors.textPrimary, fontSize: 16, fontWeight: '900' },
  line: { color: AppColors.textPrimary, fontSize: 15, fontWeight: '800' },
  sub: { color: AppColors.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  muted: { color: AppColors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  link: { color: AppColors.primary, fontSize: 13, fontWeight: '800' },
  failure: {
    color: AppColors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,107,0.14)',
    overflow: 'hidden',
  },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  badgeAchieved: { backgroundColor: AppColors.primary },
  badgeText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '800' },
  badgeTextAchieved: { color: '#07110C' },
  countRow: { flexDirection: 'row', alignItems: 'baseline' },
  count: { color: AppColors.textPrimary, fontSize: 40, fontWeight: '900' },
  goal: { color: AppColors.textSecondary, fontSize: 22, fontWeight: '800' },
  track: { height: 10, borderRadius: 5, backgroundColor: '#1B242D', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5, backgroundColor: AppColors.primary },
  achievedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  achievedText: { flex: 1, color: AppColors.primary, fontSize: 14, fontWeight: '800' },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ruleIcon: { marginTop: 2 },
  ruleText: { flex: 1, color: AppColors.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  entryDate: { color: AppColors.textMuted, fontSize: 12, fontWeight: '700' },
  entryTitle: { color: AppColors.textPrimary, fontSize: 14, fontWeight: '800', marginTop: 1 },
  entryReason: { color: AppColors.warningText, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  creditBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(22,199,132,0.14)' },
  creditText: { color: AppColors.primary, fontSize: 12, fontWeight: '800' },
  noCreditBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  noCreditText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '800' },
  leave: { alignSelf: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
  leaveText: { color: AppColors.textMuted, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
