import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import type { EventPopupRow } from '@/lib/types';
import { AppColors } from '@/theme';

// 팝업별로 "오늘 하루 보지 않기"를 따로 기억 (새 팝업은 이전 숨김에 영향 안 받음)
const storageKey = (id: string) => `pinut:event-popup:${id}:hidden-date`;

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function EventPopup() {
  // 노출 대상 팝업을 큐로 담아 순차 표시 (여러 개 올려두면 하나씩 넘어감)
  const [queue, setQueue] = useState<EventPopupRow[]>([]);
  const [idx, setIdx] = useState(0);
  // 홈이 실제로 focus 됐을 때만 노출 (RN Modal 은 최상단에 떠서, 로그인 화면 등으로 이동해도 남는 걸 방지)
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    let mounted = true;

    (async () => {
      // 활성 팝업 중 노출 기간에 든 것 전부 (기간은 null 이면 제한 없음)
      const { data } = await supabase
        .from('event_popups')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!mounted) return;
      const now = Date.now();
      const live = (data ?? []).filter(
        (p) =>
          (!p.starts_at || new Date(p.starts_at).getTime() <= now) &&
          (!p.ends_at || new Date(p.ends_at).getTime() >= now),
      );

      // 오늘 "보지 않기" 누른 팝업은 제외 (팝업별로 따로 기억)
      const today = todayKey();
      const pending: EventPopupRow[] = [];
      for (const p of live) {
        let stored: string | null = null;
        try {
          stored = await AsyncStorage.getItem(storageKey(p.id));
        } catch {
          stored = null;
        }
        if (stored !== today) pending.push(p);
      }
      if (!mounted) return;
      setQueue(pending);
      setIdx(0);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const current = queue[idx] ?? null;
  const hasNext = idx < queue.length - 1;

  // 다음 팝업으로 (마지막이면 idx 가 범위를 넘어 모달이 닫힘)
  function next() {
    setIdx((i) => i + 1);
  }

  async function hideToday() {
    if (current) {
      try {
        await AsyncStorage.setItem(storageKey(current.id), todayKey());
      } catch {
        // 저장 실패해도 다음으로 진행
      }
    }
    next();
  }

  if (!current || !focused) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={next}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Pressable onPress={next} hitSlop={10} style={styles.close}>
            <Ionicons name="close" size={20} color={AppColors.textSecondary} />
          </Pressable>

          {current.image_url ? <Image source={{ uri: current.image_url }} style={styles.banner} resizeMode="cover" /> : null}

          <View style={styles.badge}>
            <Ionicons name="sparkles-outline" size={18} color={AppColors.primary} />
            <Text style={styles.badgeText}>EVENT</Text>
          </View>

          <Text style={styles.title}>{current.title}</Text>
          {current.body ? <Text style={styles.body}>{current.body}</Text> : null}
          {queue.length > 1 ? (
            <Text style={styles.counter}>
              {idx + 1} / {queue.length}
            </Text>
          ) : null}

          <View style={styles.actionRow}>
            <Pressable onPress={hideToday} style={styles.secondaryButton}>
              <Text style={styles.secondaryText}>오늘 하루 보지 않기</Text>
            </Pressable>
            <Pressable onPress={next} style={styles.primaryButton}>
              <Text style={styles.primaryText}>{hasNext ? '다음' : '확인'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    padding: Spacing.four,
    borderWidth: 1,
    borderColor: AppColors.border,
    boxShadow: '0 18px 42px rgba(0, 0, 0, 0.34)',
  },
  close: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 36,
    height: 36,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surfaceSoft,
    marginBottom: Spacing.three,
  },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: AppColors.primary,
  },
  title: {
    marginTop: Spacing.three,
    paddingRight: 44,
    fontSize: 26,
    fontWeight: '800',
    color: AppColors.textPrimary,
  },
  body: {
    marginTop: Spacing.two,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
    color: AppColors.textSecondary,
  },
  counter: {
    marginTop: Spacing.two,
    alignSelf: 'flex-end',
    fontSize: 13,
    fontWeight: '700',
    color: AppColors.textMuted,
  },
  actionRow: {
    marginTop: Spacing.four,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  secondaryButton: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: AppColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surfaceSoft,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '800',
    color: AppColors.textSecondary,
  },
  primaryButton: {
    width: 92,
    height: 56,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.primary,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
