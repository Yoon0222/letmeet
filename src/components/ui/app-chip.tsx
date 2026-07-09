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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  active: {
    backgroundColor: '#16C784',
    borderColor: '#16C784',
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeText: {
    color: '#FFFFFF',
  },
});
