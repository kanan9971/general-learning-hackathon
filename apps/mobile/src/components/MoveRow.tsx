import { StyleSheet, Text, View } from 'react-native';

import type { Move } from '@/api/client';
import { Chip } from '@/components/Chip';
import { Palette } from '@/constants/theme';
import { level, signed } from '@/lib/format';

/** One market fact: label, level and 1-day change (numbers come from the backend, never the LLM). */
export function MoveRow({ move, showFiveDay, divider }: { move: Move; showFiveDay?: boolean; divider?: boolean }) {
  const color = move.change > 0 ? Palette.success : move.change < 0 ? Palette.error : Palette.text;
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <View style={styles.left}>
        <Text style={styles.label} numberOfLines={1}>
          {move.label}
        </Text>
        <Text style={styles.meta}>
          {level(move)}
          {showFiveDay && move.change_5d != null ? ` · 5d ${signed(move.change_5d, move.change_unit)}` : ''}
        </Text>
      </View>
      {move.unusual ? <Chip label="big move" tone="accent" size="sm" /> : null}
      <Text style={[styles.change, { color }]}>{signed(move.change, move.change_unit)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, minHeight: 44 },
  divider: { borderTopWidth: 1, borderTopColor: Palette.border },
  left: { flex: 1, gap: 2 },
  label: { color: Palette.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  meta: { color: Palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  change: { fontSize: 15, fontWeight: '700', minWidth: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
