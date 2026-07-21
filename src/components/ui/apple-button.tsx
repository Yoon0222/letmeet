import { Platform, StyleSheet } from 'react-native';

// 애플 네이티브 모듈은 iOS 에서만 로드 (웹/안드로이드 번들 실행 시 skip)
let AppleAuthentication: typeof import('expo-apple-authentication') | null = null;
if (Platform.OS === 'ios') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  AppleAuthentication = require('expo-apple-authentication');
}

/** iOS 공식 Sign in with Apple 버튼. iOS 외에는 아무것도 렌더하지 않음. */
export function AppleButton({ onPress }: { onPress: () => void }) {
  if (Platform.OS !== 'ios' || !AppleAuthentication) return null;
  const A = AppleAuthentication;
  return (
    <A.AppleAuthenticationButton
      buttonType={A.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={A.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={16}
      style={styles.button}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  button: { width: '100%', height: 52 },
});
