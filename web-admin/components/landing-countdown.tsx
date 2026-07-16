'use client';

import { useEffect, useState } from 'react';

const target = new Date('2026-07-31T12:00:00+09:00').getTime();

function getTimeLeft() {
  const now = Date.now();
  const diff = Math.max(0, target - now);

  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

export function LandingCountdown() {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft(getTimeLeft());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const units = [
    ['DAYS', timeLeft.days],
    ['HOURS', timeLeft.hours],
    ['MIN', timeLeft.minutes],
    ['SEC', timeLeft.seconds],
  ] as const;

  return (
    <div className="rounded-[28px] border border-white/15 bg-white/10 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:p-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-sm font-extrabold uppercase tracking-[0.22em] text-[#16C784]">Launch D-day</p>
          <p className="mt-3 text-xl font-extrabold text-white sm:text-2xl">2026.07.31 12:00 P!NUT official launch</p>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {units.map(([label, value]) => (
            <div key={label} className="min-w-16 rounded-[18px] bg-white/10 px-3 py-4 text-center sm:min-w-24 sm:px-5">
              <p className="text-[36px] font-black leading-none text-white sm:text-[56px]">{String(value).padStart(2, '0')}</p>
              <p className="mt-2 text-[11px] font-extrabold tracking-[0.16em] text-white/55 sm:text-xs">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
