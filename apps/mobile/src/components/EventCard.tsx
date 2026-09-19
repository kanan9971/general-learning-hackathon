import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette } from '@/constants/theme';

export function EventCard({
  title,
  catalyst,
  confidence,
  onPress,
}: {
  title: string;
  catalyst: string;
  confidence?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.card} accessibilityRole="button">
      <View style={styles.top}>
        <Text style={styles.kicker}>CASE STUDY</Text>
        {confidence ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{confidence.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.catalyst}>{catalyst}</Text>
      <Text style={styles.cta}>Open case study →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.surface,
    borderColor: Palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: Palette.secondary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  badge: {
    backgroundColor: Palette.softAccent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: { color: Palette.warning, fontSize: 11, fontWeight: '700' },
  title: { color: Palette.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  catalyst: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
  cta: { color: Palette.primary, fontSize: 13, fontWeight: '600', marginTop: 4 },
});
