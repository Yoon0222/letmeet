// app.json 을 확장해 네이버 지도 플러그인을 env 기반으로 주입한다.
// client_id 는 EXPO_PUBLIC_NAVER_MAP_CLIENT_ID(.env / EAS env)에서 읽어 git 에 커밋하지 않는다.
// (네이버 클라우드 Application 의 Client ID — 지오코딩 Client ID 와 동일)

const NAVER_MAVEN = 'https://repository.map.naver.com/archive/maven';

// 네이버 지도 SDK는 리플렉션을 써서 R8이 지우면 안 됨 → keep 룰로 보호
const NAVER_PROGUARD = ['-keep class com.naver.maps.** { *; }', '-dontwarn com.naver.maps.**', ''].join('\n');

module.exports = ({ config }) => {
  const clientId = process.env.EXPO_PUBLIC_NAVER_MAP_CLIENT_ID || '';

  // expo install 이 넣어둔 bare 플러그인 문자열 제거 후, 설정을 채워 다시 추가
  const base = (config.plugins || []).filter((p) => {
    const name = Array.isArray(p) ? p[0] : p;
    return name !== '@mj-studio/react-native-naver-map' && name !== 'expo-build-properties';
  });

  return {
    ...config,
    plugins: [
      ...base,
      ['@mj-studio/react-native-naver-map', { client_id: clientId }],
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: [NAVER_MAVEN],
            // 릴리스 빌드 용량 최적화: R8 minify + 미사용 리소스 축소
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            extraProguardRules: NAVER_PROGUARD,
          },
        },
      ],
    ],
  };
};
