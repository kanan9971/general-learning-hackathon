import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';

export function Screen({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.root} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{title}</ThemedText>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 12, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});
