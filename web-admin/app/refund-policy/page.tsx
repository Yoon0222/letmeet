import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '환불 및 취소 정책 | 피넛',
  description: '피넛 코트 예약 및 유료 서비스의 취소와 환불 기준을 안내합니다.',
};

const businessInfo = {
  name: process.env.NEXT_PUBLIC_BUSINESS_NAME ?? '피넛',
  registrationNumber: process.env.NEXT_PUBLIC_BUSINESS_REGISTRATION_NUMBER ?? '221-14-95232',
  representative: process.env.NEXT_PUBLIC_BUSINESS_REPRESENTATIVE ?? '신윤식',
  address: process.env.NEXT_PUBLIC_BUSINESS_ADDRESS ?? '인천광역시 검단구 묵지3로 3, 1동 4층 401호(불로동)',
  phone: process.env.NEXT_PUBLIC_BUSINESS_PHONE ?? '010 5270 2034',
  email: process.env.NEXT_PUBLIC_BUSINESS_EMAIL ?? 'troy.yoonsik.shin@gmail.com',
};

export default function RefundPolicyPage() {
  return (
    <div className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-[#F6F7F9] px-6 py-16 text-[#111827]">
      <main className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-extrabold text-[#16C784]">
          <span className="grid h-10 w-10 place-items-center rounded-[18px] bg-[#16C784] text-white">P!</span>
          P!NUT
        </Link>

        <section className="mt-10 rounded-[18px] bg-white p-8 shadow-[0_8px_24px_rgba(17,24,39,0.08)] sm:p-10">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">Refund policy</p>
          <h1 className="mt-4 text-4xl font-black leading-tight">환불 및 취소 정책</h1>
          <p className="mt-5 text-base font-medium leading-8 text-[#6B7280]">
            피넛(P!NUT)은 피클볼 코트 예약 및 관련 유료 서비스에 대해 아래 기준에 따라 취소와 환불을 처리합니다.
          </p>

          <div className="mt-8 space-y-7">
            <div>
              <h2 className="text-xl font-extrabold">1. 적용 대상</h2>
              <p className="mt-3 text-base font-medium leading-7 text-[#374151]">
                본 정책은 피넛 앱 또는 웹 서비스를 통해 결제한 코트 예약, 대회 참가 신청, 이벤트 참가 신청 등 유료 서비스에 적용됩니다.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">2. 코트 예약 취소 및 환불</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-base font-medium leading-7 text-[#374151]">
                <li>예약 이용 시작 24시간 전까지 취소하는 경우 전액 환불됩니다.</li>
                <li>예약 이용 시작 24시간 이내 취소하는 경우 코트 운영 정책에 따라 환불이 제한될 수 있습니다.</li>
                <li>예약 시간 이후 미이용 또는 노쇼의 경우 환불이 불가합니다.</li>
                <li>코트 사정, 천재지변, 시설 이용 불가 등 사업자 또는 입점 코트의 귀책 사유로 이용이 불가능한 경우 전액 환불됩니다.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">3. 대회 및 이벤트 참가 취소</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-base font-medium leading-7 text-[#374151]">
                <li>참가 접수 마감 전 취소하는 경우 전액 환불됩니다.</li>
                <li>참가 접수 마감 후에는 대진표 편성, 운영 준비 등으로 인해 환불이 제한될 수 있습니다.</li>
                <li>운영자 사정으로 대회 또는 이벤트가 취소되는 경우 전액 환불됩니다.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">4. 환불 처리 방법</h2>
              <p className="mt-3 text-base font-medium leading-7 text-[#374151]">
                환불은 결제에 사용한 결제수단으로 처리됩니다. 카드사 또는 결제수단의 정책에 따라 실제 환불 반영까지 영업일 기준 3~7일 정도
                소요될 수 있습니다.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">5. 문의</h2>
              <p className="mt-3 text-base font-medium leading-7 text-[#374151]">
                취소 및 환불과 관련한 문의는 아래 이메일로 접수해 주세요. 예약번호, 결제일시, 결제금액을 함께 보내주시면 더 빠르게 확인할 수
                있습니다.
              </p>
              <a
                href={`mailto:${businessInfo.email}?subject=P!NUT%20환불%20문의`}
                className="mt-4 inline-flex h-14 items-center justify-center rounded-2xl bg-[#111827] px-6 text-base font-extrabold text-white transition hover:bg-black"
              >
                {businessInfo.email}
              </a>
            </div>

            <div className="rounded-[18px] bg-[#F6F7F9] p-5">
              <h2 className="text-lg font-extrabold">사업자 정보</h2>
              <dl className="mt-4 grid gap-3 text-sm font-medium text-[#6B7280] sm:grid-cols-2">
                <div>
                  <dt className="font-bold text-[#9CA3AF]">상호명</dt>
                  <dd className="mt-1 text-[#111827]">{businessInfo.name}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#9CA3AF]">대표자명</dt>
                  <dd className="mt-1 text-[#111827]">{businessInfo.representative}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#9CA3AF]">사업자등록번호</dt>
                  <dd className="mt-1 text-[#111827]">{businessInfo.registrationNumber}</dd>
                </div>
                <div>
                  <dt className="font-bold text-[#9CA3AF]">연락처</dt>
                  <dd className="mt-1 text-[#111827]">{businessInfo.phone}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-bold text-[#9CA3AF]">사업장 주소</dt>
                  <dd className="mt-1 text-[#111827]">{businessInfo.address}</dd>
                </div>
              </dl>
            </div>
          </div>

          <p className="mt-8 text-sm font-medium leading-6 text-[#9CA3AF]">시행일: 2026년 8월 18일</p>
        </section>
      </main>
    </div>
  );
}
