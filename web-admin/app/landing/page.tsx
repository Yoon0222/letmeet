import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { LandingCountdown } from '@/components/landing-countdown';
import { isConfigured, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata: Metadata = {
  title: 'P!NUT | Play instant',
  description: '가까운 코트에서 피클볼 메이트, 번개 모임, 대회, 클럽을 찾는 커뮤니티 매칭 앱',
};

const pillars = [
  ['PLAY', '지금 치고 싶은 마음을 바로 경기로 연결합니다.'],
  ['INSTANT', '번개 모임, 코트, 대회를 기다림 없이 찾습니다.'],
  ['NUT', '피클볼에 진심인 사람들을 하나의 커뮤니티로 묶습니다.'],
];

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
  ios: '#download',
  android: '#download',
};

async function getLandingStats() {
  if (!isConfigured) {
    return {
      members: '집계 준비중',
      courts: '입점 준비중',
    };
  }

  const [members, courts] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('courts').select('id', { count: 'exact', head: true }),
  ]);

  return {
    members: members.error ? '집계 준비중' : `${members.count ?? 0}명`,
    courts: courts.error ? '입점 준비중' : `${courts.count ?? 0}곳`,
  };
}

export default async function LandingPage() {
  const stats = await getLandingStats();
  const communityStats = [
    { label: '현재 회원수', value: stats.members, body: '함께 칠 피클볼 메이트' },
    { label: '입점 코트수', value: stats.courts, body: '예약과 모임을 연결할 코트' },
  ];

  return (
    <div className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-[#F6F7F9] text-[#111827]">
      <section className="relative min-h-[92vh] overflow-hidden bg-[#111827] px-6 text-white">
        <div className="absolute inset-0 opacity-25">
          <Image
            src="/avatars/peanut-16.png"
            alt=""
            width={512}
            height={512}
            priority
            className="absolute right-[4%] top-[8%] h-48 w-48 rotate-6 object-contain sm:h-72 sm:w-72 lg:h-96 lg:w-96"
          />
          <Image
            src="/avatars/peanut-21.png"
            alt=""
            width={512}
            height={512}
            priority
            className="absolute bottom-[8%] left-[5%] h-40 w-40 -rotate-6 object-contain sm:h-64 sm:w-64"
          />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-[linear-gradient(180deg,rgba(17,24,39,0),#111827)]" />
        </div>

        <nav className="relative z-10 mx-auto flex max-w-6xl items-center justify-between py-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[18px] bg-[#16C784] text-lg font-black text-white">
              P!
            </span>
            <span className="text-lg font-black tracking-normal">P!NUT</span>
          </Link>
          <div className="hidden items-center gap-8 text-sm font-semibold text-white/70 sm:flex">
            <a href="#play" className="hover:text-white">PLAY</a>
            <a href="#instant" className="hover:text-white">INSTANT</a>
            <a href="#nut" className="hover:text-white">NUT</a>
            <a href="#download" className="hover:text-white">DOWNLOAD</a>
            <a href="#contact" className="hover:text-white">CONTACT</a>
          </div>
        </nav>

        <div className="relative z-10 mx-auto max-w-6xl pt-4">
          <LandingCountdown />
        </div>

        <div className="relative z-10 mx-auto grid min-h-[calc(92vh-220px)] max-w-6xl items-center gap-10 pb-20 pt-10 lg:grid-cols-[1fr_420px]">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">
              PLAY INSTANT. GO NUTS.
            </p>
            <h1 className="text-[54px] font-black leading-[0.96] tracking-normal sm:text-[72px] lg:text-[88px]">
              Play now,
              <br />
              instantly.
            </h1>
            <p className="mt-6 max-w-2xl text-2xl font-bold leading-tight text-white sm:text-3xl">
              피클볼에 진심인 사람들을 지금 바로 경기로 연결하는 P!NUT.
            </p>
            <p className="mt-6 max-w-xl text-base font-medium leading-7 text-white/70 sm:text-lg">
              가까운 코트, 오늘 가능한 모임, 함께 뛸 메이트를 한 번에 찾습니다. 기다리지 말고, 바로 플레이하세요.
            </p>

            <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
              {pillars.map(([title, body]) => (
                <div key={title} className="rounded-[18px] border border-white/10 bg-white/10 p-4 backdrop-blur">
                  <p className="text-lg font-black text-[#16C784]">{title}</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-white/70">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#download"
                className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#16C784] px-7 text-base font-extrabold text-white transition hover:bg-[#0F8F5F]"
              >
                시작하기
              </Link>
              <a
                href="#instant"
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-7 text-base font-extrabold text-white backdrop-blur transition hover:bg-white/15"
              >
                둘러보기
              </a>
            </div>

          </div>

          <div className="relative mx-auto hidden w-full max-w-[420px] lg:block">
            <div className="rounded-[40px] border border-white/15 bg-white/10 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur">
              <div className="overflow-hidden rounded-[30px] bg-[#F6F7F9] p-5 text-[#111827]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#6B7280]">Instant play</p>
                    <p className="text-xl font-extrabold">오늘 참가 가능한 경기</p>
                  </div>
                  <Image
                    src="/avatars/peanut-03.png"
                    alt="P!NUT avatar"
                    width={48}
                    height={48}
                    className="h-12 w-12 rounded-full"
                  />
                </div>
                <div className="mt-5 rounded-[18px] bg-[#111827] p-5 text-white">
                  <p className="text-sm font-bold text-[#16C784]">19:30 · 잠실</p>
                  <p className="mt-2 text-2xl font-black">퇴근 후 더블스</p>
                  <p className="mt-3 text-sm font-medium text-white/70">실력 3.0-4.0 · 3/4명 모집중</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {['PLAY', 'NOW', 'NUT'].map((item) => (
                    <div key={item} className="rounded-2xl bg-white p-4 text-center text-sm font-extrabold shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-4 space-y-3">
                  {['강남 오픈 플레이', '한강 피클볼 클럽'].map((item) => (
                    <div key={item} className="rounded-[18px] bg-white p-4 shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
                      <p className="text-base font-extrabold">{item}</p>
                      <p className="mt-1 text-sm font-medium text-[#6B7280]">모집중 · 가까운 추천</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="download" className="bg-white px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-[18px] bg-[#F6F7F9] p-8 sm:p-12 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">DOWNLOAD</p>
            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">P!NUT 앱으로 바로 플레이하세요</h2>
            <p className="mt-5 text-lg font-medium leading-8 text-[#6B7280]">
              출시 링크가 확정되면 아래 버튼이 App Store와 Google Play 다운로드로 연결됩니다.
            </p>
          </div>
          <div className="grid gap-3">
            <a
              href={downloadLinks.ios}
              className="flex h-16 items-center justify-between rounded-2xl bg-[#111827] px-6 text-white transition hover:bg-black"
            >
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/60">Download on the</span>
                <span className="block text-xl font-black">App Store</span>
              </span>
              <span className="text-2xl font-black">iOS</span>
            </a>
            <a
              href={downloadLinks.android}
              className="flex h-16 items-center justify-between rounded-2xl bg-[#16C784] px-6 text-white transition hover:bg-[#0F8F5F]"
            >
              <span>
                <span className="block text-xs font-bold uppercase tracking-[0.14em] text-white/70">Get it on</span>
                <span className="block text-xl font-black">Google Play</span>
              </span>
              <span className="text-2xl font-black">AOS</span>
            </a>
          </div>
        </div>
      </section>

      <section className="bg-white px-6 pb-20">
        <div className="mx-auto grid max-w-6xl gap-4 border-y border-[#E5E7EB] py-8 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">COMMUNITY SIGNAL</p>
            <p className="mt-2 text-xl font-extrabold text-[#111827]">피클볼을 바로 시작할 수 있는 연결이 쌓이고 있습니다</p>
          </div>
          {communityStats.map((item) => (
            <div key={item.label} className="min-w-40 rounded-[18px] bg-[#F6F7F9] px-5 py-4">
              <p className="text-sm font-bold text-[#6B7280]">{item.label}</p>
              <p className="mt-2 text-3xl font-black text-[#111827]">{item.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="play" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">PLAY</p>
          <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">치고 싶다는 마음이 바로 경기로 바뀌게</h2>
        </div>
        <div id="instant" className="mt-12 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-[18px] border border-[#E5E7EB] bg-white p-6 shadow-[0_8px_24px_rgba(17,24,39,0.08)]">
              <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#16C784]">{feature.label}</p>
              <h3 className="mt-4 text-xl font-extrabold">{feature.title}</h3>
              <p className="mt-4 text-base font-medium leading-7 text-[#6B7280]">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white px-6 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">INSTANT</p>
            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">검색보다 빠르게, 약속보다 가볍게</h2>
            <p className="mt-5 text-lg font-medium leading-8 text-[#6B7280]">
              P!NUT은 오늘 가능한 경기와 사람을 먼저 보여줍니다. 앱을 열고, 고르고, 바로 참가하세요.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {pillars.map(([title, body]) => (
              <div key={title} className="rounded-[18px] bg-[#F6F7F9] p-6">
                <p className="text-2xl font-black text-[#16C784]">{title}</p>
                <p className="mt-4 text-sm font-semibold leading-6 text-[#6B7280]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="nut" className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="rounded-[18px] bg-[#111827] p-8 text-white sm:p-12">
          <div className="grid gap-10 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">NUT</p>
              <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">for sports nuts</h2>
              <p className="mt-5 text-lg font-medium leading-8 text-white/70">
                피클볼에 꽂힌 사람들, 한 경기 더 치고 싶은 사람들, 같이 성장할 사람들을 위한 커뮤니티입니다.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['01', '08', '13', '17', '20', '24'].map((n) => (
                <Image
                  key={n}
                  src={`/avatars/peanut-${n}.png`}
                  alt="P!NUT community avatar"
                  width={96}
                  height={96}
                  className="rounded-[18px] bg-white/10 p-2"
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="bg-white px-6 py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-8 rounded-[18px] border border-[#E5E7EB] bg-[#F6F7F9] p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">CONTACT</p>
            <h2 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">문의와 제휴 제안을 기다립니다</h2>
            <p className="mt-5 max-w-2xl text-lg font-medium leading-8 text-[#6B7280]">
              코트 입점, 대회 운영, 피클볼 커뮤니티 제휴, 앱 출시 관련 문의는 이메일로 연락해 주세요.
            </p>
          </div>
          <a
            href="mailto:troy.yoonsik.shin@gmail.com?subject=P!NUT%20문의"
            className="inline-flex h-14 items-center justify-center rounded-2xl bg-[#111827] px-7 text-base font-extrabold text-white transition hover:bg-black"
          >
            troy.yoonsik.shin@gmail.com
          </a>
        </div>
      </section>
    </div>
  );
}
