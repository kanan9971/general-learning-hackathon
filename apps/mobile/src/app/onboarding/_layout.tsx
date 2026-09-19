import { Stack } from 'expo-router';

import { Palette } from '@/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Palette.pageBackground },
      }}
    />
  );
}
