// 아메리카노/믹서 복식 대진 생성 (순수함수 — 클럽 세션에서 사용).
//   참석자 목록 + 코트 수 + 라운드 수 → 라운드별 복식 매치 배열.
//   매 판 파트너·상대를 섞고, 4의 배수가 아니면 대기(휴식)를 라운드마다 로테이션.
//   완벽 균형(모두와 정확히 N번)은 조합최적화 문제라, 실사용에 충분한 휴리스틱을 쓴다.

export type AmericanoMatch = {
  round: number; // 1-based
  court: number; // 1-based
  team1: [string, string];
  team2: [string, string];
};

// 4명 그룹 안에서 파트너 조합 3가지를 라운드마다 번갈아 → 같은 코트라도 파트너가 계속 바뀐다.
const PAIR_PATTERNS: [[number, number], [number, number]][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function rotate<T>(arr: T[], by: number): T[] {
  const n = arr.length;
  if (n === 0) return arr;
  const k = ((by % n) + n) % n;
  return arr.slice(k).concat(arr.slice(0, k));
}

/**
 * 아메리카노 복식 대진 생성.
 * @param players 참석자 id 목록 (최소 4명)
 * @param courtCount 동시 사용 코트 수 (>=1)
 * @param rounds 라운드 수 (>=1)
 */
export function generateAmericano(players: string[], courtCount: number, rounds: number): AmericanoMatch[] {
  const n = players.length;
  const result: AmericanoMatch[] = [];
  if (n < 4 || courtCount < 1 || rounds < 1) return result;

  // 한 라운드에 실제로 뛸 인원(4의 배수) — 코트 수와 인원 중 작은 쪽에 맞춘다.
  const courtsPerRound = Math.min(courtCount, Math.floor(n / 4));
  const activeCount = courtsPerRound * 4;
  const sitOut = n - activeCount; // 라운드마다 쉬는 인원 수

  let order = [...players];
  for (let r = 0; r < rounds; r++) {
    const active = order.slice(0, activeCount);
    for (let c = 0; c < courtsPerRound; c++) {
      const four = active.slice(c * 4, c * 4 + 4);
      const pat = PAIR_PATTERNS[(r + c) % PAIR_PATTERNS.length];
      result.push({
        round: r + 1,
        court: c + 1,
        team1: [four[pat[0][0]], four[pat[0][1]]],
        team2: [four[pat[1][0]], four[pat[1][1]]],
      });
    }
    // 다음 라운드: 쉬는 인원이 있으면 그만큼 밀어 대기자를 교체, 없으면 파트너 다양화를 위해 한 칸.
    order = rotate(order, sitOut > 0 ? activeCount : 1);
  }
  return result;
}

// 라운드에서 쉬는(대기) 인원 계산 — 표시용.
export function sitOutCount(playerCount: number, courtCount: number): number {
  if (playerCount < 4) return playerCount;
  const courtsPerRound = Math.min(courtCount, Math.floor(playerCount / 4));
  return playerCount - courtsPerRound * 4;
}

export type AmericanoStanding = {
  userId: string;
  played: number; // 뛴 판 수
  points: number; // 아메리카노 개인 누적 점수(자기 팀이 낸 점수 합)
  wins: number;
};

// 완료된 매치들로 개인 순위 집계 (점수 내림차순 → 승 → 판수 적은 순).
export function americanoStandings(
  matches: {
    team1_player1: string;
    team1_player2: string | null;
    team2_player1: string;
    team2_player2: string | null;
    team1_score: number;
    team2_score: number;
    status: string;
  }[],
): AmericanoStanding[] {
  const map = new Map<string, AmericanoStanding>();
  const ensure = (id: string) => {
    let s = map.get(id);
    if (!s) {
      s = { userId: id, played: 0, points: 0, wins: 0 };
      map.set(id, s);
    }
    return s;
  };
  for (const m of matches) {
    if (m.status !== 'done') continue;
    const t1 = [m.team1_player1, m.team1_player2].filter(Boolean) as string[];
    const t2 = [m.team2_player1, m.team2_player2].filter(Boolean) as string[];
    const t1Win = m.team1_score > m.team2_score;
    const t2Win = m.team2_score > m.team1_score;
    for (const id of t1) {
      const s = ensure(id);
      s.played += 1;
      s.points += m.team1_score;
      if (t1Win) s.wins += 1;
    }
    for (const id of t2) {
      const s = ensure(id);
      s.played += 1;
      s.points += m.team2_score;
      if (t2Win) s.wins += 1;
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => b.points - a.points || b.wins - a.wins || a.played - b.played,
  );
}
