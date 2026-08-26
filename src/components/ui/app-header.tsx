import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppSpacing, Typography } from '@/theme';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  onBack?: () => void; // 있으면 좌측 뒤로가기 버튼 표시(푸시로 진입한 탭 화면용)
};

export function AppHeader({ title, subtitle, rightIcon, onRightPress, onBack }: AppHeaderProps) {
  return (
    <View style={styles.wrap}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} style={styles.backButton} accessibilityLabel="뒤로" accessibilityRole="button">
          <Ionicons name="chevron-back" size={24} color="#F8FAFC" />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {rightIcon ? (
        <Pressable onPress={onRightPress} hitSlop={8} style={styles.iconButton}>
          <Ionicons name={rightIcon} size={22} color="#F8FAFC" />
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
  backButton: {
    width: 40,
    height: 40,
    marginLeft: -8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderCurve: 'continuous',
  },
  title: {
    ...Typography.screenTitle,
    color: '#F8FAFC',
  },
  subtitle: {
    ...Typography.caption,
    color: '#AAB4C0',
    marginTop: 4,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
});
