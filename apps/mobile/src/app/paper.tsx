import { Redirect } from 'expo-router';

/** Old Profile deep link — paper classroom now lives on the Portfolio tab. */
export default function PaperRedirect() {
  return <Redirect href="/(tabs)/portfolio" />;
}
