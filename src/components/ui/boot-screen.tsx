import { Image } from 'expo-image';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PEANUT_AVATARS } from '@/constants/avatars';
import { useTheme } from '@/hooks/use-theme';

// 대표 피넛(헤드밴드 손인사)을 로고 마크로 사용
const LOGO = PEANUT_AVATARS[0];

/** 앱 부팅(세션 확인) 중 보여주는 피넛 브랜드 스플래시 */
export function BootScreen() {
  const theme = useTheme();
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [scale]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background }]}>
      <Animated.View style={anim}>
        <Image source={LOGO} style={styles.logo} contentFit="cover" />
      </Animated.View>
      <Text style={[styles.brand, { color: theme.text }]}>피넛</Text>
      <Text style={[styles.tag, { color: theme.primary }]}>for sports nuts</Text>
      <ActivityIndicator style={styles.loader} color={theme.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 104, height: 104, borderRadius: 52 },
  brand: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 20 },
  tag: { fontSize: 14, fontWeight: '700', marginTop: 4, letterSpacing: 0.3 },
  loader: { marginTop: 28 },
});
