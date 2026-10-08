import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { MapPinned, Trophy, UsersRound } from 'lucide-react';

import { isConfigured, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'P!NUT | Play instant',
  description: '가까운 코트에서 피클볼 메이트, 번개 모임, 대회, 클럽을 찾는 커뮤니티 매칭 앱',
};

const features = [
  {
    label: 'Instant match',
    title: '번개 모임',
    body: '오늘 칠 사람을 찾고, 실력과 위치가 맞는 경기에 바로 합류하세요.',
  },
  {
    label: 'Instant court',
    title: '코트 예약',
    body: '근처 코트의 운영시간과 가격을 보고 일정에 맞춰 예약 흐름을 이어갑니다.',
  },
  {
    label: 'Instant crew',
    title: '대회와 클럽',
    body: '지역 대회에 참가하고, 함께 성장할 피클볼 클럽을 발견하세요.',
  },
];

const downloadLinks = {
  ios: 'https://apps.apple.com/kr/app/%ED%94%BC%EB%84%9B/id6789043942',
  android: 'https://play.google.com/store/apps/details?id=com.pinut.app&hl=ko',
};

const communityColumns = [
  {
    title: '번개 모임',
    items: ['오늘 저녁 피클볼 같이 쳐요!', '퇴근 후 가볍게 한 게임', '주말 아침 오픈 플레이'],
  },
  {
    title: '코트 예약',
    items: ['잠실 실내 코트', '한강 테니스장 코트 3', '송도 국제코트'],
  },
  {
    title: '대회 · 클럽',
    items: ['P!NUT 월간 대회', '한강 오픈 토너먼트', 'P!NUT 클럽 정기 모임'],
  },
];

const businessInfo = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? '피넛',
  registrationNumber: process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER ?? '221-14-95232',
  representative: process.env.NEXT_PUBLIC_BUSINESS_REPRESENTATIVE ?? '신윤식',
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? '인천광역시 검단구 묵지3로 3, 1동 4층 401호(불로동)',
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? '010 5270 2034',
};

async function getLandingStats() {
  if (!isConfigured) {
    return {
      members: '집계 준비중',
      courts: '입점 준비중',
      tournaments: '집계 준비중',
    };
  }

  const [members, courts, tournaments] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('courts').select('id', { count: 'exact', head: true }),
    supabase.from('tournaments').select('id', { count: 'exact', head: true }).in('status', ['registration', 'ongoing']),
  ]);

  return {
    members: members.error ? '집계 준비중' : `${members.count ?? 0}명`,
    courts: courts.error ? '입점 준비중' : `${courts.count ?? 0}곳`,
    tournaments: tournaments.error ? '집계 준비중' : `${tournaments.count ?? 0}개`,
  };
}

export default async function LandingPage() {
  const stats = await getLandingStats();
  return (
    <div className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-[#F6F7F9] text-[#111827]">
      <section className="relative overflow-hidden bg-[#07100D] text-white">
        <div className="relative h-[740px] sm:h-[820px] lg:h-[860px]">
          <Image
            src="/landing-hero-pinut-v2.png"
            alt="피클볼 코트에서 플레이하는 피넛 캐릭터"
            fill
            priority
            sizes="100vw"
            className="object-cover object-[56%_center] lg:object-center"
          />
          <div className="absolute inset-0 bg-black/15" />

          <nav className="relative z-20 mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 lg:px-14">
            <Link href="/" aria-label="P!NUT 홈" className="flex items-center text-3xl font-black text-white sm:text-4xl">
              <span>P</span><span className="relative">!<span className="absolute bottom-[0.12em] left-1/2 h-[0.22em] w-[0.22em] -translate-x-1/2 rounded-full bg-[#F4D51D] ring-1 ring-[#173F31]" /></span><span>NUT</span>
            </Link>
            <div className="hidden items-center gap-10 text-xs font-bold text-white/90 md:flex">
              <a href="#play" className="hover:text-[#14E89B]">PLAY</a>
              <a href="#instant" className="hover:text-[#14E89B]">COURT</a>
              <a href="#play" className="hover:text-[#14E89B]">TOURNAMENT</a>
              <a href="#nut" className="hover:text-[#14E89B]">COMMUNITY</a>
              <a href="#download" className="hover:text-[#14E89B]">DOWNLOAD</a>
            </div>
            <a href="#download" className="inline-flex h-11 items-center rounded-lg bg-[#08C98B] px-5 text-sm font-black text-white transition hover:bg-[#14E89B]">
              ↓&nbsp;&nbsp;앱 다운로드
            </a>
          </nav>

          <div className="relative z-10 mx-auto flex max-w-[1440px] px-6 pt-16 sm:pt-20 lg:px-14 lg:pt-14">
            <div className="w-full max-w-[680px] lg:w-[49%]">
              <h1 className="whitespace-nowrap text-[48px] font-black uppercase leading-[0.88] text-white sm:text-[62px] lg:text-[68px]">
                Play Instant.<br />
                <span className="text-[#00E69A]">Go Nuts.</span>
              </h1>
              <p className="mt-5 text-2xl font-black sm:text-3xl">오늘, 바로 플레이하세요.</p>
              <p className="mt-3 text-sm font-semibold text-white/90 sm:text-base">
                가까운 코트와 함께 칠 사람을 한 번에 찾는 피클볼 커뮤니티
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="#download" className="inline-flex h-14 items-center justify-center rounded-lg bg-[#08C98B] px-8 text-base font-black text-white transition hover:bg-[#14E89B]">
                  ↓&nbsp;&nbsp;앱 다운로드
                </Link>
                <a href="#instant" className="inline-flex h-14 items-center justify-center rounded-lg border border-white/80 px-8 text-base font-black text-white transition hover:bg-white/10">
                  ▶&nbsp;&nbsp;서비스 둘러보기
                </a>
              </div>
            </div>
          </div>

          <div className="absolute bottom-[-20px] right-[-2%] z-10 hidden w-[470px] lg:block xl:right-[1%] xl:w-[500px]">
            <Image
              src="/landing-phone-pinut.png"
              alt="P!NUT 앱 화면이 표시된 스마트폰"
              width={1024}
              height={1536}
              unoptimized
              className="h-auto w-full drop-shadow-[0_24px_36px_rgba(0,0,0,0.35)]"
            />
          </div>
        </div>

        <div className="relative z-20 bg-white text-[#111827]">
          <div className="mx-auto grid max-w-[1440px] divide-y divide-[#E5E7EB] px-6 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:px-14">
            {features.map((feature, index) => (
              <a key={feature.title} href={index === 0 ? '#play' : index === 1 ? '#instant' : '#nut'} className="flex items-center gap-5 px-5 py-7 sm:px-8">
                <span className="grid h-12 w-12 shrink-0 place-items-center text-[#08C98B]">
                  {index === 0 ? <UsersRound size={38} strokeWidth={2.25} /> : index === 1 ? <MapPinned size={38} strokeWidth={2.25} /> : <Trophy size={38} strokeWidth={2.25} />}
                </span>
                <span><strong className="block text-lg font-black">{feature.title}</strong><span className="mt-1 block text-xs font-medium text-[#6B7280]">{index === 0 ? '지금, 함께 칠 사람을 찾아보세요.' : index === 1 ? '가까운 코트를 쉽고 빠르게 예약하세요.' : '다양한 대회와 클럽으로 더 즐겁게.'}</span></span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section id="instant" className="overflow-hidden bg-white px-6 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[420px_1fr]">
          <div className="relative mx-auto h-[540px] w-full max-w-[390px] overflow-hidden">
            <Image src="/landing-phone-pinut.png" alt="P!NUT 앱 기능 화면" width={1024} height={1536} unoptimized className="absolute left-1/2 top-0 w-[430px] max-w-none -translate-x-1/2" />
          </div>
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#08C98B]">APP EXPERIENCE</p>
            <h2 className="mt-5 max-w-xl text-4xl font-black leading-tight sm:text-6xl">원하는 플레이를<br />더 빠르게, 더 쉽게.</h2>
            <p className="mt-6 max-w-xl text-lg font-semibold leading-8 text-[#6B7280]">P!NUT 하나로 모임부터 예약, 대회까지. 지금 바로, 가까운 플레이를 만나보세요.</p>
            <div className="mt-10 grid grid-cols-3 border-b border-[#D1D5DB] text-center text-sm font-black sm:text-base">
              {['번개 모임', '코트 예약', '대회·클럽'].map((item, index) => <div key={item} className={`pb-4 ${index === 0 ? 'border-b-4 border-[#08C98B] text-[#08C98B]' : 'text-[#6B7280]'}`}>{item}</div>)}
            </div>
            <h3 className="mt-8 text-2xl font-black">지금, 함께 칠 사람을 찾아보세요.</h3>
            <p className="mt-3 max-w-lg text-base font-medium leading-7 text-[#6B7280]">내 주변에서 열리는 번개 모임을 확인하고 실력과 일정이 맞는 플레이에 바로 참여할 수 있어요.</p>
          </div>
        </div>
      </section>

      <section id="play" className="relative min-h-[610px] overflow-hidden text-white">
        <Image src="/landing-play-action.png" alt="야외 코트에서 피클볼을 즐기는 플레이어들" fill sizes="100vw" className="object-cover object-[62%_center]" />
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 mx-auto flex min-h-[610px] max-w-6xl flex-col justify-between px-6 py-20 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#08E49D]">PLAY INSTANT</p>
            <h2 className="mt-5 text-4xl font-black leading-tight sm:text-6xl">오늘 가능한 플레이를<br /><span className="text-[#08E49D]">바로 찾으세요.</span></h2>
            <p className="mt-5 max-w-lg text-lg font-semibold leading-8 text-white/85">지금 이 순간에도 새로운 게임이 열리고 있어요. 가까운 사람들과, 더 많이 플레이하세요.</p>
          </div>
          <div className="grid border-t border-white/30 sm:grid-cols-3">
            {[['현재 회원', stats.members], ['입점 코트', stats.courts], ['진행 중 대회', stats.tournaments]].map(([label, value], index) => (
              <div key={label} className={`flex items-center gap-5 py-6 sm:px-7 ${index > 0 ? 'sm:border-l sm:border-white/30' : ''}`}>
                {index === 0 ? <UsersRound className="text-[#08E49D]" size={42} /> : index === 1 ? <MapPinned className="text-[#08E49D]" size={42} /> : <Trophy className="text-[#08E49D]" size={42} />}
                <div><p className="text-sm font-bold text-white/75">{label}</p><p className="mt-1 text-4xl font-black">{value}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="nut" className="bg-white px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-sm font-black uppercase tracking-[0.18em] text-[#08C98B]">COMMUNITY</p><h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">피클볼에 진심인 사람들이 모이는 곳</h2><p className="mt-4 text-base font-medium text-[#6B7280]">번개 모임, 코트, 대회까지. P!NUT에서 더 많은 사람들과 플레이하세요.</p></div>
            <a href="#download" className="text-sm font-black text-[#111827]">더 보기 →</a>
          </div>
          <div className="mt-12 grid divide-y border-y border-[#D1D5DB] md:grid-cols-3 md:divide-x md:divide-y-0">
            {communityColumns.map((column, columnIndex) => (
              <div key={column.title} className="py-7 md:px-7 md:first:pl-0 md:last:pr-0">
                <div className="flex items-center gap-3 text-[#08C98B]">{columnIndex === 0 ? <UsersRound size={27} /> : columnIndex === 1 ? <MapPinned size={27} /> : <Trophy size={27} />}<h3 className="text-lg font-black text-[#111827]">{column.title}</h3></div>
                <div className="mt-6 space-y-5">{column.items.map((item, itemIndex) => <div key={item} className="flex items-center gap-4"><div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-md"><Image src="/landing-play-action.png" alt="" fill sizes="80px" className="object-cover" style={{ objectPosition: `${55 + itemIndex * 10}% center` }} /></div><div className="min-w-0"><p className="truncate text-sm font-black">{item}</p><p className="mt-1 text-xs font-medium text-[#6B7280]">오늘 참여 가능 · 가까운 추천</p></div></div>)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="download" className="overflow-hidden bg-[#10161B] px-6 text-white">
        <div className="mx-auto grid min-h-[430px] max-w-6xl items-center gap-8 lg:grid-cols-[360px_1fr]">
          <div className="relative hidden h-[430px] lg:block"><Image src="/landing-mascot-victory.png?v=2" alt="라켓을 든 피넛 캐릭터" fill sizes="360px" unoptimized className="object-contain object-bottom" /></div>
          <div className="py-16">
            <p className="text-sm font-black uppercase tracking-[0.18em] text-[#08E49D]">DOWNLOAD</p>
            <h2 className="mt-4 text-4xl font-black uppercase leading-tight sm:text-6xl">Ready to <span className="text-[#08E49D]">go nuts?</span></h2>
            <p className="mt-5 text-lg font-semibold leading-8 text-white/70">지금 바로 P!NUT을 다운로드하고, 더 많은 사람들과 플레이하세요.</p>
            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <a href={downloadLinks.ios} target="_blank" rel="noopener noreferrer" aria-label="App Store에서 피넛 다운로드" className="inline-flex transition hover:brightness-110">
                <Image src="/app-store-badge-ko.svg" alt="App Store에서 다운로드하기" width={130} height={40} className="h-auto w-[190px]" />
              </a>
              <a href={downloadLinks.android} target="_blank" rel="noopener noreferrer" aria-label="Google Play에서 피넛 다운로드" className="inline-flex transition hover:brightness-110">
                <Image src="/google-play-badge-ko.png" alt="Google Play에서 다운로드하기" width={646} height={250} className="h-auto w-[190px]" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#111827] px-6 py-10 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/" className="text-lg font-black tracking-normal">P!NUT</Link>
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-white/50">
              <Link href="/refund-policy" className="hover:text-white">환불 및 취소 정책</Link>
              <Link href="/account-delete" className="hover:text-white">계정 삭제 안내</Link>
              <span>for sports nuts</span>
            </div>
          </div>
          <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm font-medium text-white/60 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-white/40">상호명</dt>
              <dd className="mt-1 text-white/75">{businessInfo.name}</dd>
            </div>
            <div>
              <dt className="text-white/40">사업자등록번호</dt>
              <dd className="mt-1 text-white/75">{businessInfo.registrationNumber}</dd>
            </div>
            <div>
              <dt className="text-white/40">대표자명</dt>
              <dd className="mt-1 text-white/75">{businessInfo.representative}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-white/40">사업장 주소</dt>
              <dd className="mt-1 text-white/75">{businessInfo.address}</dd>
            </div>
            <div>
              <dt className="text-white/40">유선번호</dt>
              <dd className="mt-1 text-white/75">{businessInfo.phone}</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs font-medium text-white/35">Copyright © 2026 P!NUT. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
