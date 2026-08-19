import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Radius } from '@/theme';

type AppChipProps = PressableProps & {
  label: string;
  active?: boolean;
};

export function AppChip({ label, active = false, style, ...rest }: AppChipProps) {
  return (
    <Pressable
      {...rest}
      style={(state) => [
        styles.chip,
        active && styles.active,
        { opacity: state.pressed ? 0.86 : 1 },
        typeof style === 'function' ? style(state) : style,
      ]}>
      <Text style={[styles.text, active && styles.activeText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: Radius.chip,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: '#16C784',
    borderColor: '#16C784',
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: '#AAB4C0',
  },
  activeText: {
    color: '#FFFFFF',
  },
});
