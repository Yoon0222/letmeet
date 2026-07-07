import Constants from 'expo-constants';
import { Platform } from 'react-native';

// expo-notifications / expo-device 는 네이티브 모듈이다.
// 이 모듈을 포함하지 않은 런타임(최신 네이티브 모듈이 빠진 옛 개발 빌드, 웹 등)에서
// import 만으로 앱 전체가 크래시나지 않도록 안전하게 로드한다.
let Notifications: typeof import('expo-notifications') | null = null;
let Device: typeof import('expo-device') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Device = require('expo-device');
  Notifications!.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  Notifications = null;
  Device = null;
}

/**
 * 푸시 권한을 요청하고 Expo 푸시 토큰을 반환한다.
 * - 네이티브 모듈 없음(옛 빌드/웹)·시뮬레이터·권한 거부 시 null.
 */
export async function registerForPushTokenAsync(): Promise<string | null> {
  if (!Notifications || !Device) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: '기본',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    if (!Device.isDevice) return null; // 실기기 필요

    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
    }
    if (final !== 'granted') return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
    if (!projectId) return null;

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}
