import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const MASCOT = require('../../../assets/images/splash-peanut-cutout.png');
const TRACK = 240;
const SEGMENT = 96;

type BootScreenProps = {
  message?: string;
};

export function BootScreen({ message = '피넛을 준비하고 있어요' }: BootScreenProps) {
  const theme = useTheme();
  const x = useSharedValue(-SEGMENT);
  const scale = useSharedValue(0.96);

  useEffect(() => {
    x.value = withRepeat(withTiming(TRACK, { duration: 1200, easing: Easing.inOut(Easing.cubic) }), -1);
    scale.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0.96, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );
  }, [scale, x]);

  const progressStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const mascotStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={[styles.wrap, { backgroundColor: theme.background }]}>
      <View style={styles.hero}>
        <View style={styles.glow} />
        <Animated.View style={[styles.mascotShell, mascotStyle]}>
          <Image source={MASCOT} style={styles.mascot} contentFit="contain" />
        </Animated.View>
      </View>

      <View style={styles.copy}>
        <Text style={styles.brand}>P!NUT</Text>
        <Text style={styles.title}>Play instant</Text>
        <Text style={styles.message}>{message}</Text>
      </View>

      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressSegment, progressStyle]} />
      </View>
      <Text style={styles.caption}>코트, 모임, 대회를 불러오는 중</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  hero: {
    width: 176,
    height: 176,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: '#16C784',
    opacity: 0.18,
  },
  mascotShell: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#10161D',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.24)',
  },
  mascot: { width: 132, height: 132 },
  copy: { alignItems: 'center', marginTop: 18 },
  brand: { fontSize: 36, fontWeight: '900', color: '#F8FAFC', letterSpacing: 0 },
  title: { marginTop: 4, fontSize: 18, fontWeight: '800', color: '#16C784' },
  message: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#AAB4C0' },
  progressTrack: {
    width: TRACK,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 28,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  progressSegment: {
    width: SEGMENT,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#16C784',
  },
  caption: { marginTop: 12, fontSize: 13, fontWeight: '600', color: '#707B87' },
});
