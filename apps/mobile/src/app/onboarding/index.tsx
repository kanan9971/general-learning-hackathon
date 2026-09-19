import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Card } from '@/components/Card';
import { Disclaimer } from '@/components/Disclaimer';
import { Reveal } from '@/components/Motion';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';
import { Fonts, Palette } from '@/constants/theme';

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
          <PrimaryButton label="Find my level" icon="arrow-forward" onPress={() => router.push('/onboarding/quiz')} />
          <Disclaimer />
        </>
      }
    >
      <Reveal index={0}>
        <View style={styles.hero}>
          <ThemedText type="kicker" style={{ color: Palette.secondary }}>
            Daily market tutor
          </ThemedText>
          <ThemedText type="display">DeskReady</ThemedText>
          <Text style={styles.lead}>
            A 5–10 minute loop: see what moved, understand why, apply it to a demo portfolio, then
            prove it with a short quiz.
          </Text>
        </View>
      </Reveal>

      <Reveal index={1}>
        <Card style={styles.loop}>
          <ThemedText type="kicker" themeColor="textSecondary" style={styles.loopKicker}>
            The daily loop
          </ThemedText>
          {LOOP.map((step, i) => (
            <Reveal key={step.label} index={i + 1}>
              <View style={styles.loopRow}>
                <View style={styles.loopRail}>
                  <View style={styles.loopIcon}>
                    <Ionicons name={step.icon} size={18} color={Palette.primary} />
                  </View>
                  {i < LOOP.length - 1 ? <View style={styles.loopLine} /> : null}
                </View>
                <View style={styles.loopBody}>
                  <View style={styles.loopHead}>
                    <Text style={styles.loopStep}>{i + 1}</Text>
                    <Text style={styles.loopLabel}>{step.label}</Text>
                  </View>
                  <Text style={styles.loopText}>{step.text}</Text>
                </View>
              </View>
            </Reveal>
          ))}
        </Card>
      </Reveal>

      <Reveal index={2}>
        <Card tone="info">
          <ThemedText type="kicker" style={{ color: Palette.primary }}>
            First step
          </ThemedText>
          <ThemedText type="sectionTitle">A 5-minute placement quiz</ThemedText>
          <Text style={styles.cardBody}>
            Nine adaptive questions, one per topic, find what you already know. They build your personal
            roadmap, so you skip the basics you have covered and start where the gaps are. You can retake it
            any time from your profile.
          </Text>
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 10, paddingTop: 24, paddingBottom: 8 },
  lead: { color: Palette.muted, fontSize: 17, lineHeight: 26, marginTop: 4, maxWidth: 340 },
  loop: { gap: 0 },
  loopKicker: { marginBottom: 12 },
  loopRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  loopRail: { alignItems: 'center', width: 36 },
  loopIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Palette.softInfo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loopLine: { flex: 1, width: 2, backgroundColor: Palette.border, marginVertical: 4, borderRadius: 1 },
  loopBody: { flex: 1, paddingBottom: 18, paddingTop: 4, gap: 2 },
  loopHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  loopStep: { fontFamily: Fonts.mono, color: Palette.subtle, fontSize: 11, fontWeight: '500', letterSpacing: 0.8 },
  loopLabel: { color: Palette.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  loopText: { color: Palette.muted, fontSize: 13.5, lineHeight: 19 },
  cardBody: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
});
