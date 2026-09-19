import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';

import {
  ApiError,
  cancelPaperOrder,
  getPaperAnalysis,
  getPaperBook,
  submitPaperOrder,
  type ListedOption,
  type PaperAnalysis,
  type PaperBook,
  type PaperSide,
  type TicketKind,
} from '@/api/client';
import { Card } from '@/components/Card';
import { Chip, ChipRow } from '@/components/Chip';
import { DataModeBadge } from '@/components/DataModeBadge';
import { Disclaimer } from '@/components/Disclaimer';
import { LabelledSection } from '@/components/LabelledSection';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileButton } from '@/components/ProfileButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SelectableChip } from '@/components/SelectableChip';
import { ThemedText } from '@/components/themed-text';
import { Palette, Radius } from '@/constants/theme';
import { getPlan } from '@/lib/learner';

const usd = (n: number, digits = 0) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits });

const SIDE_LABEL: Record<PaperSide, string> = { buy: 'Buy', sell: 'Sell', short: 'Short', cover: 'Cover' };
const TICKET_LABEL: Record<TicketKind, string> = { market: 'Market', limit: 'Limit', stop: 'Stop' };

/** Paper classroom book: fake money, simulated fills. Not mixed with the Markets teaching book. */
export default function PortfolioTab() {
  const [book, setBook] = useState<PaperBook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [symbol, setSymbol] = useState('AAPL');
  const [side, setSide] = useState<PaperSide>('buy');
  const [kind, setKind] = useState<TicketKind>('market');
  const [qty, setQty] = useState('1');
  const [limit, setLimit] = useState('');
  const [option, setOption] = useState<ListedOption | null>(null);
  const [analysis, setAnalysis] = useState<PaperAnalysis | null>(null);
  const [customDraft, setCustomDraft] = useState('');

  const loadBook = useCallback(async () => {
    setError(null);
    try {
      const plan = await getPlan();
      const next = await getPaperBook(plan?.level);
      setBook(next);
      setSide((s) => (next.allowed_sides.includes(s) ? s : next.allowed_sides[0]));
      setKind((k) => (next.allowed_ticket_kinds.includes(k) ? k : next.allowed_ticket_kinds[0]));
      setSymbol((sym) => {
        if (next.whitelist.some((w) => w.symbol === sym)) return sym;
        if (next.custom_tickers_allowed) return sym;
        return next.whitelist[0]?.symbol ?? sym;
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the paper book');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBook();
    }, [loadBook]),
  );

  const submit = async () => {
    if (!book) return;
    const quantity = Number(qty);
    if (!quantity || quantity <= 0) {
      setError('Enter a positive quantity');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const plan = await getPlan();
      const res = await submitPaperOrder({
        symbol: option ? option.underlying : symbol,
        side,
        quantity,
        ticket_kind: kind,
        limit_price: kind === 'market' ? null : Number(limit) || null,
        instrument_kind: option ? 'option' : 'equity',
        option_right: option?.right ?? null,
        option_strike: option?.strike ?? null,
        option_expiry: option?.expiry ?? null,
        level: plan?.level,
      });
      setBook(res.book);
      setAnalysis(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Ticket failed');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setBook(await cancelPaperOrder(id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not cancel');
    } finally {
      setBusy(false);
    }
  };

  const runAnalysis = async () => {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await getPaperAnalysis());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Analysis is not available yet');
    } finally {
      setBusy(false);
    }
  };

  if (!book && !error) {
    return (
      <Screen title="Portfolio" subtitle="Paper classroom" right={<ProfileButton />}>
        <ActivityIndicator color={Palette.primary} />
      </Screen>
    );
  }

  return (
    <Screen title="Portfolio" subtitle="Paper classroom · simulated fills" right={<ProfileButton />} footer={<Disclaimer />}>
      {book ? <DataModeBadge mode={book.data_mode} asOf={book.as_of ?? undefined} /> : null}

      <Card tone="info">
        <ThemedText type="kicker" style={{ color: Palette.secondary }}>
          Classroom cash · {book?.level}
        </ThemedText>
        <ThemedText type="display">{usd(book?.nav ?? 0)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Cash {usd(book?.cash_usd ?? 0)} · holdings {usd(book?.equity_value ?? 0)} · started at{' '}
          {usd(book?.starting_cash ?? 0)}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {book?.educational}
        </ThemedText>
      </Card>

      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <SectionHeader title="Holdings" meta={book?.lots.length ? `${book.lots.length}` : 'cash only'} />
      {!book?.lots.length ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No names yet. Put on a classroom ticket below — this never sends a live order.
          </ThemedText>
        </Card>
      ) : (
        book.lots.map((lot) => (
          <Card key={lot.id}>
            <View style={styles.row}>
              <ThemedText type="sectionTitle">
                {lot.symbol}
                {lot.kind === 'option' ? ` ${lot.option_right} ${lot.option_strike}` : ''}
              </ThemedText>
              <ThemedText type="smallBold">{lot.market_value != null ? usd(lot.market_value) : '—'}</ThemedText>
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {lot.quantity} × {lot.market_price != null ? usd(lot.market_price, 2) : 'no mark'} · cost{' '}
              {usd(lot.cost_basis, 2)}
              {lot.unrealized_pct != null ? ` · ${lot.unrealized_pct.toFixed(1)}% vs cost` : ''}
            </ThemedText>
          </Card>
        ))
      )}

      {book?.attribution ? (
        <LabelledSection kind="fact" title="Today's classroom P&L">
          <ThemedText>
            Day move {book.attribution.portfolio_return_pct.toFixed(2)}% (from prices, not the model).
          </ThemedText>
        </LabelledSection>
      ) : null}

      <SectionHeader title="Trade ticket" />
      <Card>
        <ThemedText type="kicker">Name</ThemedText>
        <View style={styles.pickedRow}>
          <ThemedText type="sectionTitle">{option ? option.underlying : symbol}</ThemedText>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Yahoo Finance chart for ${option ? option.underlying : symbol}`}
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `https://finance.yahoo.com/chart/${encodeURIComponent(option ? option.underlying : symbol)}`,
              )
            }
            style={styles.yahooLink}
          >
            <ThemedText type="linkPrimary">Chart on Yahoo</ThemedText>
            <Ionicons name="open-outline" size={16} color={Palette.primary} />
          </Pressable>
        </View>
        <ChipRow>
          {(book?.whitelist ?? []).map((w) => (
            <SelectableChip
              key={w.symbol}
              label={w.symbol}
              selected={!option && symbol === w.symbol}
              onPress={() => {
                setSymbol(w.symbol);
                setOption(null);
              }}
            />
          ))}
        </ChipRow>
        {book?.custom_tickers_allowed ? (
          <>
            <ThemedText type="caption" themeColor="textSecondary">
              Intermediate and advanced can type any stock or ETF Yahoo prices. Demo day only fills names we already have a print for.
            </ThemedText>
            <View style={styles.customRow}>
              <TextInput
                value={customDraft}
                onChangeText={(t) => setCustomDraft(t.toUpperCase())}
                onSubmitEditing={() => {
                  const next = customDraft.trim().toUpperCase();
                  if (next) {
                    setSymbol(next);
                    setOption(null);
                  }
                }}
                placeholder="Custom ticker, e.g. NFLX"
                autoCapitalize="characters"
                autoCorrect={false}
                style={[styles.input, { flex: 1 }]}
                placeholderTextColor={Palette.muted}
              />
              <PrimaryButton
                label="Use"
                variant="secondary"
                onPress={() => {
                  const next = customDraft.trim().toUpperCase();
                  if (next) {
                    setSymbol(next);
                    setOption(null);
                  }
                }}
                style={{ minWidth: 80 }}
              />
            </View>
          </>
        ) : (
          <ThemedText type="caption" themeColor="textSecondary">
            Beginner tickets stay on this classroom list. A custom ticker unlocks at intermediate.
          </ThemedText>
        )}
        <ThemedText type="kicker">Side</ThemedText>
        <ChipRow>
          {(book?.allowed_sides ?? []).map((s) => (
            <SelectableChip key={s} label={SIDE_LABEL[s]} selected={side === s} onPress={() => setSide(s)} />
          ))}
        </ChipRow>
        <ThemedText type="kicker">Ticket</ThemedText>
        <ChipRow>
          {(book?.allowed_ticket_kinds ?? []).map((t) => (
            <SelectableChip key={t} label={TICKET_LABEL[t]} selected={kind === t} onPress={() => setKind(t)} />
          ))}
        </ChipRow>
        {kind !== 'market' ? (
          <TextInput
            value={limit}
            onChangeText={setLimit}
            placeholder={kind === 'stop' ? 'Trigger price' : 'Limit price'}
            keyboardType="decimal-pad"
            style={styles.input}
            placeholderTextColor={Palette.muted}
          />
        ) : null}
        <TextInput
          value={qty}
          onChangeText={setQty}
          placeholder="Quantity"
          keyboardType="decimal-pad"
          style={styles.input}
          placeholderTextColor={Palette.muted}
        />
        {book?.options_allowed ? (
          <>
            <ThemedText type="kicker">Listed options (advanced)</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              Buy-to-open / sell-to-close only. Marks come from a formula, not a live chain.
            </ThemedText>
            <ChipRow>
              <SelectableChip label="Shares" selected={!option} onPress={() => setOption(null)} />
              {(book.listed_options ?? []).slice(0, 8).map((o) => {
                const key = `${o.underlying}-${o.right}-${o.strike}-${o.expiry}`;
                const selected =
                  option?.underlying === o.underlying &&
                  option.right === o.right &&
                  option.strike === o.strike &&
                  option.expiry === o.expiry;
                return (
                  <SelectableChip
                    key={key}
                    label={`${o.underlying} ${o.right[0].toUpperCase()} ${o.strike}`}
                    selected={selected}
                    tone="accent"
                    onPress={() => {
                      setOption(o);
                      setSymbol(o.underlying);
                    }}
                  />
                );
              })}
            </ChipRow>
          </>
        ) : (
          <ThemedText type="caption" themeColor="textSecondary">
            Shorts, limits and listed options unlock at higher classroom levels.
          </ThemedText>
        )}
        <PrimaryButton label={busy ? 'Working…' : 'Simulate fill'} onPress={submit} disabled={busy} />
      </Card>

      <SectionHeader title="Fills" meta={book?.fills.length ? `${book.fills.length}` : undefined} />
      {!book?.fills.length ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Fills show up here. Analysis unlocks on the next US session after a fill, not after 24 hours.
          </ThemedText>
        </Card>
      ) : (
        book.fills.map((f) => (
          <Card key={f.id}>
            <View style={styles.row}>
              <ThemedText type="sectionTitle">
                {f.side} {f.quantity} {f.symbol}
              </ThemedText>
              <Chip label={f.status} size="sm" tone={f.status === 'filled' ? 'success' : f.status === 'working' ? 'accent' : 'neutral'} />
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {f.ticket_kind}
              {f.fill_price != null ? ` · ${usd(f.fill_price, 2)}` : ''}
              {f.analysis_ready ? ' · analysis ready' : ''}
            </ThemedText>
            {f.status === 'working' ? (
              <PrimaryButton label="Cancel resting ticket" variant="secondary" onPress={() => cancel(f.id)} disabled={busy} />
            ) : null}
          </Card>
        ))
      )}

      <SectionHeader title="Analysis overview" />
      {book?.analysis_available ? (
        <PrimaryButton label={analysis ? 'Refresh analysis' : 'Write the overview'} onPress={runAnalysis} disabled={busy} />
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {book?.analysis_unlocks_on
              ? `Locked until the next US session (${book.analysis_unlocks_on}). The size of the move will come from prices, not the write-up.`
              : 'Put on a fill first. The write-up unlocks on the next US cash session.'}
          </ThemedText>
        </Card>
      )}

      {analysis ? (
        <>
          <LabelledSection kind="fact" title="What the prices show">
            {analysis.facts.map((f) => (
              <ThemedText key={f.fact_id} type="small">
                {f.label}: last {f.last != null ? usd(f.last, 2) : '—'} · day {f.change}
                {f.change_unit}
                {f.return_since_fill != null ? ` · vs fill ${f.return_since_fill.toFixed(1)}%` : ''}
              </ThemedText>
            ))}
          </LabelledSection>
          <LabelledSection kind="interpretation" title={analysis.analysis.headline}>
            <Chip
              label={analysis.analysis.status === 'ok' ? analysis.analysis.confidence : 'template fallback'}
              size="sm"
              tone={analysis.analysis.status === 'ok' ? 'accent' : 'neutral'}
            />
            <ThemedText>{analysis.analysis.summary}</ThemedText>
            {analysis.analysis.points.map((p) => (
              <ThemedText key={`${p.symbol}-${p.point}`} type="small">
                {p.symbol}: {p.point} {p.fact_ids.length ? `(${p.fact_ids.join(', ')})` : ''}
              </ThemedText>
            ))}
            <ThemedText type="caption" themeColor="textSecondary">
              {analysis.analysis.confidence_reason}
            </ThemedText>
          </LabelledSection>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pickedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  yahooLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    fontSize: 16,
    color: Palette.text,
    backgroundColor: Palette.surface,
  },
  error: { color: Palette.error, fontWeight: '600' },
});
