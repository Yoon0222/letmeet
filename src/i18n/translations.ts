export const languages = ['ko', 'en'] as const;

export type Language = (typeof languages)[number];

export const languageLabels: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
};

export const translations = {
  ko: {
    common: {
      appName: 'P!NUT',
      confirm: '확인',
      cancel: '취소',
      save: '저장',
      loading: '불러오는 중...',
    },
    auth: {
      signInTitle: '로그인',
      signInSubtitle: '가까운 피클볼 메이트를 찾아보세요',
      email: '이메일',
      password: '비밀번호',
      signIn: '로그인',
      signUp: '회원가입',
      noAccount: '아직 계정이 없으신가요?',
      or: '또는',
      missingCredentialsTitle: '입력 확인',
      missingCredentialsBody: '이메일과 비밀번호를 입력해주세요.',
      signInFailed: '로그인 실패',
      kakaoFailed: '카카오 로그인 실패',
      errors: {
        fallback: '잠시 후 다시 시도해주세요.',
        invalidLogin: '이메일 또는 비밀번호가 올바르지 않습니다.',
        emailNotConfirmed: '이메일 인증이 필요합니다. 메일함을 확인해주세요.',
        alreadyRegistered: '이미 가입된 이메일입니다.',
        shortPassword: '비밀번호는 6자 이상이어야 합니다.',
      },
    },
    home: {
      greeting: '안녕하세요, {{name}}님',
      regionMissing: '지역 미설정',
      skill: '실력',
      todayPlayable: '오늘 참가 가능한 경기',
      findNewMatch: '새로운 번개 모임을 찾아보세요',
      recommendNearby: '근처 코트에서 열리는 경기를 추천해드릴게요.',
      viewSchedule: '일정 보기',
      findMatch: '모임 찾기',
      quickMatch: '번개모임',
      courtBooking: '코트예약',
      tournaments: '대회',
      upcoming: '다가오는 내 일정',
      nearbyMeetups: '근처 추천 모임',
      recommendedClubs: '추천 클럽',
      seeAll: '전체보기',
    },
    profile: {
      title: '내정보',
      language: '언어',
      languageHint: '앱에서 표시할 언어를 선택하세요.',
      myMeetups: '내 모임',
      emptyMeetups: '아직 참여한 모임이 없어요. 모임 탭에서 찾아보세요.',
      completeProfile: '프로필을 완성하면 나에게 맞는 모임을 더 잘 추천받을 수 있어요.',
      signOut: '로그아웃',
      signOutTitle: '로그아웃',
      signOutBody: '정말 로그아웃하시겠어요?',
      deleteAccount: '회원 탈퇴',
      deleting: '탈퇴 처리 중...',
      deleteFailed: '탈퇴 실패',
      deleteTitle: '회원 탈퇴',
      deleteBody: '정말 탈퇴하시겠어요? 계정과 참여 기록이 삭제되며 되돌릴 수 없습니다.',
    },
    tabs: {
      home: '홈',
      matches: '매칭',
      clubs: '클럽',
      tournaments: '대회',
      profile: '내정보',
    },
  },
  en: {
    common: {
      appName: 'P!NUT',
      confirm: 'OK',
      cancel: 'Cancel',
      save: 'Save',
      loading: 'Loading...',
    },
    auth: {
      signInTitle: 'Sign in',
      signInSubtitle: 'Find pickleball partners near you',
      email: 'Email',
      password: 'Password',
      signIn: 'Sign in',
      signUp: 'Create account',
      noAccount: 'New to P!NUT?',
      or: 'or',
      missingCredentialsTitle: 'Check input',
      missingCredentialsBody: 'Please enter your email and password.',
      signInFailed: 'Sign-in failed',
      kakaoFailed: 'Kakao sign-in failed',
      errors: {
        fallback: 'Please try again in a moment.',
        invalidLogin: 'Email or password is incorrect.',
        emailNotConfirmed: 'Email verification is required. Please check your inbox.',
        alreadyRegistered: 'This email is already registered.',
        shortPassword: 'Password must be at least 6 characters.',
      },
    },
    home: {
      greeting: 'Hi, {{name}}',
      regionMissing: 'Region not set',
      skill: 'Skill',
      todayPlayable: 'Playable matches today',
      findNewMatch: 'Find a new instant match',
      recommendNearby: 'We will recommend matches at nearby courts.',
      viewSchedule: 'View schedule',
      findMatch: 'Find match',
      quickMatch: 'Instant match',
      courtBooking: 'Courts',
      tournaments: 'Tournaments',
      upcoming: 'Your upcoming schedule',
      nearbyMeetups: 'Nearby meetups',
      recommendedClubs: 'Recommended clubs',
      seeAll: 'See all',
    },
    profile: {
      title: 'Profile',
      language: 'Language',
      languageHint: 'Choose the language shown in the app.',
      myMeetups: 'My meetups',
      emptyMeetups: 'You have not joined any meetups yet. Browse the match tab.',
      completeProfile: 'Complete your profile to get better match recommendations.',
      signOut: 'Sign out',
      signOutTitle: 'Sign out',
      signOutBody: 'Do you want to sign out?',
      deleteAccount: 'Delete account',
      deleting: 'Deleting...',
      deleteFailed: 'Delete failed',
      deleteTitle: 'Delete account',
      deleteBody: 'Do you really want to delete your account? This cannot be undone.',
    },
    tabs: {
      home: 'Home',
      matches: 'Matches',
      clubs: 'Clubs',
      tournaments: 'Tournaments',
      profile: 'Profile',
    },
  },
} as const;

type TranslationTree = typeof translations.ko;

type DotPrefix<TPrefix extends string, TKey extends string> = `${TPrefix}.${TKey}`;

export type TranslationKey = {
  [K in keyof TranslationTree]: TranslationTree[K] extends string
    ? K
    : {
        [C in keyof TranslationTree[K]]: TranslationTree[K][C] extends string
          ? DotPrefix<Extract<K, string>, Extract<C, string>>
          : {
              [D in keyof TranslationTree[K][C]]: DotPrefix<
                DotPrefix<Extract<K, string>, Extract<C, string>>,
                Extract<D, string>
              >;
            }[keyof TranslationTree[K][C]];
      }[keyof TranslationTree[K]];
}[keyof TranslationTree] &
  string;
