import { useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

// DUPR 레이팅 히스토리 라인차트 (순수 RN View — 네이티브 의존성 없음, 웹에서도 렌더).
// 데이터: 시간순 포인트. doubles/singles 각각 null 가능(미채점 구간).
export type DuprPoint = { at: number; doubles: number | null; singles: number | null };

const GREEN = '#16C784'; // 복식
const BLUE = '#2D6BD6'; // 단식
const GRID = '#EEF0F3';
const AXIS = '#9CA3AF';

type Series = { key: 'doubles' | 'singles'; label: string; color: string };
const SERIES: Series[] = [
  { key: 'doubles', label: '복식', color: GREEN },
  { key: 'singles', label: '단식', color: BLUE },
];

// 한 시리즈의 라인을 세그먼트(회전한 얇은 View)로 그린다.
function Line({
  points,
  color,
}: {
  points: { x: number; y: number }[];
  color: string;
}) {
  return (
    <>
      {points.slice(1).map((p, i) => {
        const a = points[i];
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <View
            key={`seg-${i}`}
            style={{
              position: 'absolute',
              left: a.x,
              top: a.y - 1.25,
              width: len,
              height: 2.5,
              borderRadius: 2,
              backgroundColor: color,
              transformOrigin: 'left center',
              transform: [{ rotateZ: `${angle}deg` }],
            }}
          />
        );
      })}
      {points.map((p, i) => (
        <View
          key={`dot-${i}`}
          style={{
            position: 'absolute',
            left: p.x - 3,
            top: p.y - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: '#FFFFFF',
            borderWidth: 2,
            borderColor: color,
          }}
        />
      ))}
    </>
  );
}

export function DuprRatingChart({ data }: { data: DuprPoint[] }) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const H = 168; // 플롯 높이
  const padL = 34; // y축 라벨 공간
  const padR = 8;
  const padT = 8;
  const padB = 18; // x축 라벨 공간
  const plotW = Math.max(0, w - padL - padR);
  const plotH = H - padT - padB;

  const model = useMemo(() => {
    const pts = [...data].sort((a, b) => a.at - b.at);
    const vals: number[] = [];
    pts.forEach((p) => {
      if (p.doubles != null) vals.push(p.doubles);
      if (p.singles != null) vals.push(p.singles);
    });
    if (vals.length === 0) return null;
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    // 여유 패딩 + 최소 폭 확보
    const pad = Math.max(0.15, (max - min) * 0.25);
    min = Math.max(2, Math.floor((min - pad) * 10) / 10);
    max = Math.min(8, Math.ceil((max + pad) * 10) / 10);
    if (max - min < 0.4) {
      max = Math.min(8, min + 0.4);
    }
    const n = pts.length;
    const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yAt = (v: number) => padT + plotH * (1 - (v - min) / (max - min));
    const seriesPts = SERIES.map((s) => ({
      ...s,
      pts: pts
        .map((p, i) => ({ i, v: p[s.key] }))
        .filter((p) => p.v != null)
        .map((p) => ({ x: xAt(p.i), y: yAt(p.v as number) })),
      last: [...pts].reverse().find((p) => p[s.key] != null)?.[s.key] ?? null,
      first: pts.find((p) => p[s.key] != null)?.[s.key] ?? null,
    }));
    return { pts, min, max, xAt, yAt, seriesPts };
  }, [data, plotW, plotH, padL, padT]);

  if (!model) return null;

  const { min, max, seriesPts, pts } = model;
  const mid = Math.round(((min + max) / 2) * 10) / 10;
  const fmtDate = (t: number) => {
    const d = new Date(t);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <View>
      {/* 헤더: 현재 레이팅 + 변화 */}
      <View style={styles.headRow}>
        {seriesPts.map((s) => {
          if (s.last == null) return null;
          const delta = s.first != null ? Math.round((s.last - s.first) * 10) / 10 : 0;
          const up = delta > 0;
          const flat = delta === 0;
          return (
            <View key={s.key} style={styles.headItem}>
              <View style={[styles.dot, { backgroundColor: s.color }]} />
              <Text style={styles.headLabel}>{s.label}</Text>
              <Text style={[styles.headVal, { color: s.color }]}>{s.last.toFixed(3)}</Text>
              {!flat && (
                <Text style={[styles.delta, { color: up ? GREEN : '#E5484D' }]}>
                  {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}
                </Text>
              )}
            </View>
          );
        })}
      </View>

      {/* 플롯 */}
      <View style={[styles.plot, { height: H }]} onLayout={onLayout}>
        {w > 0 && (
          <>
            {/* 가로 그리드 3줄 + y라벨 */}
            {[max, mid, min].map((v, idx) => {
              const y = padT + plotH * (idx / 2);
              return (
                <View key={`grid-${idx}`}>
                  <View style={[styles.grid, { top: y, left: padL, right: padR }]} />
                  <Text style={[styles.yLabel, { top: y - 7 }]}>{v.toFixed(1)}</Text>
                </View>
              );
            })}
            {/* 라인 */}
            {seriesPts.map((s) => (s.pts.length ? <Line key={s.key} points={s.pts} color={s.color} /> : null))}
            {/* x축 처음/끝 날짜 */}
            {pts.length > 0 && (
              <>
                <Text style={[styles.xLabel, { left: padL }]}>{fmtDate(pts[0].at)}</Text>
                <Text style={[styles.xLabel, { right: padR }]}>{fmtDate(pts[pts.length - 1].at)}</Text>
              </>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', gap: Spacing.three, flexWrap: 'wrap', marginBottom: 8 },
  headItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  headLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  headVal: { fontSize: 18, fontWeight: '800' },
  delta: { fontSize: 12, fontWeight: '800' },
  plot: { position: 'relative', width: '100%' },
  grid: { position: 'absolute', height: 1, backgroundColor: GRID },
  yLabel: { position: 'absolute', left: 0, width: 30, textAlign: 'right', fontSize: 10, color: AXIS },
  xLabel: { position: 'absolute', bottom: 0, fontSize: 10, color: AXIS },
});
