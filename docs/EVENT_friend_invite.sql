-- 이벤트 팝업(모달) 등록: 친구초대 경품 추첨 이벤트
-- 초안(active=false)으로 등록 — 이후 web-admin '/events'에서 '올리기'로 앱에 노출
insert into public.event_popups (title, body, active, starts_at, ends_at)
values (
  '친구 10명 초대하고 경품 받자 🎁',
  E'피넛에 가입하고 친구 10명을 초대하면 추첨을 통해 경품을 드립니다!\n\n📅 참여 기간: ~2026년 11월 30일\n🎁 추첨을 통해 경품 증정\n\n지금 친구를 초대하고 행운의 주인공이 되어보세요! 🍀',
  false,
  null,
  timestamptz '2026-11-30 23:59:59+09'
);
