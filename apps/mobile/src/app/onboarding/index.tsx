import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Disclaimer } from '@/components/Disclaimer';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { Palette } from '@/constants/theme';

export default function OnboardingWelcome() {
  const router = useRouter();

  return (
    <Screen title="DeskReady">
      <View style={styles.hero}>
        <Text style={styles.kicker}>DAILY MARKET TUTOR</Text>
        <Text style={styles.lead}>
          A 5–10 minute loop: see what moved, understand why, apply it to a demo portfolio, then prove it with a short quiz.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>First: a quick diagnostic</Text>
        <Text style={styles.cardBody}>
          Eight multiple-choice questions set the tone of your custom plan — level and focus concepts. You only do this once (you can retake later from Learn).
        </Text>
      </View>

      <PrimaryButton label="Start diagnostic" onPress={() => router.push('/onboarding/quiz')} />
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8 },
  kicker: { color: Palette.secondary, fontWeight: '700', fontSize: 12, letterSpacing: 0.8 },
  lead: { color: Palette.text, fontSize: 17, lineHeight: 26 },
  card: {
    backgroundColor: Palette.softInfo,
    borderColor: Palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  cardTitle: { color: Palette.primary, fontWeight: '700', fontSize: 16 },
  cardBody: { color: Palette.muted, fontSize: 14, lineHeight: 20 },
});
