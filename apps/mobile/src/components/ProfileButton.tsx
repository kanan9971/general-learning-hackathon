import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { AnimatedPressable } from '@/components/Motion';
import { Palette } from '@/constants/theme';

/** Top-right on every tab: progress, interests and settings live behind it. */
export function ProfileButton() {
  const router = useRouter();
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel="Profile"
      onPress={() => router.push('/profile')}
      hitSlop={8}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="person-circle-outline" size={34} color={Palette.primary} />
    </AnimatedPressable>
  );
}
