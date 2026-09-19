import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Headline } from '@/api/client';
import { Chip } from '@/components/Chip';
import { Palette } from '@/constants/theme';
import { timeAgo } from '@/lib/format';

/** Headline + publisher + time. Tapping opens the publisher's page (we never store article bodies). */
export function HeadlineItem({ item, compact, divider }: { item: Headline; compact?: boolean; divider?: boolean }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${item.publisher}: ${item.title}`}
      onPress={() => void WebBrowser.openBrowserAsync(item.url)}
      style={({ pressed }) => [styles.row, divider && styles.divider, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.meta}>
        <Chip
          label={item.is_official ? 'Fed · official' : item.publisher}
          tone={item.is_official ? 'success' : 'neutral'}
          size="sm"
        />
        <Text style={styles.time}>{timeAgo(item.published_at)}</Text>
        <View style={{ flex: 1 }} />
        <Ionicons name="open-outline" size={14} color={Palette.muted} />
      </View>
      <Text style={styles.title} numberOfLines={compact ? 2 : 3}>
        {item.title}
      </Text>
      {!compact && item.summary && item.summary !== item.title ? (
        <Text style={styles.summary} numberOfLines={3}>
          {item.summary}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: Palette.border },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { color: Palette.muted, fontSize: 12 },
  title: { color: Palette.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  summary: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
});
