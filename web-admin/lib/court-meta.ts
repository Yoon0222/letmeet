// 코트 바닥 종류 · 편의시설 공유 상수 (관리자 웹)
export const SURFACES: { key: string; label: string }[] = [
  { key: 'hard', label: '하드' },
  { key: 'urethane', label: '우레탄' },
  { key: 'artificial_turf', label: '인조잔디' },
  { key: 'modular', label: '모듈러(스포츠코트)' },
  { key: 'asphalt', label: '아스팔트' },
  { key: 'concrete', label: '콘크리트' },
  { key: 'other', label: '기타' },
];
export const surfaceLabel = (k: string) => SURFACES.find((s) => s.key === k)?.label ?? k;

export const AMENITIES: { key: string; label: string; emoji: string }[] = [
  { key: 'parking', label: '주차장', emoji: '🅿️' },
  { key: 'shower', label: '샤워실', emoji: '🚿' },
  { key: 'restroom', label: '화장실', emoji: '🚻' },
  { key: 'locker', label: '탈의실', emoji: '🧳' },
  { key: 'store', label: '매점', emoji: '🏪' },
  { key: 'rental', label: '장비대여', emoji: '🎾' },
  { key: 'lighting', label: '야간조명', emoji: '💡' },
  { key: 'rest_area', label: '휴게공간', emoji: '🛋️' },
];
export const amenityLabel = (k: string) => AMENITIES.find((a) => a.key === k)?.label ?? k;
