// 기능 플래그
//
// 카카오 로그인: 코드·Supabase 연동은 완료돼 있으나, Supabase가 카카오에
// account_email 을 강제 요청하고 그 동의항목은 카카오 "비즈앱 전환"(사업자 등록)이
// 있어야 열린다. 그래서 앱 출시 후 사업자 등록·비즈앱 승인이 되면 이 값을 true 로
// 바꿔 로그인 화면의 카카오 버튼을 다시 노출한다. (그 외 코드는 손댈 필요 없음)
export const KAKAO_LOGIN_ENABLED = false;
