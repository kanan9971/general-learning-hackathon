import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/Motion';
import { Elevation, Fonts, Palette, Radius } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Tone = 'info' | 'success' | 'accent' | 'teal' | 'error';

const TONE: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: Palette.softInfo, fg: Palette.primary },
  success: { bg: Palette.softSuccess, fg: Palette.success },
  accent: { bg: Palette.softAccent, fg: Palette.warning },
  teal: { bg: Palette.softSuccess, fg: Palette.secondary },
  error: { bg: Palette.softError, fg: Palette.error },
};

/** A big, obvious button that opens its own page: icon, title, one-line promise. */
export function HubTile({
  icon,
  title,
  subtitle,
  tone = 'info',
  badge,
  wide,
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  tone?: Tone;
  badge?: string;
  wide?: boolean;
  onPress: () => void;
}) {
  const t = TONE[tone];
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      onPress={onPress}
      haptic="selection"
      lift={2}
      style={({ pressed, hovered }) => [styles.tile, wide ? styles.wide : styles.half, (pressed || hovered) && styles.pressed]}
    >
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: t.bg }]}>
          <Ionicons name={icon} size={22} color={t.fg} />
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: t.bg }]}>
            <Text style={[styles.badgeText, { color: t.fg }]}>{badge}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
        )}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{subtitle}</Text>
    </AnimatedPressable>
  );
}

/** Two-column grid wrapper for tiles. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.lg,
    padding: 16,
    gap: 4,
    minHeight: 118,
    ...Elevation.card,
  },
  half: { flexBasis: '47%', flexGrow: 1 },
  wide: { width: '100%' },
  pressed: { borderColor: Palette.primary, ...Elevation.raised },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: { color: Palette.text, fontSize: 16, fontWeight: '700', lineHeight: 21, letterSpacing: -0.2 },
  sub: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
});
