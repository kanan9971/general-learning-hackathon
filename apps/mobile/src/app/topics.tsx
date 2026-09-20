import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  getQuizPreferences,
  updateQuizPreferences,
  type TopicOption,
} from '@/api/client';
import { ChipRow } from '@/components/Chip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SelectableChip } from '@/components/SelectableChip';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { getPlan } from '@/lib/learner';

export default function TopicsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [customs, setCustoms] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [level, setLevel] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [formats, setFormats] = useState<string[]>([]);

  useEffect(() => {
    getQuizPreferences()
      .then(async (data) => {
        const plan = await getPlan();
        setTopics(data.available_topics);
        setSelected(data.preferences.preferred_concept_ids);
        setCustoms(data.preferences.custom_topics);
        setLevel(plan?.level || data.preferences.level);
        setFormats(data.preferences.preferred_formats);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load topics'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.id.includes(q) ||
        (t.asset_class ?? '').toLowerCase().includes(q),
    );
  }, [topics, query]);

  const toggle = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const addCustom = () => {
    const t = draft.trim();
    if (!t) return;
    if (customs.some((c) => c.toLowerCase() === t.toLowerCase())) {
      setDraft('');
      return;
    }
    setCustoms((prev) => [...prev, t].slice(0, 20));
    setDraft('');
  };

  const removeCustom = (t: string) => {
    setCustoms((prev) => prev.filter((c) => c !== t));
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateQuizPreferences({
        preferred_formats: formats as ('mcq' | 'case_study' | 'short_answer' | 'analysis')[],
        preferred_concept_ids: selected,
        custom_topics: customs,
        level,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save topics');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Screen title="Topics" safeEdges={['bottom']}>
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  return (
    <Screen
      title="Choose topics"
      subtitle="Pin catalog concepts or add your own finance interests."
      safeEdges={['bottom']}
      footer={
        <>
          <PrimaryButton label={saving ? 'Saving…' : 'Save topics'} onPress={() => void onSave()} disabled={saving} />
          <PrimaryButton label="Cancel" variant="ghost" onPress={() => router.back()} />
        </>
      }
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionHeader title="Search catalog" />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search rates, equities, FX…"
        placeholderTextColor={Palette.muted}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ChipRow>
        {filtered.map((t) => (
          <SelectableChip
            key={t.id}
            label={t.name}
            selected={selected.includes(t.id)}
            onPress={() => toggle(t.id)}
          />
        ))}
      </ChipRow>
      {filtered.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          No catalog matches.
        </ThemedText>
      ) : null}

      <SectionHeader title="Your topics" meta={`${customs.length} custom`} />
      <View style={styles.addRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. basis trading, SOFR futures"
          placeholderTextColor={Palette.muted}
          style={[styles.input, styles.addInput]}
          onSubmitEditing={addCustom}
          returnKeyType="done"
        />
        <PrimaryButton label="Add" variant="secondary" onPress={addCustom} style={styles.addBtn} />
      </View>
      <ChipRow>
        {customs.map((c) => (
          <SelectableChip key={c} label={c} selected tone="accent" onPress={() => removeCustom(c)} />
        ))}
      </ChipRow>
      <ThemedText type="caption" themeColor="textSecondary">
        Tap a custom topic to remove it. Topics are optional — leave empty to auto-target weak areas.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Palette.text,
  },
  addRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addInput: { flex: 1 },
  addBtn: { minWidth: 88, paddingHorizontal: 12 },
  error: { color: Palette.error, fontWeight: '600', fontSize: 13 },
});
