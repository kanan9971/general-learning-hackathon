import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';

import { Palette } from '@/constants/theme';

/** Top-right on every tab: portfolio, progress, interests and settings live behind it. */
export function ProfileButton() {
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Profile" onPress={() => router.push('/profile')} hitSlop={8}>
      <Ionicons name="person-circle-outline" size={34} color={Palette.primary} />
    </Pressable>
  );
}
