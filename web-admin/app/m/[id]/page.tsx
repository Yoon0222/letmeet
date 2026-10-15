import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { cache } from 'react';
import { CalendarClock, Gauge, MapPin, Users, Wallet } from 'lucide-react';

import { isConfigured, supabase } from '@/lib/supabase';
import type { MeetupShareRow } from '@/lib/types';

// 번개 공유 페이지 — 앱의 "공유" 버튼이 보내는 주소(https://pinut.org/m/<모임 id>, 앱 src/lib/share.ts).
//   로그인 없이 모임 요약만 보여 준다. 누구나 볼 수 있는 웹이라 호스트·참가자 닉네임과 모임 설명은 싣지 않는다.
//   카카오톡 등의 링크 미리보기(OG 태그)를 위해 서버에서 그리고, 검색 엔진에는 올리지 않는다(noindex).
//   휴대폰이면 "피넛 앱에서 보기": 안드로이드는 앱이 없으면 Play 스토어로 넘어가고, iOS 는 스토어 버튼을 따로 둔다.
export const dynamic = 'force-dynamic';

const SITE = 'https://pinut.org';
const APP_STORE_URL = 'https://apps.apple.com/kr/app/%ED%94%BC%EB%84%9B/id6789043942';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.pinut.app&hl=ko';
const DEFAULT_IMAGE = '/landing-hero-pinut-v2.png';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Props = { params: Promise<{ id: string }> };
type Phase = { label: string; open: boolean };
type Shared = { meetup: MeetupShareRow; phase: Phase };

// 모임의 지금 상태(서버 시각 기준)
function phaseOf(m: MeetupShareRow, nowMs: number): Phase {
  const start = Date.parse(m.start_time);
  const end = start + m.duration_min * 60000;
  if (m.status === 'cancelled') return { label: '취소된 모임', open: false };
  if (nowMs >= end) return { label: '끝난 모임', open: false };
  if (nowMs >= start) return { label: '진행 중', open: false };
  const left = m.max_players - m.participant_count;
  if (m.status === 'closed' || left <= 0) return { label: '모집 마감', open: false };
  return { label: `모집 중 · ${left}자리 남음`, open: true };
}

// 메타데이터와 화면이 같은 요청에서 한 번만 읽도록. null = 없음(주소가 틀렸거나 지워짐), undefined = 못 읽음
const getShared = cache(async (id: string): Promise<Shared | null | undefined> => {
  if (!UUID_RE.test(id)) return null;
  if (!isConfigured) return undefined;
  const { data, error } = await supabase
    .from('meetups_with_counts')
    .select(
      'id, title, location_name, region, start_time, duration_min, skill_min, skill_max, max_players, fee, discipline, status, image_url, dupr_certified, dupr_premium, participant_count',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return undefined;
  if (!data) return null;
  return { meetup: data, phase: phaseOf(data, Date.now()) };
});

// 한국 시간: '10월 17일 (토) 오후 7:00' — 서버(UTC)와 무관하게
function kstWhen(iso: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  const h = Number(p.hour);
  return `${p.month}월 ${p.day}일 (${p.weekday}) ${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${p.minute}`;
}

function durationText(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}시간${m ? ` ${m}분` : ''}` : `${m}분`;
}

function skillText(m: MeetupShareRow): string {
  if (m.skill_min <= 2 && m.skill_max >= 8) return '실력 무관';
  return `실력 ${Number(m.skill_min).toFixed(1)} ~ ${Number(m.skill_max).toFixed(1)}`;
}

const DISCIPLINE: Record<MeetupShareRow['discipline'], string> = { any: '자유', singles: '단식', doubles: '복식' };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const shared = await getShared(id);
  const base: Metadata = { metadataBase: new URL(SITE), robots: { index: false, follow: false } };
  if (!shared) return { ...base, title: '피넛 번개', description: '피넛에서 가까운 코트의 번개 모임을 찾아보세요.' };
  const { meetup: m, phase } = shared;
  const title = `[피넛 번개] ${m.title}`;
  const description = [phase.label, kstWhen(m.start_time), m.location_name, `${m.participant_count}/${m.max_players}명`, skillText(m)].join(' · ');
  const image = m.image_url || DEFAULT_IMAGE;
  return {
    ...base,
    title,
    description,
    openGraph: { type: 'website', siteName: '피넛', locale: 'ko_KR', url: `/m/${m.id}`, title, description, images: [{ url: image }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

export default async function SharedMeetupPage({ params }: Props) {
  const { id } = await params;
  const shared = await getShared(id);
  const ua = (await headers()).get('user-agent') ?? '';
  const platform = /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'other';
  // 앱 열기: 안드로이드는 intent 주소(앱이 없으면 Play 스토어로), iOS 는 앱 주소. 컴퓨터에서는 보여 주지 않는다.
  const openHref =
    !shared ? null
    : platform === 'android'
      ? `intent://meetup/${shared.meetup.id}#Intent;scheme=pickleball;package=com.pinut.app;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`
      : platform === 'ios'
        ? `pickleball://meetup/${shared.meetup.id}`
        : null;

  return (
    <div className="relative left-1/2 -my-8 min-h-screen w-screen -translate-x-1/2 bg-[#070A0D] px-5 py-10 text-white">
      <div className="mx-auto max-w-md">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-black text-[#16C784]">
          <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#16C784] text-[#07110C]">P!</span>
          P!NUT
        </Link>

        {shared === undefined ? (
          <Notice title="모임 정보를 불러오지 못했어요" body="잠시 후 다시 열어 주세요." />
        ) : shared === null ? (
          <Notice title="모임을 찾을 수 없어요" body="삭제됐거나 주소가 잘못됐어요. 피넛 앱에서 다른 번개를 찾아보세요." />
        ) : (
          <section className="mt-8 rounded-3xl border border-white/10 bg-[#10161D] p-6">
            <div className="flex flex-wrap gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${shared.phase.open ? 'bg-[#16C784] text-[#07110C]' : 'bg-white/10 text-white/70'}`}>
                {shared.phase.label}
              </span>
              {shared.meetup.discipline !== 'any' ? (
                <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-black text-sky-300">{DISCIPLINE[shared.meetup.discipline]}</span>
              ) : null}
              {shared.meetup.dupr_certified ? <span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-black text-blue-300">DUPR 인증</span> : null}
              {shared.meetup.dupr_premium ? <span className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-black text-violet-300">DUPR+ 전용</span> : null}
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.18em] text-[#16C784]">피넛 번개</p>
            <h1 className="mt-1 break-words text-2xl font-black leading-snug">{shared.meetup.title}</h1>

            <ul className="mt-6 space-y-4 text-[15px] font-semibold">
              <Row icon={<CalendarClock size={20} />}>
                {kstWhen(shared.meetup.start_time)}
                <span className="text-white/50"> · {durationText(shared.meetup.duration_min)}</span>
              </Row>
              <Row icon={<MapPin size={20} />}>
                {shared.meetup.location_name}
                {shared.meetup.region ? <span className="text-white/50"> · {shared.meetup.region}</span> : null}
              </Row>
              <Row icon={<Users size={20} />}>
                참가 {shared.meetup.participant_count}/{shared.meetup.max_players}명
                <span className="text-white/50"> · {DISCIPLINE[shared.meetup.discipline]}</span>
              </Row>
              <Row icon={<Gauge size={20} />}>{skillText(shared.meetup)}</Row>
              <Row icon={<Wallet size={20} />}>{shared.meetup.fee > 0 ? `게스트비 ${shared.meetup.fee.toLocaleString('ko-KR')}원` : '게스트비 무료'}</Row>
            </ul>
          </section>
        )}

        {openHref ? (
          <a
            href={openHref}
            className="mt-6 flex h-14 w-full items-center justify-center rounded-2xl bg-[#16C784] text-base font-black text-[#07110C] transition hover:brightness-110">
            피넛 앱에서 보기
          </a>
        ) : null}
        <p className="mt-6 text-center text-sm font-semibold text-white/60">
          {shared && platform === 'other' ? '휴대폰에서 이 주소를 열면 피넛 앱으로 바로 볼 수 있어요.' : '아직 피넛 앱이 없나요?'}
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="App Store에서 피넛 다운로드" className="inline-flex transition hover:brightness-110">
            <Image src="/app-store-badge-ko.svg" alt="App Store에서 다운로드하기" width={130} height={40} className="h-auto w-[150px]" />
          </a>
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" aria-label="Google Play에서 피넛 다운로드" className="inline-flex transition hover:brightness-110">
            <Image src="/google-play-badge-ko.png" alt="Google Play에서 다운로드하기" width={646} height={250} className="h-auto w-[150px]" />
          </a>
        </div>

        <p className="mt-12 text-center text-xs text-white/40">피넛 — 가까운 코트에서 함께 칠 사람을 찾는 피클볼 앱</p>
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 text-[#16C784]">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-8 rounded-3xl border border-white/10 bg-[#10161D] p-6">
      <h1 className="text-xl font-black">{title}</h1>
      <p className="mt-2 text-sm font-semibold leading-6 text-white/60">{body}</p>
    </section>
  );
}
