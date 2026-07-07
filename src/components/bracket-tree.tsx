import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { TournamentMatch } from '@/lib/types';

// 토너먼트 대진을 좌→우 트리(브래킷)로 그린다. 조별리그는 별도(순위표).
const BOX_W = 150;
const BOX_H = 54;
const ROW_GAP = 16;
const COL_GAP = 30;
const LINE = 1.5;

type Theme = ReturnType<typeof useTheme>;

function HLine({ x, y, w, color }: { x: number; y: number; w: number; color: string }) {
  return <View style={{ position: 'absolute', left: x, top: y - LINE / 2, width: Math.max(0, w), height: LINE, backgroundColor: color }} />;
}
function VLine({ x, y1, y2, color }: { x: number; y1: number; y2: number; color: string }) {
  return <View style={{ position: 'absolute', left: x - LINE / 2, top: y1, width: LINE, height: Math.max(0, y2 - y1), backgroundColor: color }} />;
}

function Side({
  name,
  score,
  win,
  theme,
  border,
}: {
  name: string;
  score: number | null;
  win: boolean;
  theme: Theme;
  border?: boolean;
}) {
  return (
    <View
      style={[
        styles.side,
        border && { borderBottomWidth: 1, borderBottomColor: theme.border },
      ]}>
      <Text style={[styles.name, { color: theme.text, fontWeight: win ? '800' : '500' }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.score, { color: win ? theme.primary : theme.textSecondary }]}>
        {score == null ? '·' : score}
      </Text>
    </View>
  );
}

function MatchBox({ m, nameOf, uid, theme }: { m: TournamentMatch; nameOf: (id: string | null) => string; uid: string | undefined; theme: Theme }) {
  const done = m.status === 'done';
  const w1 = done && !!m.winner_id && m.winner_id === m.entry1_id;
  const w2 = done && !!m.winner_id && m.winner_id === m.entry2_id;
  const mine = m.entry1_id === uid || m.entry2_id === uid;
  // 빈 슬롯: 확정 부전승은 '부전승', 아직 안 정해진 다음 라운드는 '미정'
  const label = (id: string | null) => (id ? nameOf(id) : done ? '부전승' : '미정');
  return (
    <View style={[styles.box, { borderColor: mine ? theme.primary : theme.border, backgroundColor: theme.card }]}>
      <Side name={label(m.entry1_id)} score={done ? m.score1 : null} win={w1} theme={theme} border />
      <Side name={label(m.entry2_id)} score={done ? m.score2 : null} win={w2} theme={theme} />
    </View>
  );
}

export function BracketTree({
  matches,
  nameOf,
  uid,
}: {
  matches: TournamentMatch[];
  nameOf: (id: string | null) => string;
  uid: string | undefined;
}) {
  const theme = useTheme();

  const roundOrders = [...new Set(matches.map((m) => m.round_order ?? 0))].sort((a, b) => a - b);
  const rounds = roundOrders.map((ro) =>
    matches.filter((m) => (m.round_order ?? 0) === ro).sort((a, b) => a.slot - b.slot),
  );
  if (rounds.length === 0) return null;

  const n0 = rounds[0].length;
  const unit = BOX_H + ROW_GAP;
  const totalH = Math.max(unit, n0 * unit);

  // 라운드/매치별 세로 중심 좌표 (다음 라운드는 두 피더의 중점)
  const centers: number[][] = [];
  rounds.forEach((rms, r) => {
    if (r === 0) {
      centers.push(rms.map((_, j) => j * unit + unit / 2));
    } else {
      const prev = centers[r - 1];
      centers.push(
        rms.map((_, j) => {
          const a = prev[2 * j] ?? prev[prev.length - 1];
          const b = prev[2 * j + 1] ?? a;
          return (a + b) / 2;
        }),
      );
    }
  });

  const colX = (r: number) => r * (BOX_W + COL_GAP);

  // 우승자 (마지막 라운드가 1경기이고 종료된 경우)
  const last = rounds[rounds.length - 1];
  const champion = last.length === 1 && last[0].status === 'done' ? last[0].winner_id : null;
  const totalW = rounds.length * (BOX_W + COL_GAP) - COL_GAP + (champion ? BOX_W + COL_GAP : 0) + 8;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
      <View style={{ width: totalW, height: totalH, position: 'relative' }}>
        {/* 연결선 */}
        {rounds.map((rms, r) =>
          r === 0
            ? null
            : rms.map((m, j) => {
                const prev = centers[r - 1];
                const aY = prev[2 * j] ?? centers[r][j];
                const bY = prev[2 * j + 1] ?? aY;
                const mY = centers[r][j];
                const xFeederRight = colX(r - 1) + BOX_W;
                const xM = colX(r);
                const midX = (xFeederRight + xM) / 2;
                return (
                  <View key={`c${r}-${j}`} pointerEvents="none">
                    <HLine x={xFeederRight} y={aY} w={midX - xFeederRight} color={theme.border} />
                    {bY !== aY && <HLine x={xFeederRight} y={bY} w={midX - xFeederRight} color={theme.border} />}
                    <VLine x={midX} y1={Math.min(aY, bY)} y2={Math.max(aY, bY)} color={theme.border} />
                    <HLine x={midX} y={mY} w={xM - midX} color={theme.border} />
                  </View>
                );
              }),
        )}
        {/* 우승 연결선 */}
        {champion && (
          <HLine
            x={colX(rounds.length - 1) + BOX_W}
            y={centers[rounds.length - 1][0]}
            w={COL_GAP}
            color={theme.primary}
          />
        )}

        {/* 경기 박스 */}
        {rounds.map((rms, r) =>
          rms.map((m, j) => (
            <View key={m.id} style={{ position: 'absolute', left: colX(r), top: centers[r][j] - BOX_H / 2, width: BOX_W }}>
              <MatchBox m={m} nameOf={nameOf} uid={uid} theme={theme} />
            </View>
          )),
        )}

        {/* 우승자 */}
        {champion && (
          <View
            style={{
              position: 'absolute',
              left: colX(rounds.length),
              top: centers[rounds.length - 1][0] - BOX_H / 2,
              width: BOX_W,
            }}>
            <View style={[styles.champBox, { borderColor: theme.primary, backgroundColor: theme.card }]}>
              <Text style={[styles.champText, { color: theme.primary }]} numberOfLines={1}>
                🏆 {nameOf(champion)}
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 8, overflow: 'hidden', height: BOX_H },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, gap: 6 },
  name: { flex: 1, fontSize: 13 },
  score: { fontSize: 14, fontWeight: '800', minWidth: 14, textAlign: 'right' },
  champBox: { height: BOX_H, borderWidth: 1.5, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  champText: { fontSize: 14, fontWeight: '800' },
});
