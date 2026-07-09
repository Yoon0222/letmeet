import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { Radius, Shadows } from '@/theme';

type AppFABProps = PressableProps & {
  icon?: keyof typeof Ionicons.glyphMap;
};

export function AppFAB({ icon = 'add', style, ...rest }: AppFABProps) {
  return (
    <Pressable
      {...rest}
      style={(state) => [
        styles.fab,
        { opacity: state.pressed ? 0.9 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}>
      <Ionicons name={icon} size={28} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 58,
    height: 58,
    borderRadius: Radius.fab,
    borderCurve: 'continuous',
    backgroundColor: '#16C784',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.subtle,
  },
});
