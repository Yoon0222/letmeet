import '@/global.css';

import { Platform } from 'react-native';

export const Brand = {
  primary: '#16C784',
  primaryDark: '#0F8F5F',
  accent: '#D97706',
  warning: '#D97706',
  danger: '#DC2626',
} as const;

export const Colors = {
  light: {
    text: '#F8FAFC',
    background: '#070A0D',
    backgroundElement: '#10161D',
    backgroundSelected: 'rgba(22,199,132,0.16)',
    textSecondary: '#AAB4C0',
    primary: Brand.primary,
    accent: Brand.accent,
    border: 'rgba(255,255,255,0.09)',
    card: '#10161D',
    tabIconDefault: '#707B87',
  },
  dark: {
    text: '#F8FAFC',
    background: '#070A0D',
    backgroundElement: '#10161D',
    backgroundSelected: 'rgba(22,199,132,0.16)',
    textSecondary: '#AAB4C0',
    primary: Brand.primary,
    accent: Brand.accent,
    border: 'rgba(255,255,255,0.09)',
    card: '#10161D',
    tabIconDefault: '#707B87',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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
  half: 8,
  one: 8,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 48,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
