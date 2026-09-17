// 스토어 인앱 업데이트 체크 — expo-in-app-updates
//   Android: Play In-App Updates(네이티브), iOS: iTunes Search API → App Store 열기.
//   ⚠️ 네이티브 모듈이라, 이 모듈이 없는 빌드(구 dev-client 등)에서는 방어적으로 no-op(크래시 방지).
//
// 안내는 부팅 직후(앱 실행 시 UpdateGate)에 뜨므로 커스텀 AppAlert(JS <Modal>)가 아니라
// OS 네이티브 Alert 을 쓴다. iOS 에서 네비게이션 전환 중 JS <Modal> 을 present 하면
// 모달이 안 보인 채 터치만 먹혀 홈이 잠기는 프리즈가 있었다. 이 경로는 네이티브 모듈이
// 있어야 도달하므로(웹은 모듈이 no-op → 여기 안 옴) 네이티브 Alert 로 충분하다.
import { Alert } from 'react-native';

// 네이티브 모듈 방어적 로드 — 없으면 null → 조용히 skip.
let mod: { checkForUpdate?: () => Promise<CheckResult>; startUpdate?: (immediate?: boolean) => unknown } | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-in-app-updates');
} catch {
  mod = null;
}

type CheckResult = { updateAvailable?: boolean; storeVersion?: string };

// 스토어에 새 버전이 있으면 업데이트 안내(권유). 강제는 app_config.min_version(UpdateGate)이 담당.
export async function checkStoreUpdate(): Promise<void> {
  const check = mod?.checkForUpdate;
  const start = mod?.startUpdate;
  if (typeof check !== 'function') return; // 모듈 없음 → no-op
  try {
    const res: CheckResult = await check();
    if (!res?.updateAvailable) return;
    Alert.alert('새 버전이 있어요', '더 나은 사용을 위해 최신 버전으로 업데이트해 주세요.', [
      { text: '나중에', style: 'cancel' },
      {
        text: '업데이트',
        onPress: () => {
          try {
            start?.(false); // false=flexible(Android 네이티브 오버레이 / iOS App Store 열기)
          } catch {
            /* 무시 */
          }
        },
      },
    ]);
  } catch {
    /* 스토어 조회 실패(오프라인 등)는 무시 */
  }
}
