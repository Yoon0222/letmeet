import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
};

type Props = {
  /** 오늘 (YYYY-MM-DD) — 부모가 상태로 전달(렌더 중 new Date() 금지) */
  todayYmd: string;
  selected: string | null;
  onSelectDay: (ymd: string) => void;
  /** 탭 가능한 날짜 집합. 이 집합에 없는 날은 비활성(흐리게). */
  enabledDays: Set<string>;
  /** 강조(점) 표시할 날짜 집합 (예: 오픈일 전체) */
  markedDays?: Set<string>;
};

export function MonthCalendar({ todayYmd, selected, onSelectDay, enabledDays, markedDays }: Props) {
  const theme = useTheme();
  const init = parse(selected ?? todayYmd);
  const [view, setView] = useState<{ y: number; m: number }>({ y: init.y, m: init.m });

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => {
    const m = view.m + delta;
    const y = view.y + Math.floor(m / 12);
    setView({ y, m: ((m % 12) + 12) % 12 });
  };

  return (
    <View style={styles.wrap}>
      {/* 헤더 */}
      <View style={styles.headerRow}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.navBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.textSecondary} />
        </Pressable>
        <Text style={[styles.monthTitle, { color: theme.text }]}>
          {view.y}년 {view.m + 1}월
        </Text>
        <Pressable onPress={() => shift(1)} hitSlop={10} style={styles.navBtn}>
          <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

      {/* 요일 */}
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, { color: i === 0 ? '#E5484D' : i === 6 ? '#3E63DD' : theme.textSecondary }]}>
            {w}
          </Text>
        ))}
      </View>

      {/* 날짜 그리드 */}
      <View style={styles.grid}>
        {cells.map((d, idx) => {
          if (d == null) return <View key={`b${idx}`} style={styles.cell} />;
          const key = toYmd(view.y, view.m, d);
          const enabled = enabledDays.has(key);
          const marked = markedDays?.has(key);
          const isSel = key === selected;
          const isToday = key === todayYmd;
          return (
            <Pressable
              key={key}
              disabled={!enabled}
              onPress={() => onSelectDay(key)}
              style={styles.cell}>
              <View style={[styles.dayInner, isSel && { backgroundColor: theme.primary }, !isSel && marked && { backgroundColor: theme.backgroundElement }]}>
                <Text
                  style={[
                    styles.dayText,
                    { color: isSel ? '#fff' : enabled ? theme.text : theme.tabIconDefault },
                    !enabled && styles.dayDisabled,
                    isToday && !isSel && { color: theme.primary, fontWeight: '800' },
                  ]}>
                  {d}
                </Text>
                {marked && !isSel ? <View style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  navBtn: { padding: 4 },
  monthTitle: { fontSize: 16, fontWeight: '800' },
  weekRow: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, fontWeight: '600' },
  dayDisabled: { opacity: 0.35 },
  dot: { position: 'absolute', bottom: 4, width: 4, height: 4, borderRadius: 2 },
});
