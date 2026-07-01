/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// 피클볼 브랜드: 생기 있는 라임 그린 + 코트 블루 액센트
export const Brand = {
  primary: '#3DBA6F', // 메인 그린
  primaryDark: '#2E9457',
  accent: '#2D7FF9', // 코트 블루
  warning: '#F5A623',
  danger: '#E5484D',
} as const;

export const Colors = {
  light: {
    text: '#11181C',
    background: '#ffffff',
    backgroundElement: '#F0F2F4',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    primary: Brand.primary,
    accent: Brand.accent,
    border: '#E2E5E9',
    card: '#FFFFFF',
    tabIconDefault: '#8A9099',
  },
  dark: {
    text: '#ECEDEE',
    background: '#0B0D0E',
    backgroundElement: '#1A1D1F',
    backgroundSelected: '#2E3135',
    textSecondary: '#9BA1A6',
    primary: Brand.primary,
    accent: '#5A9DFF',
    border: '#2A2E31',
    card: '#16181A',
    tabIconDefault: '#6B7178',
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
