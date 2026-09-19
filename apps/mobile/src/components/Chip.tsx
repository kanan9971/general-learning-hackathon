import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Palette, Radius } from '@/constants/theme';

export type ChipTone = 'info' | 'accent' | 'success' | 'error' | 'neutral';

const TONE: Record<ChipTone, { bg: string; fg: string; border: string }> = {
  info: { bg: Palette.softInfo, fg: Palette.primary, border: Palette.softInfo },
  accent: { bg: Palette.softAccent, fg: Palette.warning, border: Palette.softAccent },
  success: { bg: Palette.softSuccess, fg: Palette.success, border: Palette.softSuccess },
  error: { bg: Palette.softError, fg: Palette.error, border: Palette.softError },
  neutral: { bg: Palette.surface, fg: Palette.muted, border: Palette.border },
};

/** Pill tag. `size="sm"` is for badges inside card headers; default is for tag lists. */
export function Chip({
  label,
  tone = 'info',
  size = 'md',
  outlined,
}: {
  label: string;
  tone?: ChipTone;
  size?: 'sm' | 'md';
  outlined?: boolean;
}) {
  const t = TONE[tone];
  return (
    <View
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: t.bg, borderColor: outlined ? t.fg : t.border },
      ]}
    >
      <Text style={[styles.text, size === 'sm' ? styles.textSm : styles.textMd, { color: t.fg }]}>
        {label}
      </Text>
    </View>
  );
}

/** Wrap-around row for a list of chips; consistent 8px gaps. */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { borderRadius: Radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
  md: { paddingHorizontal: 12, paddingVertical: 6 },
  sm: { paddingHorizontal: 8, paddingVertical: 4 },
  text: { fontWeight: '600' },
  textMd: { fontSize: 13, lineHeight: 18 },
  textSm: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
