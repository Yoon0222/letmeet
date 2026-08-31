// 버전 문자열 비교 — "3.1.10" 을 숫자 배열로 파싱해 비교(자연 정렬).
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

// current 가 target 미만이면 true (업데이트 필요). target 이 '0.0.0'/빈값이면 항상 false(게이트 비활성).
export function isBelow(current: string, target: string): boolean {
  if (!target || target === '0.0.0') return false;
  return compareVersions(current, target) < 0;
}
