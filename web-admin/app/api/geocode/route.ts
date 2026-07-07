import { NextResponse } from 'next/server';

// 네이버 클라우드 Geocoding 프록시.
// 주소 문자열 → { lat, lng, roadAddress, jibunAddress }.
// 키는 서버 전용 환경변수(NEXT_PUBLIC_ 아님):
//   NAVER_MAP_GEOCODE_ID  = X-NCP-APIGW-API-KEY-ID
//   NAVER_MAP_GEOCODE_KEY = X-NCP-APIGW-API-KEY
// 엔드포인트는 필요 시 NAVER_MAP_GEOCODE_URL 로 덮어쓸 수 있음(구/신 도메인 대응).

const DEFAULT_URL = 'https://maps.apigw.ntruss.com/map-geocode/v2/geocode';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('query')?.trim();
  if (!query) {
    return NextResponse.json({ error: '주소(query)가 필요합니다.' }, { status: 400 });
  }

  const id = process.env.NAVER_MAP_GEOCODE_ID;
  const key = process.env.NAVER_MAP_GEOCODE_KEY;
  if (!id || !key) {
    return NextResponse.json(
      { error: '지오코딩 키가 설정되지 않았어요. 관리자 웹 환경변수(NAVER_MAP_GEOCODE_ID/KEY)를 설정하거나 좌표를 직접 입력하세요.', code: 'no-key' },
      { status: 501 },
    );
  }

  const base = process.env.NAVER_MAP_GEOCODE_URL || DEFAULT_URL;
  const url = `${base}?query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': key },
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json({ error: `네이버 지오코딩 오류(${res.status}): ${body.slice(0, 200)}` }, { status: 502 });
    }
    const data = await res.json();
    const first = data?.addresses?.[0];
    if (!first) {
      return NextResponse.json({ error: '주소를 찾지 못했어요. 주소를 더 구체적으로 입력해보세요.', code: 'not-found' }, { status: 404 });
    }
    return NextResponse.json({
      lat: Number(first.y),
      lng: Number(first.x),
      roadAddress: first.roadAddress ?? '',
      jibunAddress: first.jibunAddress ?? '',
    });
  } catch (e) {
    return NextResponse.json({ error: `지오코딩 요청 실패: ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
  }
}
