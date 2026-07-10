import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '계정 및 데이터 삭제 | 피넛',
  description: '피넛 계정과 관련 데이터 삭제를 요청하는 방법을 안내합니다.',
};

export default function AccountDeletePage() {
  return (
    <div className="relative left-1/2 -my-8 w-screen -translate-x-1/2 bg-[#F6F7F9] px-6 py-16 text-[#111827]">
      <main className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-extrabold text-[#16C784]">
          <span className="grid h-10 w-10 place-items-center rounded-[18px] bg-[#16C784] text-white">P!</span>
          P!NUT
        </Link>

        <section className="mt-10 rounded-[18px] bg-white p-8 shadow-[0_8px_24px_rgba(17,24,39,0.08)] sm:p-10">
          <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">Account deletion</p>
          <h1 className="mt-4 text-4xl font-black leading-tight">계정 및 데이터 삭제 요청</h1>
          <p className="mt-5 text-base font-medium leading-8 text-[#6B7280]">
            피넛 사용자는 앱 안에서 직접 계정을 삭제하거나, 이메일로 계정 및 관련 데이터 삭제를 요청할 수 있습니다.
          </p>

          <div className="mt-8 space-y-6">
            <div>
              <h2 className="text-xl font-extrabold">앱에서 삭제하는 방법</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-base font-medium leading-7 text-[#374151]">
                <li>피넛 앱에 로그인합니다.</li>
                <li>내정보 화면으로 이동합니다.</li>
                <li>회원 탈퇴를 선택합니다.</li>
                <li>확인 절차를 완료하면 계정과 관련 데이터가 삭제됩니다.</li>
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">이메일로 요청하는 방법</h2>
              <p className="mt-3 text-base font-medium leading-7 text-[#374151]">
                앱에 접근할 수 없는 경우 아래 이메일로 가입 계정 이메일과 함께 삭제 요청을 보내주세요.
              </p>
              <a
                href="mailto:troy.yoonsik.shin@gmail.com?subject=P!NUT%20계정%20삭제%20요청"
                className="mt-4 inline-flex h-14 items-center justify-center rounded-2xl bg-[#111827] px-6 text-base font-extrabold text-white transition hover:bg-black"
              >
                troy.yoonsik.shin@gmail.com
              </a>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">삭제되는 데이터</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-base font-medium leading-7 text-[#374151]">
                <li>계정 정보와 프로필 정보</li>
                <li>모임, 클럽, 대회 참가 기록</li>
                <li>코트 예약 및 앱 이용과 관련된 사용자 데이터</li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-extrabold">보관될 수 있는 데이터</h2>
              <p className="mt-3 text-base font-medium leading-7 text-[#374151]">
                법령 준수, 분쟁 대응, 부정 이용 방지를 위해 필요한 최소한의 기록은 관련 법령이 허용하는 기간 동안 보관될 수 있습니다.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
