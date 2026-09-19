import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { getFixture, getHealth, type DataMode, type Health } from '@/api/client';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { Screen } from '@/components/Screen';
import { ThemedText } from '@/components/themed-text';

type Brief = { as_of_date: string; data_mode: DataMode; events: { id: string; title: string; catalyst: string }[] };

export default function Today() {
  const [health, setHealth] = useState<Health | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getHealth(), getFixture<Brief>('brief')])
      .then(([h, b]) => { setHealth(h); setBrief(b); })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <Screen title="Today">
      {error ? (
        <ThemedText>Can't reach the API ({error}). Is the backend running on :8000?</ThemedText>
      ) : !brief || !health ? (
        <ActivityIndicator />
      ) : (
        <>
          <DataModeBadge mode={brief.data_mode} asOf={brief.as_of_date} />
          <ThemedText type="small" themeColor="textSecondary">
            API {health.status} · v{health.version} (scaffold: placeholder brief, no real market data)
          </ThemedText>
          {brief.events.map((e) => (
            <LabelledSection key={e.id} kind="interpretation">
              <ThemedText type="subtitle">{e.title}</ThemedText>
              <ThemedText>{e.catalyst}</ThemedText>
            </LabelledSection>
          ))}
          <Disclaimer />
        </>
      )}
    </Screen>
  );
}
