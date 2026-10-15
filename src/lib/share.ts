// 번개 공유 — 웹(pinut.org)의 공개 모임 페이지 주소를 휴대폰 공유창으로 보낸다.
//   받은 사람은 로그인 없이 모임 요약을 보고, 앱이 있으면 앱에서 그 모임을 연다(web-admin/app/m/[id]).
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Share } from 'react-native';

import type { Meetup } from '@/lib/types';

const SHARE_BASE_URL = 'https://pinut.org';

/** 번개 공유 주소: https://pinut.org/m/<모임 id> */
export function meetupShareUrl(meetupId: string): string {
  return `${SHARE_BASE_URL}/m/${meetupId}`;
}

/**
 * 휴대폰 공유창(카카오톡·문자 등)으로 번개를 보낸다. 실패하면 false(사용자가 닫은 것은 성공으로 친다).
 *   · 날짜는 "오늘/내일" 대신 날짜로 쓴다 — 받은 사람이 다음 날 읽어도 헷갈리지 않게.
 *   · 주소는 글 안에 넣는다 — 안드로이드는 url 칸을 따로 받지 않고, iOS 는 따로 주면 앱에 따라 주소가 두 번 붙는다.
 */
export async function shareMeetup(m: Pick<Meetup, 'id' | 'title' | 'start_time' | 'location_name'>): Promise<boolean> {
  const when = format(new Date(m.start_time), 'M월 d일 (EEE) a h:mm', { locale: ko });
  const message = `[피넛 번개] ${m.title}\n${when} · ${m.location_name}\n${meetupShareUrl(m.id)}`;
  try {
    await Share.share({ message });
    return true;
  } catch {
    return false;
  }
}
