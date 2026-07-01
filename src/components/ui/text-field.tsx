import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
}

export function TextField({ label, hint, style, ...rest }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={theme.tabIconDefault}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            color: theme.text,
            borderColor: focused ? theme.primary : 'transparent',
          },
          style,
        ]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {hint ? <Text style={[styles.hint, { color: theme.tabIconDefault }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignSelf: 'stretch' },
  label: { fontSize: 13, fontWeight: '600', marginLeft: 2 },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { fontSize: 12, marginLeft: 2 },
});
