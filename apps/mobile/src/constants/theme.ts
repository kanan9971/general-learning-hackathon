/**
 * DeskReady light design tokens (warm editorial palette).
 */

import '@/global.css';

import { Platform, type ViewStyle } from 'react-native';

export const Palette = {
  pageBackground: '#FBFAF8',
  surface: '#FFFFFF',
  surfaceSunken: '#F4F2ED',
  primary: '#1E4E8C',
  primaryHover: '#163A68',
  secondary: '#087E8B',
  accent: '#F4B942',
  success: '#1F7A4D',
  warning: '#C45A00',
  error: '#B42318',
  text: '#17181C',
  muted: '#5B6270',
  subtle: '#8A91A0',
  border: 'rgba(28, 25, 23, 0.08)',
  softInfo: '#EDF2F8',
  softSuccess: '#E8F3EC',
  softAccent: '#FBF3DC',
  softError: '#F8E8E6',
  white: '#FFFFFF',
} as const;

/** Text and rails for content sitting on a dark `HeroCard` surface. */
export const OnDark = {
  fg: '#FFFFFF',
  muted: 'rgba(255, 255, 255, 0.74)',
  faint: 'rgba(255, 255, 255, 0.52)',
  track: 'rgba(255, 255, 255, 0.18)',
  tint: 'rgba(255, 255, 255, 0.12)',
  accent: Palette.accent,
  accentTint: 'rgba(244, 185, 66, 0.18)',
} as const;

/** Gradient stops for `HeroCard`. Tuple type matches expo-linear-gradient's `colors` prop. */
export const Gradients = {
  primary: ['#2A62A8', '#1E4E8C', '#132F5A'] as const,
  success: ['#28905E', '#1F7A4D', '#124A2F'] as const,
  ink: ['#2A2C33', '#17181C', '#0E0F12'] as const,
};

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

const systemFonts = Platform.select({
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
    sans: 'var(--font-sans)',
    serif: 'var(--font-display)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
})!;

export const Fonts = {
  ...systemFonts,
  display: 'Fraunces_700Bold',
  displaySemi: 'Fraunces_600SemiBold',
  mono: Platform.select({ web: 'var(--font-mono)', default: 'JetBrainsMono_500Medium' }) ?? 'JetBrainsMono_500Medium',
};

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
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

/** Shared layout constants: every card/section uses these so edges align across screens. */
export const Layout = {
  screenPadding: Spacing.three,
  cardPadding: 20,
  heroPadding: Spacing.four,
  cardGap: 10,
  sectionGap: Spacing.four,
  controlHeight: 52,
} as const;

function shadow(opacity: number, radius: number, y: number, elevation: number, web: string, color = '#1C1917'): ViewStyle {
  return Platform.select<ViewStyle>({
    web: { boxShadow: web } as ViewStyle,
    default: {
      shadowColor: color,
      shadowOpacity: opacity,
      shadowRadius: radius,
      shadowOffset: { width: 0, height: y },
      elevation,
    },
  })!;
}

/** Warm, low-opacity elevation. Use `card` at rest and `raised` on press/hover. */
export const Elevation = {
  card: shadow(0.04, 10, 2, 1, '0 2px 10px rgba(28, 25, 23, 0.04)'),
  raised: shadow(0.08, 24, 8, 4, '0 8px 24px rgba(28, 25, 23, 0.08)'),
  footer: shadow(0.06, 16, -4, 8, '0 -4px 16px rgba(28, 25, 23, 0.06)'),
  /** Tinted glow for the primary CTA and hero surfaces. */
  primary: shadow(0.22, 18, 6, 4, '0 6px 18px rgba(30, 78, 140, 0.22)', '#1E4E8C'),
  hero: shadow(0.28, 30, 12, 6, '0 12px 30px rgba(19, 47, 90, 0.28)', '#132F5A'),
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 480;
