// 좌표 거리 계산 유틸

export type LatLng = { lat: number; lng: number };

const toRad = (d: number) => (d * Math.PI) / 180;

/** 두 좌표 간 거리(km) — 하버사인 공식 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371; // 지구 반지름(km)
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 거리(km) 표시: 1km 미만은 m */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}
