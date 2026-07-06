/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 피넛 브랜드: 밝은 화이트 + 비비드 그린 + 따뜻한 골드 포인트
export const Brand = {
  primary: '#12B981', // 비비드 피넛 그린
  primaryDark: '#0E9E6E',
  accent: '#F5A623', // 골드 포인트
  warning: '#F59E0B',
  danger: '#F0453F',
} as const;

export const Colors = {
  light: {
    text: '#17191C',
    background: '#FBFCFB', // 거의 화이트 (밝게)
    backgroundElement: '#F0F2F1',
    backgroundSelected: '#E4E7E5',
    textSecondary: '#757C78',
    primary: Brand.primary,
    accent: Brand.accent,
    border: '#EBEEEC',
    card: '#FFFFFF',
    tabIconDefault: '#A7ADA9',
  },
  dark: {
    text: '#F1F3F2',
    background: '#0F1211',
    backgroundElement: '#1B1F1D',
    backgroundSelected: '#2A2F2C',
    textSecondary: '#9BA29E',
    primary: '#2FD08B', // 다크에서 더 밝은 그린
    accent: '#F5B84B',
    border: '#262B28',
    card: '#161A18',
    tabIconDefault: '#6E756F',
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
