import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radius } from '@/constants/theme';

export type AccordionItem = { id: string; title: string; meta?: string; children: React.ReactNode };

/** Topics you open one at a time, so a long page becomes a short list of clear headings. */
export function Accordion({ items, defaultOpen }: { items: AccordionItem[]; defaultOpen?: string | null }) {
  const [open, setOpen] = useState<string | null>(defaultOpen === undefined ? (items[0]?.id ?? null) : defaultOpen);
  return (
    <View style={{ gap: 10 }}>
      {items.map((it) => {
        const on = open === it.id;
        return (
          <View key={it.id} style={[styles.card, on && styles.cardOn]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: on }}
              onPress={() => setOpen(on ? null : it.id)}
              style={styles.head}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{it.title}</Text>
                {it.meta ? <Text style={styles.meta}>{it.meta}</Text> : null}
              </View>
              <Ionicons name={on ? 'chevron-up' : 'chevron-down'} size={20} color={on ? Palette.primary : Palette.muted} />
            </Pressable>
            {on ? <View style={styles.body}>{it.children}</View> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: Palette.surface, borderWidth: 1, borderColor: Palette.border, borderRadius: Radius.md },
  cardOn: { borderColor: Palette.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 },
  title: { color: Palette.text, fontSize: 16, fontWeight: '800' },
  meta: { color: Palette.muted, fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
});
