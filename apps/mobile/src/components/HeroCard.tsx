import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Elevation, Gradients, Layout, OnDark, Radius } from '@/constants/theme';

export type HeroTone = keyof typeof Gradients;

/**
 * The one focal surface per screen: a deep gradient with two soft orbs for depth. Everything
 * inside should use `OnDark` colours (and `PrimaryButton variant="inverted"`). Same padding and
 * radius as `Card` so it lines up with the cards below it.
 */
export function HeroCard({
  tone = 'primary',
  children,
  style,
}: {
  tone?: HeroTone;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.shadow, style]}>
      <LinearGradient colors={Gradients[tone]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={[styles.orb, styles.orbLarge]} />
        <View style={[styles.orb, styles.orbSmall]} />
        <View style={styles.content}>{children}</View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shadow lives on an outer view: the gradient needs overflow:hidden for the orbs, which would
  // clip its own shadow on iOS.
  shadow: { borderRadius: Radius.lg, ...Elevation.hero },
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    padding: Layout.heroPadding,
  },
  content: { gap: Layout.cardGap },
  orb: { position: 'absolute', borderRadius: 999, pointerEvents: 'none' },
  orbLarge: { width: 260, height: 260, right: -90, top: -120, backgroundColor: OnDark.tint },
  orbSmall: { width: 140, height: 140, right: 30, bottom: -80, backgroundColor: OnDark.accentTint },
});
