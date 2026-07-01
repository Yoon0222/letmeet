import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

// 피클볼 구멍 위치 (56px 공 기준, 9px 구멍)
const HOLES = [
  { x: 23.5, y: 23.5 },
  { x: 23.5, y: 9.5 },
  { x: 23.5, y: 37.5 },
  { x: 9.5, y: 23.5 },
  { x: 37.5, y: 23.5 },
  { x: 33.4, y: 13.6 },
  { x: 13.6, y: 33.4 },
];

export function LoadingOverlay({ visible, message = 'loading...' }: { visible: boolean; message?: string }) {
  const theme = useTheme();
  const rot = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      rot.value = 0;
      rot.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1);
    }
  }, [visible, rot]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${rot.value * 360}deg` }] }));

  if (!visible) return null;

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
      <View style={styles.scrim}>
        <View style={[styles.card, { backgroundColor: theme.card }]}>
          <Animated.View style={[styles.ball, { backgroundColor: theme.primary }, spin]}>
            {HOLES.map((h, i) => (
              <View
                key={i}
                style={[styles.hole, { backgroundColor: theme.card, left: h.x, top: h.y }]}
              />
            ))}
          </Animated.View>
          <Text style={[styles.text, { color: theme.textSecondary }]}>{message}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: 140,
    height: 140,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  ball: { width: 56, height: 56, borderRadius: 28 },
  hole: { position: 'absolute', width: 9, height: 9, borderRadius: 4.5 },
  text: { fontSize: 15, fontWeight: '600', letterSpacing: 0.5 },
});
