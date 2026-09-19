import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AnimatedPressable, Motion } from '@/components/Motion';
import { Elevation, Palette, Radius } from '@/constants/theme';

export type AccordionItem = { id: string; title: string; meta?: string; children: React.ReactNode };

function Chevron({ open }: { open: boolean }) {
  const reduced = useReducedMotion();
  const rot = useSharedValue(open ? 180 : 0);
  useEffect(() => {
    rot.set(reduced ? (open ? 180 : 0) : withSpring(open ? 180 : 0, Motion.snappy));
  }, [open, reduced, rot]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rot.value}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Ionicons name="chevron-down" size={20} color={open ? Palette.primary : Palette.muted} />
    </Animated.View>
  );
}

/** Topics you open one at a time, so a long page becomes a short list of clear headings. */
export function Accordion({ items, defaultOpen }: { items: AccordionItem[]; defaultOpen?: string | null }) {
  const [open, setOpen] = useState<string | null>(defaultOpen === undefined ? (items[0]?.id ?? null) : defaultOpen);
  const reduced = useReducedMotion();
  return (
    <View style={{ gap: 10 }}>
      {items.map((it) => {
        const on = open === it.id;
        return (
          <View key={it.id} style={[styles.card, on && styles.cardOn]}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => setOpen(on ? null : it.id)}
              haptic="selection"
              pressScale={0.985}
              style={({ hovered }) => [styles.head, hovered && styles.headHover]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{it.title}</Text>
                {it.meta ? <Text style={styles.meta}>{it.meta}</Text> : null}
              </View>
              <Chevron open={on} />
            </AnimatedPressable>
            {on ? (
              <Animated.View
                entering={reduced ? FadeIn.duration(160) : FadeInDown.duration(400).springify().damping(30).stiffness(400)}
                exiting={FadeOut.duration(160)}
                style={styles.body}
              >
                {it.children}
              </Animated.View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    ...Elevation.card,
  },
  cardOn: { borderColor: Palette.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, minHeight: 52, borderRadius: Radius.md },
  headHover: { backgroundColor: 'rgba(28, 25, 23, 0.025)' },
  title: { color: Palette.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  meta: { color: Palette.muted, fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
});
