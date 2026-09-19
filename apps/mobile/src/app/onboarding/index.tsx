import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { Disclaimer } from '@/components/Disclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

const LOOP = [
  { icon: 'eye-outline', label: 'Observe', text: 'See what moved today' },
  { icon: 'bulb-outline', label: 'Explain', text: 'Understand the mechanism' },
  { icon: 'pie-chart-outline', label: 'Apply', text: 'Trace it through a demo book' },
  { icon: 'checkmark-circle-outline', label: 'Answer', text: 'Prove it with a short quiz' },
] as const;

export default function OnboardingWelcome() {
  const router = useRouter();

  return (
    <Screen
      safeEdges={['top', 'bottom']}
      footer={
        <>
          <PrimaryButton label="Start diagnostic" onPress={() => router.push('/onboarding/quiz')} />
          <Disclaimer />
        </>
      }
    >
      <View style={styles.hero}>
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Daily market tutor
        </ThemedText>
        <ThemedText type="title">DeskReady</ThemedText>
        <Text style={styles.lead}>
          A 5–10 minute loop: see what moved, understand why, apply it to a demo portfolio, then
          prove it with a short quiz.
        </Text>
      </View>

      <Card style={styles.loop}>
        {LOOP.map((step, i) => (
          <View key={step.label} style={[styles.loopRow, i > 0 && styles.loopDivider]}>
            <View style={styles.loopIcon}>
              <Ionicons name={step.icon} size={18} color={Palette.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.loopLabel}>{step.label}</Text>
              <Text style={styles.loopText}>{step.text}</Text>
            </View>
          </View>
        ))}
      </Card>

      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.primary }}>
          First step
        </ThemedText>
        <ThemedText type="sectionTitle">A quick diagnostic</ThemedText>
        <Text style={styles.cardBody}>
          Eight multiple-choice questions set the tone of your custom plan — level and focus
          concepts. You only do this once (you can retake later from Learn).
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 6, paddingTop: 8 },
  lead: { color: Palette.text, fontSize: 17, lineHeight: 26, marginTop: 4 },
  loop: { paddingVertical: 4, gap: 0 },
  loopRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  loopDivider: { borderTopWidth: 1, borderTopColor: Palette.border },
  loopIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.softInfo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopLabel: { color: Palette.text, fontSize: 15, fontWeight: '700' },
  loopText: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  cardBody: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
});
