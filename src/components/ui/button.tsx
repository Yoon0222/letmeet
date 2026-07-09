import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius } from '@/theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  icon,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: '#16C784',
    secondary: '#FFFFFF',
    outline: 'transparent',
    danger: '#FEE2E2',
  };
  const fg: Record<Variant, string> = {
    primary: '#FFFFFF',
    secondary: '#111827',
    outline: '#111827',
    danger: '#DC2626',
  };

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg[variant], opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        (variant === 'outline' || variant === 'secondary') && { borderWidth: 1, borderColor: '#E5E7EB' },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg[variant]} /> : null}
          <Text style={[styles.label, { color: fg[variant] }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: Radius.button,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    flexDirection: 'row',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
