import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const ILLUST = require('../../../assets/images/peanut-loading.png');
const TRACK = 220;
const SEG = 80;

/** 앱 부팅(세션 확인) 중 보여주는 피넛 브랜드 스플래시 + 로딩바 */
export function BootScreen() {
  const theme = useTheme();
  const x = useSharedValue(-SEG);

  useEffect(() => {
    x.value = withRepeat(withTiming(TRACK, { duration: 1100, easing: Easing.linear }), -1);
  }, [x]);

  const bar = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background }]}>
      <Image source={ILLUST} style={styles.illust} contentFit="contain" />
      <Text style={[styles.brand, { color: theme.text }]}>피넛</Text>
      <Text style={[styles.tag, { color: theme.primary }]}>for sports nuts</Text>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <Animated.View style={[styles.seg, { backgroundColor: theme.primary }, bar]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  illust: { width: '92%', maxWidth: 420, aspectRatio: 1536 / 798 },
  brand: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, marginTop: 16 },
  tag: { fontSize: 14, fontWeight: '700', marginTop: 4, letterSpacing: 0.3 },
  track: {
    width: TRACK,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 28,
  },
  seg: { width: SEG, height: 6, borderRadius: 3 },
});
