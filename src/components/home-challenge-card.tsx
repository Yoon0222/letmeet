import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import {
  challengeAcceptsCompletion,
  challengeRemainingLabel,
  dailyLimitLabel,
  fetchActiveChallenges,
  fetchChallengeProgress,
  fetchPendingCompletions,
  hideChallengeCard,
  isChallengeCardHidden,
  type PendingCompletion,
} from '@/lib/challenge';
import { AppAlert as Alert } from '@/lib/feedback';
import { formatMeetupTime } from '@/lib/format';
import type { Challenge, ChallengeProgress } from '@/lib/types';
import { AppColors } from '@/theme';

type Item = { challenge: Challenge; progress: ChallengeProgress; hidden: boolean };

// 홈 화면 챌린지(이벤트) 카드 — 켜져 있는 챌린지마다 한 장.
//   참여 신청한 사람: 내 진행률(서버가 계산한 값 그대로).
//   아직 신청하지 않은 사람: 참여 안내 카드(참여하기 / 다시 보지 않기). 끝난 이벤트는 보여주지 않는다.
//   켜진 챌린지가 없거나 진행률을 읽지 못하면 아무것도 그리지 않는다(신청 여부를 모르는 채로 안내하지 않는다).
//   호스트에게는 "완료 처리할 모임"도 함께 보여준다 — 시작하고 몇 시간이 지난 번개는 목록 화면에서 사라져서,
//   완료 처리 화면으로 가는 길이 여기뿐이다. 완료 처리가 인정되는 기간(종료 + 유예)에만 보인다.
export function HomeChallengeCard() {
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [items, setItems] = useState<Item[]>([]);
  const [pending, setPending] = useState<PendingCompletion[]>([]);
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    if (!uid) {
      setItems([]);
      setPending([]);
      return;
    }
    const list = await fetchActiveChallenges();
    const now = Date.now();
    // 완료 처리가 아직 인정되는 챌린지가 있을 때만, 그 시작 이후에 연 내 번개 중 완료 처리 안 한 것을 찾는다
    const accepting = list.filter((c) => challengeAcceptsCompletion(c, now));
    const since = accepting.map((c) => c.starts_at).sort()[0];
    const [loaded, todo] = await Promise.all([
      Promise.all(
        list.map(async (challenge) => {
          const [progress, hidden] = await Promise.all([fetchChallengeProgress(challenge.id), isChallengeCardHidden(uid, challenge.id)]);
          return progress ? { challenge, progress, hidden } : null;
        }),
      ),
      since ? fetchPendingCompletions(uid, since) : Promise.resolve([]),
    ]);
    setNowMs(now);
    setItems(loaded.filter((x): x is Item => x !== null));
    setPending(todo);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function open(challengeId: string) {
    router.push(`/challenge/${challengeId}` as never);
  }

  async function hide(challengeId: string) {
    if (!uid) return;
    await hideChallengeCard(uid, challengeId);
    setItems((prev) => prev.map((it) => (it.challenge.id === challengeId ? { ...it, hidden: true } : it)));
    Alert.alert('이벤트 카드를 숨겼어요', '전체 탭의 이벤트 메뉴에서 언제든 다시 볼 수 있어요.');
  }

  const visible = items.filter(({ challenge, progress, hidden }) => {
    if (progress.enrolled) return true;
    return !hidden && nowMs <= new Date(challenge.ends_at).getTime();
  });
  if (visible.length === 0 && pending.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {/* 호스트: 완료 처리할 모임 */}
      {pending.length > 0 ? (
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={styles.icon}>
              <Ionicons name="checkmark-done" size={18} color="#07110C" />
            </View>
            <Text style={styles.title}>완료 처리할 모임 {pending.length}개</Text>
          </View>
          <Text style={styles.meta}>참석자를 확인해 완료 처리해야 참가자들의 이벤트 참여 횟수가 올라가요.</Text>
          {pending.slice(0, 3).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => router.push(`/meetup/complete/${m.id}` as never)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.todoRow, { opacity: pressed ? 0.85 : 1 }]}>
              <View style={styles.todoText}>
                <Text style={styles.todoTitle} numberOfLines={1}>
                  {m.title}
                </Text>
                <Text style={styles.todoSub}>{formatMeetupTime(m.start_time)}</Text>
              </View>
              <Text style={styles.moreText}>완료 처리</Text>
              <Ionicons name="chevron-forward" size={14} color={AppColors.primary} />
            </Pressable>
          ))}
          {pending.length > 3 ? <Text style={styles.todoSub}>외 {pending.length - 3}개 — 하나씩 처리하면 다음 모임이 나타나요.</Text> : null}
        </View>
      ) : null}

      {visible.map(({ challenge, progress }) => {
        const remaining = challengeRemainingLabel(challenge, nowMs);

        // 아직 참여 신청 전 — 참여 안내
        if (!progress.enrolled) {
          return (
            <View key={challenge.id} style={styles.card}>
              <View style={styles.topRow}>
                <View style={styles.icon}>
                  <Ionicons name="flash" size={18} color="#07110C" />
                </View>
                <Text style={styles.title} numberOfLines={1}>
                  {challenge.title}
                </Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{remaining}</Text>
                </View>
              </View>
              <Text style={styles.pitch}>
                번개 모임에 {challenge.goal_count}회 참석하면 달성! 인스타그램 아이디를 등록하면 참여할 수 있어요.
              </Text>
              <Text style={styles.meta}>{dailyLimitLabel(challenge)} · 참여 신청한 뒤의 참석부터 인정</Text>
              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => open(challenge.id)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.joinButton, { opacity: pressed ? 0.9 : 1 }]}>
                  <Text style={styles.joinText}>참여하기</Text>
                </Pressable>
                <Pressable onPress={() => hide(challenge.id)} accessibilityRole="button" hitSlop={8} style={styles.hideButton}>
                  <Text style={styles.hideText}>다시 보지 않기</Text>
                </Pressable>
              </View>
            </View>
          );
        }

        // 참여 중 — 내 진행률
        const goal = progress.goal_count;
        const achieved = progress.achieved;
        const ratio = goal > 0 ? Math.min(1, progress.progress / goal) : 0;
        return (
          <Pressable
            key={challenge.id}
            onPress={() => open(challenge.id)}
            accessibilityRole="button"
            accessibilityLabel={`${challenge.title} 이벤트 상세 보기`}
            style={({ pressed }) => [styles.card, achieved && styles.cardAchieved, { opacity: pressed ? 0.92 : 1 }]}>
            <View style={styles.topRow}>
              <View style={styles.icon}>
                <Ionicons name={achieved ? 'trophy' : 'flash'} size={18} color="#07110C" />
              </View>
              <Text style={styles.title} numberOfLines={1}>
                {challenge.title}
              </Text>
              <View style={[styles.badge, achieved && styles.badgeAchieved]}>
                <Text style={[styles.badgeText, achieved && styles.badgeTextAchieved]}>{achieved ? '달성 완료' : remaining}</Text>
              </View>
            </View>

            <View style={styles.countRow}>
              <Text style={styles.count}>{progress.progress}</Text>
              <Text style={styles.goal}> / {goal}</Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
            </View>

            <View style={styles.bottomRow}>
              <Text style={styles.meta} numberOfLines={1}>
                {dailyLimitLabel(challenge)}
                {achieved ? ` · ${remaining}` : ''}
              </Text>
              <View style={styles.more}>
                <Text style={styles.moreText}>이벤트 상세 보기</Text>
                <Ionicons name="chevron-forward" size={14} color={AppColors.primary} />
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: 'rgba(22,199,132,0.28)',
    padding: Spacing.three,
    gap: 10,
  },
  cardAchieved: { borderColor: AppColors.primary, backgroundColor: 'rgba(22,199,132,0.10)' },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9BE137',
  },
  title: { flex: 1, color: AppColors.textPrimary, fontSize: 16, fontWeight: '900' },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)' },
  badgeAchieved: { backgroundColor: AppColors.primary },
  badgeText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '800' },
  badgeTextAchieved: { color: '#07110C' },
  pitch: { color: AppColors.textPrimary, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  joinButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
  },
  joinText: { color: '#07110C', fontSize: 15, fontWeight: '900' },
  hideButton: { paddingHorizontal: 4, paddingVertical: 8 },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  todoText: { flex: 1 },
  todoTitle: { color: AppColors.textPrimary, fontSize: 14, fontWeight: '800' },
  todoSub: { color: AppColors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 },
  hideText: { color: AppColors.textMuted, fontSize: 13, fontWeight: '700' },
  countRow: { flexDirection: 'row', alignItems: 'baseline' },
  count: { color: AppColors.textPrimary, fontSize: 30, fontWeight: '900' },
  goal: { color: AppColors.textSecondary, fontSize: 18, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#1B242D', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: AppColors.primary },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  meta: { flex: 1, color: AppColors.textSecondary, fontSize: 13, fontWeight: '700' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  moreText: { color: AppColors.primary, fontSize: 13, fontWeight: '800' },
});
