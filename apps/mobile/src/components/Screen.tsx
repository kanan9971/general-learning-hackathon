import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Layout, MaxContentWidth, Palette, Spacing } from '@/constants/theme';

/**
 * Page shell. Every screen uses it so titles, gutters and the primary action line up.
 *
 * - `footer`: the screen's main action(s). Rendered in a pinned bar so the CTA is always in
 *   the same place and never scrolls out of view.
 * - `safeEdges`: tab screens (default) inset the top only — the tab bar covers the bottom.
 *   Stack screens with a native header pass `['bottom']`; header-less full screens pass
 *   `['top', 'bottom']`.
 */
export function Screen({
  title,
  subtitle,
  children,
  footer,
  scroll = true,
  safeEdges = ['top'],
  resetKey,
  right,
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
  safeEdges?: Edge[];
  /** When this changes the page scrolls back to the top (e.g. switching tabs). */
  resetKey?: string;
  /** Sits at the right of the title row (e.g. the profile button). */
  right?: React.ReactNode;
}) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, [resetKey]);

  const body = (
    <View style={styles.content}>
      {title || subtitle ? (
        <View style={styles.headerRow}>
          <View style={styles.header}>
            {title ? <ThemedText type="title">{title}</ThemedText> : null}
            {subtitle ? (
              <ThemedText type="small" themeColor="textSecondary">
                {subtitle}
              </ThemedText>
            ) : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={safeEdges}>
      {scroll ? (
        <ScrollView
          ref={ref}
          style={styles.root}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.root}>{body}</View>
      )}
      {footer ? (
        <View style={styles.footer}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.pageBackground },
  scroll: { flexGrow: 1 },
  content: {
    padding: Layout.screenPadding,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  header: { flex: 1, gap: Spacing.one, marginBottom: Spacing.one },
  footer: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  footerInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Layout.screenPadding,
    gap: Spacing.two,
  },
});
