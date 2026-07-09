import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Radius } from '@/theme';

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
}

export function TextField({ label, hint, style, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        placeholderTextColor="#9CA3AF"
        style={[
          styles.input,
          {
            borderColor: focused ? '#16C784' : '#E5E7EB',
          },
          style,
        ]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch' },
  label: { fontSize: 13, fontWeight: '600', color: '#6B7280', marginLeft: 2 },
  input: {
    minHeight: 56,
    borderRadius: Radius.input,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '500',
    backgroundColor: '#FFFFFF',
    color: '#111827',
  },
  hint: { fontSize: 13, marginLeft: 2, color: '#9CA3AF' },
});
