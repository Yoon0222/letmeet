import type React from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadows } from '@/theme';

type AppCardProps = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
};

export function AppCard({ children, style, padded = true, disabled, ...rest }: AppCardProps) {
  if (disabled) {
    return <View style={[styles.card, padded && styles.padded, style]}>{children}</View>;
  }

  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        styles.card,
        padded && styles.padded,
        { opacity: pressed ? 0.92 : 1 },
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#10161D',
    borderColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderRadius: Radius.card,
    borderCurve: 'continuous',
    ...Shadows.subtle,
  },
  padded: {
    padding: 16,
  },
});
