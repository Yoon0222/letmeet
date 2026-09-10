// 전화번호 입력 공용 유틸 (온보딩·프로필 수정 공유)

// 입력값에서 숫자만 추출 (최대 11자리)
export function digitsOf(v: string): string {
  return v.replace(/\D/g, '').slice(0, 11);
}

// 010-1234-5678 형태로 표시 포맷
export function formatPhone(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length < 4) return d;
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

// 한국 휴대폰: 01[0/1/6/7/8/9] + 7~8자리 (총 10~11자리)
export function isValidMobile(digits: string): boolean {
  return /^01[016789]\d{7,8}$/.test(digits);
}
