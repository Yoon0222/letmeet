import type React from 'react';
import { ScrollView, StyleSheet, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppSpacing } from '@/theme';

type AppScaffoldProps = ScrollViewProps & {
  children: React.ReactNode;
};

export function AppScaffold({ children, contentContainerStyle, ...rest }: AppScaffoldProps) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[styles.content, contentContainerStyle]}
        {...rest}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: {
    paddingHorizontal: AppSpacing.md,
    paddingVertical: AppSpacing.md,
    gap: AppSpacing.sm,
    paddingBottom: AppSpacing.xxl,
  },
});
