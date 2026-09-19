/**
 * DeskReady light design tokens (hackathon palette).
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Palette = {
  pageBackground: '#FAFAF7',
  surface: '#FFFFFF',
  primary: '#1E4E8C',
  primaryHover: '#163A68',
  secondary: '#087E8B',
  accent: '#F4B942',
  success: '#1F7A4D',
  warning: '#C45A00',
  error: '#B42318',
  text: '#1F2937',
  muted: '#596579',
  border: '#D9E2EC',
  softInfo: '#EAF3FF',
  softSuccess: '#EAF7EF',
  softAccent: '#FFF5D8',
  softError: '#FDECEC',
  white: '#FFFFFF',
} as const;

/** Light-first theme used by ThemedText / ThemedView. */
export const Colors = {
  light: {
    text: Palette.text,
    textSecondary: Palette.muted,
    background: Palette.pageBackground,
    backgroundElement: Palette.surface,
    backgroundSelected: Palette.softInfo,
    primary: Palette.primary,
    secondary: Palette.secondary,
    accent: Palette.accent,
    success: Palette.success,
    warning: Palette.warning,
    error: Palette.error,
    border: Palette.border,
  },
  dark: {
    // Demo is light-first; keep a readable dark fallback that mirrors roles.
    text: '#F3F4F6',
    textSecondary: '#9CA3AF',
    background: '#0F172A',
    backgroundElement: '#1E293B',
    backgroundSelected: '#1E3A5F',
    primary: '#5B8FD4',
    secondary: '#2AA6B2',
    accent: '#F4B942',
    success: '#34D399',
    warning: '#FB923C',
    error: '#F87171',
    border: '#334155',
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
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** One radius scale for every card, chip and button so surfaces line up. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

/** Shared layout constants: every card/section uses these so edges align across screens. */
export const Layout = {
  screenPadding: Spacing.three,
  cardPadding: Spacing.three,
  cardGap: Spacing.two,
  sectionGap: Spacing.three,
  controlHeight: 52,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 480;
