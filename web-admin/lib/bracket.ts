import type { TournamentMatch } from './types';

// ── 조 편성 ─────────────────────────────────────────────
// entryIds 를 groupCount 조로 순차 분배하고, 각 조 라운드로빈 쌍을 만든다.
export function buildGroups(entryIds: string[], groupCount: number) {
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  entryIds.forEach((id, i) => groups[i % groupCount].push(id));
  const rows: { group_no: number; slot: number; entry1_id: string; entry2_id: string }[] = [];
  groups.forEach((members, gi) => {
    let slot = 0;
    for (let a = 0; a < members.length; a++) {
      for (let b = a + 1; b < members.length; b++) {
        rows.push({ group_no: gi + 1, slot: slot++, entry1_id: members[a], entry2_id: members[b] });
      }
    }
  });
  return { groups, rows };
}

// ── 조 순위 ─────────────────────────────────────────────
export type Standing = { id: string; played: number; wins: number; pf: number; pa: number; diff: number };

export function standings(members: string[], matches: TournamentMatch[]): Standing[] {
  const map = new Map<string, Standing>();
  members.forEach((id) => map.set(id, { id, played: 0, wins: 0, pf: 0, pa: 0, diff: 0 }));
  for (const m of matches) {
    if (m.status !== 'done' || m.score1 == null || m.score2 == null) continue;
    const s1 = m.entry1_id ? map.get(m.entry1_id) : undefined;
    const s2 = m.entry2_id ? map.get(m.entry2_id) : undefined;
    if (!s1 || !s2) continue;
    s1.played++; s2.played++;
    s1.pf += m.score1; s1.pa += m.score2;
    s2.pf += m.score2; s2.pa += m.score1;
    if (m.winner_id === s1.id) s1.wins++;
    else if (m.winner_id === s2.id) s2.wins++;
  }
  const arr = [...map.values()];
  arr.forEach((s) => (s.diff = s.pf - s.pa));
  arr.sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf);
  return arr;
}

// ── 진출자 시드 (각 조 1위들 → 각 조 2위들 → …) ──────────
export function seedQualifiers(standingsByGroup: Standing[][], advancePerGroup: number): string[] {
  const seeds: string[] = [];
  for (let rank = 0; rank < advancePerGroup; rank++) {
    for (const g of standingsByGroup) if (g[rank]) seeds.push(g[rank].id);
  }
  return seeds;
}

// 총 진출 인원 기준으로 랭크-우선(각 조 1위 → 각 조 2위 …) 시드 목록을 만들고 앞에서 N명.
export function seedQualifiersTotal(standingsByGroup: Standing[][], totalAdvance: number): string[] {
  const maxRank = Math.max(0, ...standingsByGroup.map((g) => g.length));
  const seeds: string[] = [];
  for (let rank = 0; rank < maxRank; rank++) {
    for (const g of standingsByGroup) if (g[rank]) seeds.push(g[rank].id);
  }
  return seeds.slice(0, Math.max(2, totalAdvance));
}

// 조당 목표 인원으로 조 개수 계산
export function groupCountForSize(n: number, perGroup: number): number {
  return Math.max(1, Math.ceil(n / Math.max(1, perGroup)));
}

// 표준 토너먼트 시드 순서(0-index). n 은 2의 거듭제곱.
function seedOrder(n: number): number[] {
  let seeds = [1, 2];
  const rounds = Math.log2(n);
  for (let r = 1; r < rounds; r++) {
    const sum = 2 ** (r + 1) + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds.map((x) => x - 1);
}

// ── 첫 토너먼트 라운드 쌍 (시드 기준, 2의 거듭제곱으로 패딩·부전승) ──
export function firstRoundPairs(seeds: string[]): [string, string | null][] {
  let size = 1;
  while (size < seeds.length) size *= 2;
  const s: (string | null)[] = [...seeds];
  while (s.length < size) s.push(null);
  const order = seedOrder(size);
  const bracket = order.map((i) => s[i] ?? null);
  const pairs: [string, string | null][] = [];
  for (let i = 0; i < size; i += 2) {
    const a = bracket[i];
    const b = bracket[i + 1];
    if (a) pairs.push([a, b]);
    else if (b) pairs.push([b, null]);
  }
  return pairs;
}

// 다음 라운드: 이전 라운드 승자들을 슬롯 순서대로 인접 페어링
export function nextRoundPairs(winnersInSlotOrder: string[]): [string, string | null][] {
  const pairs: [string, string | null][] = [];
  for (let i = 0; i < winnersInSlotOrder.length; i += 2) {
    pairs.push([winnersInSlotOrder[i], winnersInSlotOrder[i + 1] ?? null]);
  }
  return pairs;
}

export function roundName(playersInRound: number): string {
  if (playersInRound <= 2) return '결승';
  if (playersInRound <= 4) return '준결승';
  if (playersInRound <= 8) return '8강';
  if (playersInRound <= 16) return '16강';
  return `${playersInRound}강`;
}
