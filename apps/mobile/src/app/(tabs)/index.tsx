import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  getQuizPreferences,
  updateQuizPreferences,
  type QuizFormat,
  type QuizPreferencesResponse,
} from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { Disclaimer } from '@/components/Disclaimer';
import { FormatSelector } from '@/components/FormatSelector';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { ThemedText } from '@/components/themed-text';
import { getPlan } from '@/lib/learner';
import { Palette, Radius } from '@/constants/theme';

export default function QuizLauncherScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<QuizPreferencesResponse | null>(null);
  const [formats, setFormats] = useState<QuizFormat[]>([]);
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(null);
        try {
          const plan = await getPlan();
          const data = await getQuizPreferences();
          if (cancelled) return;
          setPrefs(data);
          const saved = data.preferences.preferred_formats;
          setFormats(saved.length ? saved : []);
          setLevel(data.preferences.level || plan?.level || 'beginner');
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Could not load quiz preferences');
            // Local defaults so the UI still works if API is down briefly
            setPrefs({
              preferences: {
                preferred_formats: [],
                preferred_concept_ids: [],
                custom_topics: [],
                level: 'beginner',
              },
              available_formats: [
                { id: 'mcq', label: 'Multiple choice' },
                { id: 'case_study', label: 'Case study' },
                { id: 'short_answer', label: 'Short answer' },
                { id: 'analysis', label: 'Analysis' },
              ],
              available_topics: [],
            });
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const toggleFormat = (f: QuizFormat) => {
    setFormats((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  };

  const onStart = async () => {
    if (!formats.length) return;
    setError(null);
    try {
      await updateQuizPreferences({
        preferred_formats: formats,
        preferred_concept_ids: prefs?.preferences.preferred_concept_ids ?? [],
        custom_topics: prefs?.preferences.custom_topics ?? [],
        level,
      });
    } catch {
      // Preferences save is best-effort; session start still goes through.
    }
    router.push({
      pathname: '/quiz',
      params: {
        formats: formats.join(','),
        concepts: (prefs?.preferences.preferred_concept_ids ?? []).join(','),
        customs: (prefs?.preferences.custom_topics ?? []).join('|'),
        level,
      },
    });
  };

  if (loading) {
    return (
      <Screen title="Quiz">
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  const topics = prefs?.preferences.preferred_concept_ids ?? [];
  const customs = prefs?.preferences.custom_topics ?? [];
  const topicNames = topics.map((id) => {
    const hit = prefs?.available_topics.find((t) => t.id === id);
    return hit?.name ?? id;
  });

  return (
    <Screen
      title="Quiz"
      subtitle={`Adaptive practice · ${level}`}
      footer={
        <>
          <PrimaryButton
            label="Start quiz"
            onPress={() => void onStart()}
            disabled={!formats.length}
          />
          <Disclaimer />
        </>
      }
    >
      {error ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{error}</Text>
        </View>
      ) : null}

      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          How it works
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Questions adapt to your proficiency, weak topics, and recurring mistakes. Keep going as long
          as you like — we only prepare the next 2–3 questions at a time.
        </ThemedText>
      </Card>

      <SectionHeader title="Question types" meta="pick at least one" />
      <FormatSelector
        formats={prefs?.available_formats ?? []}
        selected={formats}
        onToggle={toggleFormat}
      />

      <SectionHeader title="Topics" meta={topicNames.length || customs.length ? 'customised' : 'auto'} />
      <Card>
        {topicNames.length === 0 && customs.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No topics pinned yet — we will target weak and due concepts automatically.
          </ThemedText>
        ) : (
          <ChipRow>
            {topicNames.map((n) => (
              <Chip key={n} label={n} tone="info" outlined />
            ))}
            {customs.map((c) => (
              <Chip key={c} label={c} tone="accent" outlined />
            ))}
          </ChipRow>
        )}
        <PrimaryButton
          label="Choose topics"
          variant="secondary"
          onPress={() => router.push('/topics' as '/quiz')}
          style={{ marginTop: 8 }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: {
    backgroundColor: Palette.softAccent,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warnText: { color: Palette.warning, fontSize: 13, fontWeight: '600' },
});
