/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 피넛 브랜드: 마스코트 그린 + 따뜻한 크림 배경 + 피넛 골드 포인트
export const Brand = {
  primary: '#2FA063', // 피넛 그린 (마스코트 헤드밴드/후디)
  primaryDark: '#24824E',
  accent: '#E0A33E', // 피넛 골드 포인트
  warning: '#F5A623',
  danger: '#E5484D',
} as const;

export const Colors = {
  light: {
    text: '#1C1917', // 따뜻한 먹색
    background: '#FBF7F0', // 크림
    backgroundElement: '#F1EADD',
    backgroundSelected: '#E7DCCB',
    textSecondary: '#7A7266',
    primary: Brand.primary,
    accent: Brand.accent,
    border: '#EAE1D2',
    card: '#FFFFFF',
    tabIconDefault: '#A79E90',
  },
  dark: {
    text: '#F2EFEA',
    background: '#14110E', // 따뜻한 다크 브라운블랙
    backgroundElement: '#221C16',
    backgroundSelected: '#33291F',
    textSecondary: '#A79E92',
    primary: '#43C079', // 다크에서 약간 밝은 그린
    accent: '#EBB25A',
    border: '#332A20',
    card: '#1C1712',
    tabIconDefault: '#7A7166',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
