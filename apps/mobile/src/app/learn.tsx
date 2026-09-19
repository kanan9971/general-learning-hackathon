import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';

export default function LearnScreen() {
  return (
    <Screen title="Learn">
      <ThemedText themeColor="textSecondary">Placeholder, built in a later phase.</ThemedText>
      <Disclaimer />
    </Screen>
  );
}
