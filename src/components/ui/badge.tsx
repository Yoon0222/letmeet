import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

interface BadgeProps {
  label: string;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, color = '#16A34A', bg = '#DCFCE7', style }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }, style]}>
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderCurve: 'continuous',
    alignSelf: 'flex-start',
  },
  text: { fontSize: 13, fontWeight: '700' },
});
