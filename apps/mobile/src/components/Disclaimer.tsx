import { StyleSheet, Text } from 'react-native';

import { Palette } from '@/constants/theme';

export function Disclaimer() {
  return (
    <Text style={styles.text}>
      Educational use only. Not financial advice. Hypothetical scenarios, no real orders.
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: Palette.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
