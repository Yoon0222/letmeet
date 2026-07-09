import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSpacing, Typography } from '@/theme';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
};

export function AppHeader({ title, subtitle, rightIcon, onRightPress }: AppHeaderProps) {
  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightIcon ? (
        <Pressable onPress={onRightPress} hitSlop={8} style={styles.iconButton}>
          <Ionicons name={rightIcon} size={22} color="#111827" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.sm,
  },
  title: {
    ...Typography.screenTitle,
    color: '#111827',
  },
  subtitle: {
    ...Typography.caption,
    color: '#6B7280',
    marginTop: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});
