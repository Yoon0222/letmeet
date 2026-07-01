import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

interface BadgeProps {
  label: string;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
}

export function Badge({ label, color = '#2E9457', bg = 'rgba(61,186,111,0.14)', style }: BadgeProps) {
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: '700' },
});
