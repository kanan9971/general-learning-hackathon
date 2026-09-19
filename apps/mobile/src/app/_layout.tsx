import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { isOnboarded } from '@/lib/learner';
import { Palette } from '@/constants/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    isOnboarded().then((v) => {
      setOnboarded(v);
      setReady(true);
    });
  }, []);

  // Re-check when navigating (e.g. after plan save or retake).
  useEffect(() => {
    if (!ready) return;
    isOnboarded().then(setOnboarded);
  }, [ready, segments]);

  useEffect(() => {
    if (!ready) return;
    const segs = segments as string[];
    const inOnboarding = segs[0] === 'onboarding';
    if (!onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (onboarded && inOnboarding) {
      // Allow retake routes (quiz/plan) while onboarded; only bounce away from welcome.
      const step = segs[1];
      if (!step || step === 'index') {
        router.replace('/(tabs)');
      }
    }
  }, [ready, onboarded, segments, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Palette.pageBackground }}>
        <ActivityIndicator color={Palette.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.pageBackground },
          // Shared look for every pushed screen: flat header on the page colour, bold title.
          headerStyle: { backgroundColor: Palette.pageBackground },
          headerShadowVisible: false,
          headerTintColor: Palette.primary,
          headerTitleStyle: { color: Palette.text, fontWeight: '700', fontSize: 17 },
          headerBackButtonDisplayMode: 'minimal',
        }}
      >
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ headerShown: true, title: 'Case study' }} />
        <Stack.Screen name="quiz" options={{ headerShown: true, title: "Today's quiz" }} />
        <Stack.Screen name="feedback" options={{ headerShown: true, title: 'Feedback' }} />
        <Stack.Screen name="lesson" options={{ headerShown: true, title: 'Lesson' }} />
      </Stack>
    </>
  );
}
