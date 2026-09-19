import { StyleSheet, Text, View } from 'react-native';

import { AnimatedPressable } from '@/components/Motion';
import { Layout, Palette, Radius } from '@/constants/theme';
import type { QuizFormat } from '@/api/client';

const COPY: Record<QuizFormat, { title: string; blurb: string }> = {
  mcq: { title: 'Multiple choice', blurb: 'Pick the best answer from four options.' },
  case_study: { title: 'Case study', blurb: 'Reason through a short hypothetical scenario.' },
  short_answer: { title: 'Short answer', blurb: 'Explain a concept in one to three sentences.' },
  analysis: { title: 'Analysis', blurb: 'Write a fuller mechanism and risk walkthrough.' },
};

export function FormatSelector({
  formats,
  selected,
  onToggle,
}: {
  formats: { id: string; label: string }[];
  selected: QuizFormat[];
  onToggle: (format: QuizFormat) => void;
}) {
  const list = (formats.length
    ? formats.map((f) => f.id as QuizFormat)
    : (Object.keys(COPY) as QuizFormat[]));

  return (
    <View style={styles.list}>
      {list.map((id) => {
        const on = selected.includes(id);
        const copy = COPY[id] ?? { title: id, blurb: '' };
        return (
          <AnimatedPressable
            key={id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            onPress={() => onToggle(id)}
            haptic="selection"
            pressScale={0.985}
            style={({ hovered }) => [styles.card, on && styles.cardOn, hovered && !on && { borderColor: Palette.subtle }]}
          >
            <View style={[styles.check, on && styles.checkOn]}>
              <Text style={[styles.checkText, on && styles.checkTextOn]}>{on ? '✓' : ''}</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{copy.title}</Text>
              <Text style={styles.blurb}>{copy.blurb}</Text>
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: Palette.surface,
    borderWidth: 2,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    padding: Layout.cardPadding,
  },
  cardOn: { borderColor: Palette.primary, backgroundColor: Palette.softInfo },
  check: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    borderWidth: 2,
    borderColor: Palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  checkOn: { borderColor: Palette.primary, backgroundColor: Palette.primary },
  checkText: { fontSize: 14, fontWeight: '700', color: Palette.muted },
  checkTextOn: { color: Palette.white },
  body: { flex: 1, gap: 2 },
  title: { color: Palette.text, fontSize: 16, fontWeight: '700' },
  blurb: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
});
