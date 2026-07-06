// 피넛 캐릭터 기본 아바타 25종.
// - 사진을 안 올린 사용자: 닉네임 기반으로 항상 같은 피넛이 배정된다(자동).
// - 프로필에서 직접 고르면 avatar_url 에 'peanut:NN'(1-based) 로 저장한다.
import type { ImageSourcePropType } from 'react-native';

export const PEANUT_AVATARS: ImageSourcePropType[] = [
  require('../../assets/images/avatars/peanut-01.png'),
  require('../../assets/images/avatars/peanut-02.png'),
  require('../../assets/images/avatars/peanut-03.png'),
  require('../../assets/images/avatars/peanut-04.png'),
  require('../../assets/images/avatars/peanut-05.png'),
  require('../../assets/images/avatars/peanut-06.png'),
  require('../../assets/images/avatars/peanut-07.png'),
  require('../../assets/images/avatars/peanut-08.png'),
  require('../../assets/images/avatars/peanut-09.png'),
  require('../../assets/images/avatars/peanut-10.png'),
  require('../../assets/images/avatars/peanut-11.png'),
  require('../../assets/images/avatars/peanut-12.png'),
  require('../../assets/images/avatars/peanut-13.png'),
  require('../../assets/images/avatars/peanut-14.png'),
  require('../../assets/images/avatars/peanut-15.png'),
  require('../../assets/images/avatars/peanut-16.png'),
  require('../../assets/images/avatars/peanut-17.png'),
  require('../../assets/images/avatars/peanut-18.png'),
  require('../../assets/images/avatars/peanut-19.png'),
  require('../../assets/images/avatars/peanut-20.png'),
  require('../../assets/images/avatars/peanut-21.png'),
  require('../../assets/images/avatars/peanut-22.png'),
  require('../../assets/images/avatars/peanut-23.png'),
  require('../../assets/images/avatars/peanut-24.png'),
  require('../../assets/images/avatars/peanut-25.png'),
];

export const PEANUT_COUNT = PEANUT_AVATARS.length;

// 시드(닉네임/ID)로 안정적인 기본 피넛 인덱스(0-based)
export function peanutIndexFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % PEANUT_COUNT;
}

// avatar_url 값에서 선택한 피넛 인덱스(0-based) 추출. 'peanut:07' → 6. 아니면 null.
export function peanutFromUrl(url?: string | null): number | null {
  if (!url) return null;
  const m = /^peanut:(\d{1,2})$/.exec(url);
  if (!m) return null;
  const idx = parseInt(m[1], 10) - 1;
  return idx >= 0 && idx < PEANUT_COUNT ? idx : null;
}

// 인덱스(0-based) → 저장용 문자열 'peanut:NN'(1-based)
export function peanutUrl(index0: number): string {
  return `peanut:${String(index0 + 1).padStart(2, '0')}`;
}
