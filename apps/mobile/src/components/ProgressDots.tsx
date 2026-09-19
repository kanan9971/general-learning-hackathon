import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Palette } from '@/constants/theme';

/** Step indicator: growing dots on the left, "n / total" on the right, in one row. */
export function ProgressDots({ total, current }: { total: number; current: number }) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Question ${current + 1} of ${total}`}
    >
      <View style={styles.dots}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i <= current ? Palette.primary : Palette.border,
                transform: [{ scaleX: i === current ? 3 : 1 }],
              },
            ]}
          />
        ))}
      </View>
      <Text style={styles.count}>
        {current + 1} / {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' },
  dot: { height: 8, width: 8, borderRadius: 4, transformOrigin: 'left center' },
  count: {
    fontFamily: Fonts.mono,
    color: Palette.muted,
    fontSize: 13,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
