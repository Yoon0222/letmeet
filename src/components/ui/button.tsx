import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'outline' | 'danger';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const bg: Record<Variant, string> = {
    primary: theme.primary,
    secondary: theme.backgroundElement,
    outline: 'transparent',
    danger: '#E5484D',
  };
  const fg: Record<Variant, string> = {
    primary: '#fff',
    secondary: theme.text,
    outline: theme.primary,
    danger: '#fff',
  };

  return (
    <Pressable
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg[variant], opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'outline' && { borderWidth: 1.5, borderColor: theme.primary },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <Text style={[styles.label, { color: fg[variant] }]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
