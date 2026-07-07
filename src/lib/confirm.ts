import { Alert, Platform } from 'react-native';

/**
 * 파괴적 동작(로그아웃·탈퇴·취소) 확인.
 * 네이티브는 Alert.alert, 웹은 Alert 미지원이라 window.confirm 으로 처리한다.
 */
export function confirmDestructive(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: confirmText, style: 'destructive', onPress: onConfirm },
  ]);
}
