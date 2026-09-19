import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';

import {
  ApiError,
  cancelPaperOrder,
  getChartHistory,
  getPaperAnalysis,
  getPaperBook,
  submitPaperOrder,
  type ChartHistory,
  type ChartTimeframe,
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
import { HeroCard } from '@/components/HeroCard';
import { LabelledSection } from '@/components/LabelledSection';
import { AnimatedPressable } from '@/components/Motion';
import { OrderChart, buildSeries, seriesKey } from '@/components/OrderChart';
import { FillsBlotter, PositionsTable } from '@/components/PaperBlotter';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ProfileButton } from '@/components/ProfileButton';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { SelectableChip } from '@/components/SelectableChip';
import { ThemedText } from '@/components/themed-text';
import { Layout, OnDark, Palette, Radius } from '@/constants/theme';
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
  // Chart view state only: which instrument is plotted and which fill is highlighted.
  const [chartKey, setChartKey] = useState<string | null>(null);
  const [selectedFillId, setSelectedFillId] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('1M');
  const [history, setHistory] = useState<ChartHistory | null>(null);
  const [histBusy, setHistBusy] = useState(false);

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
      // Show the new ticket on the chart straight away.
      setChartKey(seriesKey(res.fill));
      setSelectedFillId(res.fill.id);
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

  const series = book ? buildSeries(book) : [];
  const overlaySeries =
    series.find((s) => s.key === chartKey) ??
    (chartKey ? { key: chartKey, label: chartKey, fills: [], lot: null } : (series[0] ?? null));
  const optionSeries = Boolean(overlaySeries?.fills[0]?.option_right || overlaySeries?.lot?.option_right);
  const chartSymbol = optionSeries ? null : (overlaySeries?.key ?? option?.underlying ?? symbol);

  useEffect(() => {
    if (!chartSymbol) {
      setHistory(null);
      return;
    }
    let cancelled = false;
    setHistBusy(true);
    void getChartHistory(chartSymbol, timeframe)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch(() => {
        if (!cancelled) setHistory(null);
      })
      .finally(() => {
        if (!cancelled) setHistBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chartSymbol, timeframe]);

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

      <HeroCard tone="ink">
        <ThemedText type="kicker" style={{ color: OnDark.accent }}>
          Classroom cash · {book?.level}
        </ThemedText>
        <ThemedText type="display" style={{ color: OnDark.fg, fontVariant: ['tabular-nums'] }}>
          {usd(book?.nav ?? 0)}
        </ThemedText>
        <ThemedText type="small" style={{ color: OnDark.muted }}>
          Cash {usd(book?.cash_usd ?? 0)} · holdings {usd(book?.equity_value ?? 0)} · started at{' '}
          {usd(book?.starting_cash ?? 0)}
        </ThemedText>
        <ThemedText type="caption" style={{ color: OnDark.faint }}>
          {book?.educational}
        </ThemedText>
      </HeroCard>

      {error ? (
        <ThemedText type="small" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <SectionHeader title="Positions" meta={book?.lots.length ? `${book.lots.length} open` : 'cash only'} />
      {!book?.lots.length ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            No names yet. Put on a classroom ticket below — this never sends a live order.
          </ThemedText>
        </Card>
      ) : (
        <PositionsTable
          lots={book.lots}
          onOpen={(lot) => {
            setChartKey(seriesKey(lot));
            setSelectedFillId(null);
          }}
        />
      )}

      <SectionHeader title="Chart" meta={history ? `${history.candles.length} bars · ${history.label}` : 'Yahoo candles'} />
      {series.length > 1 ? (
        <ChipRow>
          {series.map((s) => (
            <SelectableChip
              key={s.key}
              label={s.label}
              selected={s.key === overlaySeries?.key}
              onPress={() => {
                setChartKey(s.key);
                setSelectedFillId(null);
              }}
            />
          ))}
        </ChipRow>
      ) : null}
      <OrderChart
        series={overlaySeries}
        history={optionSeries ? null : history}
        timeframe={timeframe}
        onTimeframe={setTimeframe}
        loading={histBusy}
        selectedFillId={selectedFillId}
        onSelectFill={setSelectedFillId}
        onCancel={(id) => void cancel(id)}
        busy={busy}
      />

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
          <AnimatedPressable
            accessibilityRole="link"
            accessibilityLabel={`Yahoo Finance chart for ${option ? option.underlying : symbol}`}
            onPress={() =>
              void WebBrowser.openBrowserAsync(
                `https://finance.yahoo.com/chart/${encodeURIComponent(option ? option.underlying : symbol)}`,
              )
            }
            haptic="selection"
            pressScale={0.95}
            style={styles.yahooLink}
          >
            <ThemedText type="linkPrimary">Chart on Yahoo</ThemedText>
            <Ionicons name="open-outline" size={16} color={Palette.primary} />
          </AnimatedPressable>
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
                setChartKey(w.symbol);
                setSelectedFillId(null);
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
                    setChartKey(next);
                    setSelectedFillId(null);
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
                    setChartKey(next);
                    setSelectedFillId(null);
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
        <PrimaryButton label={busy ? 'Working…' : 'Simulate fill'} onPress={submit} loading={busy} />
      </Card>

      <SectionHeader title="Blotter" meta={book?.fills.length ? `${book.fills.length} ticket${book.fills.length === 1 ? '' : 's'} · newest first` : undefined} />
      {!book?.fills.length ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Fills show up here. Analysis unlocks on the next US session after a fill, not after 24 hours.
          </ThemedText>
        </Card>
      ) : (
        <FillsBlotter
          fills={book.fills}
          selectedId={selectedFillId}
          onSelect={(id) => {
            setSelectedFillId(id);
            const f = id ? book.fills.find((x) => x.id === id) : null;
            if (f) setChartKey(seriesKey(f));
          }}
          onCancel={(id) => void cancel(id)}
          busy={busy}
        />
      )}

      <SectionHeader title="Analysis overview" />
      {book?.analysis_available ? (
        <PrimaryButton label={analysis ? 'Refresh analysis' : 'Write the overview'} onPress={runAnalysis} loading={busy} />
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
  pickedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  yahooLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    height: Layout.controlHeight,
    borderWidth: 1.5,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    fontSize: 16,
    color: Palette.text,
    backgroundColor: Palette.surface,
  },
  error: { color: Palette.error, fontWeight: '600' },
});
