const NAVER_MAVEN = 'https://repository.map.naver.com/archive/maven';
const NAVER_PROGUARD = ['-keep class com.naver.maps.** { *; }', '-dontwarn com.naver.maps.**', ''].join('\n');
const PAYMENT_SCHEMES = [
  'supertoss',
  'ispmobile',
  'kb-acp',
  'newliiv',
  'kbbank',
  'mpocket.online.ansimclick',
  'lottesmartpay',
  'lotteappcard',
  'lpayapp',
  'cloudpay',
  'hanawalletmembers',
  'hdcardappcardansimclick',
  'shinhan-sr-ansimclick',
  'wooripay',
  'com.wooricard.wcard',
  'newsmartpib',
  'nhallonepayansimclick',
  'citimobileapp',
  'shinsegaeeasypayment',
  'naversearchthirdlogin',
  'payco',
  'kakaotalk',
  'kftc-bankpay',
];

module.exports = ({ config }) => {
  const clientId = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID || '';
  const base = (config.plugins || []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== '@mj-studio/react-native-naver-map' && name !== 'expo-build-properties';
  });

  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...(config.ios?.infoPlist || {}),
        LSApplicationQueriesSchemes: Array.from(
          new Set([...(config.ios?.infoPlist?.LSApplicationQueriesSchemes || []), ...PAYMENT_SCHEMES]),
        ),
      },
    },
    plugins: [
      ...base,
      ['@mj-studio/react-native-naver-map', { client_id: clientId }],
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: [NAVER_MAVEN],
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            extraProguardRules: NAVER_PROGUARD,
            manifestQueries: {
              intent: [
                ...PAYMENT_SCHEMES.map((scheme) => ({
                  action: 'android.intent.action.VIEW',
                  data: { scheme },
                })),
                {
                  action: 'android.intent.action.VIEW',
                  data: { scheme: 'intent' },
                },
                {
                  action: 'android.intent.action.VIEW',
                  data: { scheme: 'market' },
                },
              ],
            },
          },
        },
      ],
    ],
  };
};
