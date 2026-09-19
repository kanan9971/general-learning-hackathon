/**
 * Paper classroom chart in the style of a TradingView pane: Yahoo OHLCV candles, a volume strip,
 * a right-hand price scale, a timeframe dropdown, and the order overlay (buy ▲ / sell ▼, avg cost,
 * last, working limits). Candle numbers come from GET /v1/markets/history — this file only lays them out.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { ChartCandle, ChartHistory, ChartTimeframe, DataMode, PaperBook, PaperFill, PaperLot, PaperSide } from '@/api/client';
import { AnimatedPressable } from '@/components/Motion';
import { Fonts, Palette, Radius } from '@/constants/theme';

export type OrderSeries = { key: string; label: string; fills: PaperFill[]; lot: PaperLot | null };

type Instrument = {
  symbol: string;
  option_right: 'call' | 'put' | null;
  option_strike: number | null;
  option_expiry: string | null;
};

export function seriesKey(i: Instrument): string {
  return i.option_right ? `${i.symbol} ${i.option_right === 'call' ? 'C' : 'P'}${i.option_strike} ${i.option_expiry}` : i.symbol;
}

export function buildSeries(book: PaperBook): OrderSeries[] {
  const map = new Map<string, OrderSeries>();
  const ensure = (i: Instrument) => {
    const key = seriesKey(i);
    let s = map.get(key);
    if (!s) {
      s = { key, label: key, fills: [], lot: null };
      map.set(key, s);
    }
    return s;
  };
  book.fills.forEach((f) => ensure(f).fills.push(f));
  book.lots.forEach((l) => {
    ensure(l).lot = l;
  });
  return Array.from(map.values()).sort((a, b) => lastTime(b) - lastTime(a));
}

const lastTime = (s: OrderSeries) => Math.max(0, ...s.fills.map((f) => Date.parse(f.filled_at) || 0));

export const SIDE: Record<PaperSide, { short: string; word: string; up: boolean }> = {
  buy: { short: 'B', word: 'Buy', up: true },
  cover: { short: 'C', word: 'Cover', up: true },
  sell: { short: 'S', word: 'Sell', up: false },
  short: { short: 'SS', word: 'Short', up: false },
};

export const sideColor = (side: PaperSide) => (SIDE[side].up ? Palette.success : Palette.error);

export const fmtPrice = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export const TIMEFRAME_OPTIONS: { id: ChartTimeframe; label: string }[] = [
  { id: '15m', label: '15m' },
  { id: '1h', label: '1 hour' },
  { id: '4h', label: '4 hours' },
  { id: '5d', label: '5 days' },
  { id: '1M', label: '1 month' },
  { id: '1Y', label: '1 Year' },
  { id: 'YTD', label: 'YTD' },
  { id: 'ALL', label: 'All time' },
];

const TV = {
  bg: '#131722',
  grid: 'rgba(255,255,255,0.06)',
  up: '#26a69a',
  down: '#ef5350',
  text: '#D1D4DC',
  muted: '#787B86',
  scale: '#1E222D',
  cross: 'rgba(255,255,255,0.28)',
};

const CANDLE_H = 248;
const VOL_H = 44;
const PLOT_H = CANDLE_H + VOL_H;
const SCALE_W = 70;
const PAD_T = 14;
const PAD_B = 8;
const PAD_L = 10;
const PAD_R = 8;
const MARK = 18;
const LABEL_H = 12;
const TAG_W = 100;
const MIN_SPAN_MS = 60 * 60 * 1000;
const MAX_BARS = 360;

type Placed = { fill: PaperFill; x: number; y: number };
type TagSide = 'left' | 'right';
type DrawnBar = ChartCandle & { x: number; bodyW: number };

function mergeBars(bars: ChartCandle[], maxN: number): ChartCandle[] {
  if (bars.length <= maxN) return bars;
  const bucket = Math.ceil(bars.length / maxN);
  const out: ChartCandle[] = [];
  for (let i = 0; i < bars.length; i += bucket) {
    const g = bars.slice(i, i + bucket);
    out.push({
      t: g[0].t,
      open: g[0].open,
      high: Math.max(...g.map((x) => x.high)),
      low: Math.min(...g.map((x) => x.low)),
      close: g[g.length - 1].close,
      volume: g.reduce((s, x) => s + x.volume, 0),
    });
  }
  return out;
}

function fmtVol(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

function fmtAxis(iso: string, timeframe: ChartTimeframe): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (timeframe === '15m' || timeframe === '1h' || timeframe === '4h' || timeframe === '5d') {
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (timeframe === 'ALL') return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
}

function DashedLine({ y, width, color, opacity = 1 }: { y: number; width: number; color: string; opacity?: number }) {
  const n = Math.max(1, Math.ceil(width / 9));
  return (
    <View style={[styles.hLine, { top: y, width, opacity }]}>
      {Array.from({ length: n }).map((_, i) => (
        <View key={i} style={[styles.dash, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

function ScaleTag({ y, text, bg, fg = Palette.white }: { y: number; text: string; bg: string; fg?: string }) {
  return (
    <View style={[styles.scaleTag, { top: y - 9, backgroundColor: bg }]}>
      <Text style={[styles.scaleTagText, { color: fg }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function TimeframeDropdown({
  value,
  onChange,
}: {
  value: ChartTimeframe;
  onChange: (id: ChartTimeframe) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = TIMEFRAME_OPTIONS.find((t) => t.id === value) ?? TIMEFRAME_OPTIONS[4];
  return (
    <View style={styles.tfWrap}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={`Chart timeframe, ${current.label}`}
        onPress={() => setOpen((o) => !o)}
        haptic="selection"
        pressScale={0.96}
        style={styles.tfBtn}
      >
        <Text style={styles.tfBtnText}>{current.label}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={TV.text} />
      </AnimatedPressable>
      {open ? (
        <View style={styles.tfMenu}>
          {TIMEFRAME_OPTIONS.map((opt) => {
            const on = opt.id === value;
            return (
              <AnimatedPressable
                key={opt.id}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                onPress={() => {
                  onChange(opt.id);
                  setOpen(false);
                }}
                haptic="selection"
                pressScale={0.98}
                style={[styles.tfItem, on && styles.tfItemOn]}
              >
                <Text style={[styles.tfItemText, on && styles.tfItemTextOn]}>{opt.label}</Text>
              </AnimatedPressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function OrderChart({
  series,
  history,
  timeframe,
  onTimeframe,
  loading,
  selectedFillId,
  onSelectFill,
  onCancel,
  busy,
}: {
  series: OrderSeries | null;
  history: ChartHistory | null;
  timeframe: ChartTimeframe;
  onTimeframe: (id: ChartTimeframe) => void;
  loading?: boolean;
  selectedFillId: string | null;
  onSelectFill: (id: string | null) => void;
  onCancel: (fillId: string) => void;
  busy?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const plotW = Math.max(0, width - SCALE_W);
  const candles = useMemo(() => mergeBars(history?.candles ?? [], MAX_BARS), [history]);

  useEffect(() => {
    setHover(null);
  }, [history?.symbol, history?.timeframe, timeframe]);

  const model = useMemo(() => {
    if (plotW <= 0) return null;
    const filled = (series?.fills ?? []).filter((f) => f.status === 'filled' && f.fill_price != null);
    const working = (series?.fills ?? []).filter((f) => f.status === 'working' && f.limit_price != null);
    const lot = series?.lot ?? null;
    const prices: number[] = [
      ...candles.flatMap((c) => [c.high, c.low]),
      ...filled.map((f) => f.fill_price as number),
      ...working.map((f) => f.limit_price as number),
    ];
    if (lot) {
      prices.push(lot.cost_basis);
      if (lot.market_price != null) prices.push(lot.market_price);
    }
    if (!prices.length) return { empty: true as const };

    let lo = Math.min(...prices);
    let hi = Math.max(...prices);
    if (hi - lo < Math.max(hi * 0.004, 0.02)) {
      const mid = (hi + lo) / 2;
      const half = Math.max(mid * 0.01, 0.25);
      lo = mid - half;
      hi = mid + half;
    } else {
      const pad = (hi - lo) * 0.08;
      lo -= pad;
      hi += pad;
    }
    const innerH = CANDLE_H - PAD_T - PAD_B;
    const y = (p: number) => PAD_T + (1 - (p - lo) / (hi - lo)) * innerH;

    const candleTimes = candles.map((c) => Date.parse(c.t)).filter((t) => !Number.isNaN(t));
    const fillTimes = (series?.fills ?? []).map((f) => Date.parse(f.filled_at)).filter((t) => !Number.isNaN(t));
    const now = Date.now();
    const tMin = candleTimes.length ? Math.min(...candleTimes) : fillTimes.length ? Math.min(...fillTimes) : now - MIN_SPAN_MS;
    const tMax = candleTimes.length ? Math.max(...candleTimes) : now;
    const t0 = Math.min(tMin, candleTimes.length ? tMin : now - MIN_SPAN_MS);
    const t1 = tMax <= t0 ? t0 + MIN_SPAN_MS : tMax;
    const innerW = Math.max(1, plotW - PAD_L - PAD_R);
    const x = (t: number) => PAD_L + ((t - t0) / (t1 - t0)) * innerW;

    const step = candles.length ? innerW / candles.length : innerW;
    const bodyW = Math.max(1.5, Math.min(9, step * 0.68));
    const drawn: DrawnBar[] = candles.map((c, i) => {
      const cx = candleTimes[i] ? x(candleTimes[i]) : PAD_L + (i + 0.5) * step;
      return { ...c, x: cx, bodyW };
    });

    const placed: Placed[] = [];
    [...filled]
      .sort((a, b) => Date.parse(a.filled_at) - Date.parse(b.filled_at))
      .forEach((fill) => {
        const ts = Date.parse(fill.filled_at);
        if (!Number.isNaN(ts) && candles.length && (ts < t0 - 60_000 || ts > t1 + 86_400_000)) return;
        let px = x(Number.isNaN(ts) ? t1 : Math.min(Math.max(ts, t0), t1));
        const py = y(fill.fill_price as number);
        let guard = 0;
        while (placed.some((p) => Math.abs(p.x - px) < MARK && Math.abs(p.y - py) < MARK) && guard++ < 40) px += MARK;
        px = Math.min(px, plotW - PAD_R + 8);
        placed.push({ fill, x: px, y: py });
      });

    const crowded = (lineY: number, side: TagSide) =>
      placed.some((p) => Math.abs(p.y - lineY) < MARK + LABEL_H && (side === 'right' ? p.x > plotW - TAG_W : p.x < TAG_W));
    const tagSide = (lineY: number): TagSide => (!crowded(lineY, 'right') ? 'right' : !crowded(lineY, 'left') ? 'left' : 'right');

    const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);
    const avgY = lot ? y(lot.cost_basis) : 0;
    const lastPrice = lot?.market_price ?? (candles.length ? candles[candles.length - 1].close : null);
    const volMax = Math.max(1, ...candles.map((c) => c.volume));
    const firstIso = candles[0]?.t ?? (fillTimes.length ? new Date(tMin).toISOString() : '');
    const lastIso = candles[candles.length - 1]?.t ?? '';

    return {
      empty: false as const,
      y,
      x,
      ticks,
      drawn,
      placed,
      working: working.map((f) => {
        const wy = y(f.limit_price as number);
        return { fill: f, y: wy, side: tagSide(wy) };
      }),
      avg: lot ? { y: avgY, lot, side: tagSide(avgY) } : null,
      last: lastPrice != null ? { y: y(lastPrice), price: lastPrice } : null,
      volMax,
      firstIso,
      lastIso,
    };
  }, [series, candles, plotW]);

  const selected = series?.fills.find((f) => f.id === selectedFillId) ?? null;
  const hoverBar = hover != null && model && !model.empty ? model.drawn[hover] : null;
  const lastBar = candles[candles.length - 1] ?? null;
  const read = hoverBar ?? lastBar;
  const base =
    hover != null && hover > 0
      ? candles[hover - 1]?.close
      : candles[0]?.open;
  const chg = read && base ? read.close - base : 0;
  const chgPct = read && base ? (chg / base) * 100 : 0;
  const up = chg >= 0;
  const isOption = Boolean(series?.fills[0]?.option_right || series?.lot?.option_right);

  const pickBar = (locationX: number) => {
    if (!model || model.empty || !model.drawn.length) return;
    let best = 0;
    let dist = Infinity;
    model.drawn.forEach((b, i) => {
      const d = Math.abs(b.x - locationX);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setHover(best);
    onSelectFill(null);
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <View style={styles.symbolRow}>
            <Text style={styles.symbol} numberOfLines={1}>
              {history?.symbol ?? series?.label ?? '—'}
            </Text>
            <Text style={styles.intervalTag}>{history?.interval ?? timeframe}</Text>
            {history?.data_mode ? <ModePill mode={history.data_mode} /> : null}
          </View>
          {read ? (
            <Text style={styles.ohlc} numberOfLines={2}>
              O {fmtPrice(read.open)}  H {fmtPrice(read.high)}  L {fmtPrice(read.low)}  C {fmtPrice(read.close)}
              {base ? (
                <Text style={{ color: up ? TV.up : TV.down }}>
                  {`   ${up ? '+' : ''}${fmtPrice(chg)} (${up ? '+' : ''}${chgPct.toFixed(2)}%)`}
                </Text>
              ) : null}
            </Text>
          ) : series?.lot ? (
            <Text style={styles.posText}>
              {fmtQty(series.lot.quantity)} @ {fmtPrice(series.lot.cost_basis)} avg
              {series.lot.market_price != null ? ` · last ${fmtPrice(series.lot.market_price)}` : ''}
            </Text>
          ) : (
            <Text style={styles.posText}>{isOption ? 'Option marks · equity candles stay on the share series' : 'Yahoo candles'}</Text>
          )}
        </View>
        <View style={styles.headRight}>
          {series?.lot?.unrealized_pct != null ? (
            <View style={[styles.pnlPill, { backgroundColor: series.lot.unrealized_pct >= 0 ? Palette.softSuccess : Palette.softError }]}>
              <Text style={[styles.pnlText, { color: series.lot.unrealized_pct >= 0 ? Palette.success : Palette.error }]}>
                {series.lot.unrealized_pct >= 0 ? '+' : ''}
                {series.lot.unrealized_pct.toFixed(2)}%
              </Text>
            </View>
          ) : null}
          <TimeframeDropdown value={timeframe} onChange={onTimeframe} />
        </View>
      </View>

      <View style={styles.plotWrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View
          accessibilityLabel="Price chart"
          style={[styles.plot, { height: PLOT_H }]}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => pickBar(e.nativeEvent.locationX)}
        >
          <View style={[styles.volPane, { top: CANDLE_H }]} />

          {Array.from({ length: 5 }, (_, i) => {
            const top = model && !model.empty ? model.y(model.ticks[i]) : PAD_T + (CANDLE_H - PAD_T - PAD_B) * (1 - i / 4);
            return <View key={`g${i}`} style={[styles.grid, { top }]} />;
          })}

          {model && !model.empty ? (
            <>
              {loading ? (
                <View style={styles.loadingDot}>
                  <ActivityIndicator color={TV.up} size="small" />
                </View>
              ) : null}
              {model.drawn.map((bar, i) => {
                const bull = bar.close >= bar.open;
                const color = bull ? TV.up : TV.down;
                const yH = model.y(bar.high);
                const yL = model.y(bar.low);
                const yO = model.y(bar.open);
                const yC = model.y(bar.close);
                const top = Math.min(yO, yC);
                const h = Math.max(1, Math.abs(yC - yO));
                const volH = Math.max(1, (bar.volume / model.volMax) * (VOL_H - 6));
                const on = hover === i;
                return (
                  <View key={`${bar.t}-${i}`} pointerEvents="none">
                    <View
                      style={[
                        styles.wick,
                        { left: bar.x - 0.5, top: yH, height: Math.max(1, yL - yH), backgroundColor: color, opacity: on ? 1 : 0.9 },
                      ]}
                    />
                    <View
                      style={[
                        styles.body,
                        {
                          left: bar.x - bar.bodyW / 2,
                          top,
                          width: bar.bodyW,
                          height: h,
                          backgroundColor: bull ? color : TV.bg,
                          borderColor: color,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.volBar,
                        {
                          left: bar.x - bar.bodyW / 2,
                          width: bar.bodyW,
                          height: volH,
                          top: PLOT_H - volH - 2,
                          backgroundColor: color,
                        },
                      ]}
                    />
                    {on ? <View style={[styles.crossV, { left: bar.x }]} /> : null}
                  </View>
                );
              })}

              {model.last ? <View style={[styles.lastLine, { top: model.last.y }]} /> : null}

              {model.avg ? (
                <>
                  <DashedLine y={model.avg.y} width={plotW} color="#5B8FD4" />
                  <View style={[styles.lineTag, model.avg.side === 'right' ? styles.tagRight : styles.tagLeft, { top: model.avg.y - 10, backgroundColor: '#5B8FD4' }]}>
                    <Text style={styles.lineTagText}>
                      {fmtQty(model.avg.lot.quantity)} · avg
                    </Text>
                  </View>
                </>
              ) : null}

              {model.working.map(({ fill, y, side }) => (
                <View key={fill.id}>
                  <DashedLine y={y} width={plotW} color={Palette.warning} opacity={0.9} />
                  <View style={[styles.lineTag, styles.workingTag, side === 'right' ? styles.tagRight : styles.tagLeft, { top: y - 10 }]}>
                    <Text style={styles.lineTagText}>
                      {fill.ticket_kind === 'stop' ? 'STP' : 'LMT'} {SIDE[fill.side].short} {fmtQty(fill.quantity)}
                    </Text>
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel ${fill.side} ${fill.quantity} ${fill.symbol}`}
                      onPress={() => onCancel(fill.id)}
                      disabled={busy}
                      haptic="light"
                      pressScale={0.85}
                      hitSlop={8}
                      style={styles.cancelX}
                    >
                      <Ionicons name="close" size={12} color={Palette.warning} />
                    </AnimatedPressable>
                  </View>
                </View>
              ))}

              {model.placed.map(({ fill, x, y }) => {
                const s = SIDE[fill.side];
                const c = sideColor(fill.side);
                const on = fill.id === selectedFillId;
                const dim = selectedFillId != null && !on;
                return (
                  <AnimatedPressable
                    key={fill.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${s.word} ${fmtQty(fill.quantity)} at ${fmtPrice(fill.fill_price ?? 0)}`}
                    onPress={() => onSelectFill(on ? null : fill.id)}
                    haptic="selection"
                    pressScale={0.9}
                    hitSlop={6}
                    style={[
                      styles.marker,
                      { left: x - MARK / 2, top: s.up ? y + 1 : y - MARK - LABEL_H - 1, opacity: dim ? 0.45 : 1 },
                      !s.up && { flexDirection: 'column-reverse' },
                    ]}
                  >
                    {on ? <View style={[styles.ring, { borderColor: c }, s.up ? { top: -5 } : { bottom: -5 }]} /> : null}
                    <Ionicons name={s.up ? 'caret-up' : 'caret-down'} size={MARK} color={c} />
                    <Text style={[styles.markerText, { color: c }]}>
                      {s.short}
                      {fmtQty(fill.quantity)}
                    </Text>
                  </AnimatedPressable>
                );
              })}
            </>
          ) : (
            <View style={styles.emptyWrap}>
              {loading ? <ActivityIndicator color={TV.up} /> : <Ionicons name="pulse-outline" size={22} color={TV.muted} />}
              <Text style={styles.emptyText}>
                {loading
                  ? 'Loading Yahoo candles…'
                  : isOption
                    ? 'Listed-option marks are a formula, not a Yahoo chain.\nOpen the share series to see candles.'
                    : 'No Yahoo candles for this name yet.'}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.scale, { height: PLOT_H }]}>
          {model && !model.empty ? (
            <>
              {model.ticks.map((tk, i) => (
                <Text key={`t${i}`} style={[styles.tick, { top: model.y(tk) - 7 }]} numberOfLines={1}>
                  {fmtPrice(tk)}
                </Text>
              ))}
              {model.avg && !(model.last && Math.abs(model.last.y - model.avg.y) < 12) ? (
                <ScaleTag y={model.avg.y} text={fmtPrice(model.avg.lot.cost_basis)} bg="#5B8FD4" />
              ) : null}
              {model.working.map(({ fill, y }) => (
                <ScaleTag key={fill.id} y={y} text={fmtPrice(fill.limit_price as number)} bg={Palette.warning} />
              ))}
              {model.last ? <ScaleTag y={model.last.y} text={fmtPrice(model.last.price)} bg={TV.up} /> : null}
            </>
          ) : null}
        </View>
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisText}>{model && !model.empty && model.firstIso ? fmtAxis(model.firstIso, timeframe) : ''}</Text>
        {read ? (
          <Text style={styles.axisText}>
            {fmtAxis(read.t, timeframe)}
            {read.volume ? ` · vol ${fmtVol(read.volume)}` : ''}
          </Text>
        ) : (
          <Text style={styles.axisText}>{model && !model.empty && model.lastIso ? fmtAxis(model.lastIso, timeframe) : ''}</Text>
        )}
      </View>

      {history?.note ? (
        <Text style={styles.note}>{history.note}</Text>
      ) : null}

      {selected ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          onPress={() => onSelectFill(null)}
          haptic="selection"
          pressScale={0.99}
          style={styles.detail}
        >
          <View style={[styles.sidePill, { backgroundColor: sideColor(selected.side) }]}>
            <Text style={styles.sidePillText}>{SIDE[selected.side].word}</Text>
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text style={styles.detailMain}>
              {fmtQty(selected.quantity)} {selected.symbol}
              {selected.fill_price != null ? ` @ ${fmtPrice(selected.fill_price)}` : selected.limit_price != null ? ` ${selected.ticket_kind} ${fmtPrice(selected.limit_price)}` : ''}
            </Text>
            <Text style={styles.detailMeta}>
              {fmtDay(selected.filled_at)} {fmtTime(selected.filled_at)} · {selected.ticket_kind}
              {selected.status !== 'filled' ? ` · ${selected.status}` : ''}
            </Text>
          </View>
          <Ionicons name="close" size={16} color={Palette.subtle} />
        </AnimatedPressable>
      ) : (
        <View style={styles.legend}>
          <Legend swatch={TV.up} label="Up" />
          <Legend swatch={TV.down} label="Down" />
          <Legend icon="caret-up" color={Palette.success} label="Buy" />
          <Legend icon="caret-down" color={Palette.error} label="Sell" />
          <Legend swatch="#5B8FD4" dashed label="Avg" />
          <Legend swatch={TV.up} label="Last" />
        </View>
      )}
    </View>
  );
}

function ModePill({ mode }: { mode: DataMode }) {
  const label = mode === 'live' ? 'LIVE' : mode === 'cache' ? 'CACHE' : 'DEMO';
  return (
    <View style={styles.modePill}>
      <Text style={styles.modePillText}>{label}</Text>
    </View>
  );
}

function Legend({
  icon,
  swatch,
  dashed,
  color,
  label,
}: {
  icon?: 'caret-up' | 'caret-down';
  swatch?: string;
  dashed?: boolean;
  color?: string;
  label: string;
}) {
  return (
    <View style={styles.legendItem}>
      {icon ? (
        <Ionicons name={icon} size={12} color={color} />
      ) : (
        <View style={styles.legendSwatch}>
          {dashed ? (
            <>
              <View style={[styles.legendDash, { backgroundColor: swatch }]} />
              <View style={[styles.legendDash, { backgroundColor: swatch }]} />
            </>
          ) : (
            <View style={[styles.legendSolid, { backgroundColor: swatch }]} />
          )}
        </View>
      )}
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    overflow: 'visible',
    zIndex: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 4,
  },
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  symbol: { color: Palette.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  intervalTag: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Palette.subtle,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  modePill: {
    backgroundColor: Palette.surfaceSunken,
    borderRadius: Radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  modePillText: { fontFamily: Fonts.mono, fontSize: 9, color: Palette.muted, letterSpacing: 0.8, fontWeight: '500' },
  ohlc: { fontFamily: Fonts.mono, color: Palette.muted, fontSize: 11, fontVariant: ['tabular-nums'] },
  posText: { color: Palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pnlPill: { borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pnlText: { fontFamily: Fonts.mono, fontSize: 12, fontWeight: '500', fontVariant: ['tabular-nums'] },

  tfWrap: { position: 'relative', zIndex: 8 },
  tfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TV.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    minWidth: 96,
    justifyContent: 'space-between',
  },
  tfBtnText: { fontFamily: Fonts.mono, color: TV.text, fontSize: 12, fontWeight: '500' },
  tfMenu: {
    position: 'absolute',
    top: 36,
    right: 0,
    minWidth: 132,
    backgroundColor: '#1E222D',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 4,
    zIndex: 20,
    elevation: 8,
  },
  tfItem: { paddingHorizontal: 12, paddingVertical: 8 },
  tfItemOn: { backgroundColor: 'rgba(38,166,154,0.16)' },
  tfItemText: { fontFamily: Fonts.mono, color: TV.text, fontSize: 12 },
  tfItemTextOn: { color: TV.up, fontWeight: '600' },

  plotWrap: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Palette.border,
    backgroundColor: TV.bg,
    overflow: 'hidden',
  },
  plot: { flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: TV.bg },
  volPane: { position: 'absolute', left: 0, right: 0, height: VOL_H, backgroundColor: '#0F131B', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  grid: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: TV.grid },
  wick: { position: 'absolute', width: 1, borderRadius: 1 },
  body: { position: 'absolute', borderWidth: 1, borderRadius: 0.5 },
  volBar: { position: 'absolute', opacity: 0.38, borderRadius: 0.5 },
  crossV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: TV.cross },
  lastLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: TV.up, opacity: 0.7 },
  hLine: { position: 'absolute', left: 0, height: 1, flexDirection: 'row', gap: 4, overflow: 'hidden' },
  dash: { width: 5, height: 1, borderRadius: 1 },
  workingTag: { backgroundColor: Palette.warning, flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineTag: {
    position: 'absolute',
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 5,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  tagRight: { right: 8 },
  tagLeft: { left: 8 },
  lineTagText: { fontFamily: Fonts.mono, color: Palette.white, fontSize: 10, fontWeight: '500', letterSpacing: 0.4, fontVariant: ['tabular-nums'] },
  cancelX: { width: 16, height: 16, borderRadius: 8, backgroundColor: Palette.white, alignItems: 'center', justifyContent: 'center' },

  marker: { position: 'absolute', width: MARK, height: MARK + LABEL_H, alignItems: 'center', zIndex: 3 },
  markerText: { fontFamily: Fonts.mono, fontSize: 9.5, lineHeight: LABEL_H, fontWeight: '500', fontVariant: ['tabular-nums'] },
  ring: { position: 'absolute', width: MARK + 10, height: MARK + 10, borderRadius: (MARK + 10) / 2, borderWidth: 2, opacity: 0.55 },

  scale: { width: SCALE_W, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.08)', backgroundColor: TV.scale, position: 'relative' },
  tick: { position: 'absolute', right: 8, fontFamily: Fonts.mono, fontSize: 10.5, color: TV.muted, fontVariant: ['tabular-nums'] },
  scaleTag: { position: 'absolute', right: 4, left: 4, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  scaleTagText: { fontFamily: Fonts.mono, fontSize: 10.5, fontWeight: '500', fontVariant: ['tabular-nums'] },

  axis: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6, backgroundColor: TV.bg },
  axisText: { fontFamily: Fonts.mono, color: TV.muted, fontSize: 10.5, fontVariant: ['tabular-nums'] },
  note: { color: Palette.muted, fontSize: 12, lineHeight: 16, paddingHorizontal: 14, paddingTop: 8 },

  emptyWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 },
  loadingDot: { position: 'absolute', top: 8, left: 8, zIndex: 4 },
  emptyText: { color: TV.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { flexDirection: 'row', gap: 2, width: 14, alignItems: 'center' },
  legendDash: { width: 6, height: 2, borderRadius: 1 },
  legendSolid: { width: 14, height: 2, borderRadius: 1 },
  legendText: { color: Palette.muted, fontSize: 11, fontWeight: '600' },

  detail: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Palette.softInfo },
  sidePill: { borderRadius: Radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  sidePillText: { color: Palette.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  detailMain: { color: Palette.text, fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  detailMeta: { color: Palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
});
