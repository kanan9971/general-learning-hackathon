import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { ThemedText } from '@/components/themed-text';
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
    <Card onPress={onPress} accessibilityLabel={`Open case study: ${title}`}>
      <View style={styles.top}>
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Case study
        </ThemedText>
        {confidence ? <Chip label={`${confidence} confidence`} tone="accent" size="sm" /> : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.catalyst}>{catalyst}</Text>
      <View style={styles.cta}>
        <Text style={styles.ctaText}>Open case study</Text>
        <Ionicons name="chevron-forward" size={16} color={Palette.primary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: Palette.text, fontSize: 18, fontWeight: '700', lineHeight: 24 },
  catalyst: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  ctaText: { color: Palette.primary, fontSize: 14, fontWeight: '700' },
});
