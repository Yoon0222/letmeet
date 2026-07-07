// 피넛 기본 아바타 (모바일 src/constants/avatars.ts 와 동일 규칙).
// - 'peanut:NN' → /avatars/peanut-NN.png
// - http(s) URL → 그대로 (업로드 사진)
// - 없으면 닉네임 시드로 항상 같은 기본 피넛 배정
const PEANUT_COUNT = 25;

function peanutIndexFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % PEANUT_COUNT;
}

function peanutPath(index0: number): string {
  return `/avatars/peanut-${String(index0 + 1).padStart(2, '0')}.png`;
}

export function avatarSrc(avatarUrl: string | null | undefined, nickname: string): string {
  if (avatarUrl) {
    const m = /^peanut:(\d{1,2})$/.exec(avatarUrl);
    if (m) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < PEANUT_COUNT) return peanutPath(idx);
    } else if (/^https?:\/\//.test(avatarUrl)) {
      return avatarUrl;
    }
  }
  return peanutPath(peanutIndexFor(nickname || '?'));
}
