import { Disclaimer } from '@/components/Disclaimer';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';

export default function DeskScreen() {
  return (
    <Screen title="Desk">
      <ThemedText themeColor="textSecondary">Placeholder, built in a later phase.</ThemedText>
      <Disclaimer />
    </Screen>
  );
}
