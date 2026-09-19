/**
 * IBKR-style tables for the paper classroom: a Positions table (qty · avg · last · P&L) and a
 * trade Blotter (every ticket as one row, side-coloured, newest first). Rows are tappable so the
 * order chart and the blotter highlight the same fill. Numbers are the backend's; we only format.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import type { PaperFill, PaperLot } from '@/api/client';
import { AnimatedPressable } from '@/components/Motion';
import { SIDE, fmtDay, fmtPrice, fmtQty, fmtTime, seriesKey, sideColor } from '@/components/OrderChart';
import { Fonts, Palette, Radius } from '@/constants/theme';

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// ---- Positions ----

export function PositionsTable({ lots, onOpen }: { lots: PaperLot[]; onOpen?: (lot: PaperLot) => void }) {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.th, { flex: 1.4 }]}>Name</Text>
        <Text style={[styles.th, styles.num, { flex: 0.6 }]}>Qty</Text>
        <Text style={[styles.th, styles.num, { flex: 0.9 }]}>Avg</Text>
        <Text style={[styles.th, styles.num, { flex: 0.9 }]}>Last</Text>
        <Text style={[styles.th, styles.num, { flex: 1 }]}>P&amp;L</Text>
      </View>
      {lots.map((lot, i) => {
        const pnl = lot.unrealized_pct;
        const c = pnl == null ? Palette.muted : pnl > 0 ? Palette.success : pnl < 0 ? Palette.error : Palette.muted;
        const key = seriesKey(lot);
        return (
          <AnimatedPressable
            key={lot.id}
            accessibilityRole="button"
            accessibilityLabel={`${key}, ${fmtQty(lot.quantity)} at ${fmtPrice(lot.cost_basis)} average`}
            onPress={() => onOpen?.(lot)}
            haptic="selection"
            pressScale={0.99}
            style={({ pressed, hovered }) => [styles.row, i > 0 && styles.divider, (pressed || hovered) && styles.rowActive]}
          >
            <View style={{ flex: 1.4, gap: 1 }}>
              <Text style={styles.symbol} numberOfLines={1}>
                {lot.symbol}
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {lot.kind === 'option' ? `${lot.option_right} ${lot.option_strike} · ${lot.option_expiry}` : lot.market_value != null ? usd(lot.market_value) : 'no mark'}
              </Text>
            </View>
            <Text style={[styles.td, styles.num, { flex: 0.6 }]}>{fmtQty(lot.quantity)}</Text>
            <Text style={[styles.td, styles.num, { flex: 0.9 }]}>{fmtPrice(lot.cost_basis)}</Text>
            <Text style={[styles.td, styles.num, { flex: 0.9 }]}>{lot.market_price != null ? fmtPrice(lot.market_price) : '—'}</Text>
            <View style={{ flex: 1, alignItems: 'flex-end', gap: 3 }}>
              <Text style={[styles.td, styles.num, { color: c, fontWeight: '700' }]}>
                {pnl == null ? '—' : `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}%`}
              </Text>
              <PnlBar pct={pnl} color={c} />
            </View>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

/** A tiny centred bar: fills right for gains, left for losses. Scaled to ±5% so small moves still read. */
function PnlBar({ pct, color }: { pct: number | null; color: string }) {
  const w = pct == null ? 0 : Math.min(1, Math.abs(pct) / 5) * 50;
  return (
    <View style={styles.pnlTrack}>
      <View style={styles.pnlMid} />
      {pct != null && pct !== 0 ? (
        <View style={[styles.pnlFill, { backgroundColor: color, width: `${w}%` }, pct > 0 ? { left: '50%' } : { right: '50%' }]} />
      ) : null}
    </View>
  );
}

// ---- Blotter ----

export function FillsBlotter({
  fills,
  selectedId,
  onSelect,
  onCancel,
  busy,
}: {
  fills: PaperFill[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCancel: (id: string) => void;
  busy?: boolean;
}) {
  const sorted = [...fills].sort((a, b) => Date.parse(b.filled_at) - Date.parse(a.filled_at));
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headRow]}>
        <Text style={[styles.th, { width: 40 }]}>Side</Text>
        <Text style={[styles.th, { flex: 1.3 }]}>Order</Text>
        <Text style={[styles.th, styles.num, { flex: 0.9 }]}>Price</Text>
        <Text style={[styles.th, styles.num, { flex: 1 }]}>Time</Text>
      </View>
      {sorted.map((f, i) => {
        const s = SIDE[f.side];
        const c = sideColor(f.side);
        const on = f.id === selectedId;
        const working = f.status === 'working';
        const cancelled = f.status === 'cancelled';
        // The row is one button; a working order's Cancel is a sibling button, never nested inside it.
        return (
          <View key={f.id} style={[styles.rowWrap, i > 0 && styles.divider, on && styles.rowOn, cancelled && { opacity: 0.55 }]}>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${s.word} ${fmtQty(f.quantity)} ${f.symbol}${f.fill_price != null ? ` at ${fmtPrice(f.fill_price)}` : ''}, ${f.status}`}
              onPress={() => onSelect(on ? null : f.id)}
              haptic="selection"
              pressScale={0.99}
              style={({ pressed, hovered }) => [styles.row, { flex: 1 }, (pressed || hovered) && styles.rowActive]}
            >
              <View style={{ width: 40 }}>
                <View style={[styles.sideBadge, { backgroundColor: cancelled ? Palette.subtle : c }]}>
                  <Text style={styles.sideBadgeText}>{s.short}</Text>
                </View>
              </View>
              <View style={{ flex: 1.3, gap: 1 }}>
                <Text style={styles.symbol} numberOfLines={1}>
                  {fmtQty(f.quantity)} {f.symbol}
                  {f.instrument_kind === 'option' ? ` ${f.option_right?.[0].toUpperCase()}${f.option_strike}` : ''}
                </Text>
                <Text style={[styles.sub, working && { color: Palette.warning, fontWeight: '700' }]} numberOfLines={1}>
                  {f.ticket_kind}
                  {working ? ' · working' : cancelled ? ' · cancelled' : ''}
                </Text>
              </View>
              <Text style={[styles.td, styles.num, { flex: 0.9 }]}>
                {f.fill_price != null ? fmtPrice(f.fill_price) : f.limit_price != null ? fmtPrice(f.limit_price) : '—'}
              </Text>
              {!working ? (
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[styles.td, styles.num, { fontSize: 12 }]}>{fmtTime(f.filled_at)}</Text>
                  <Text style={[styles.sub, styles.num]}>{fmtDay(f.filled_at)}</Text>
                </View>
              ) : null}
            </AnimatedPressable>
            {working ? (
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={`Cancel ${s.word} ${fmtQty(f.quantity)} ${f.symbol}`}
                onPress={() => onCancel(f.id)}
                disabled={busy}
                haptic="light"
                pressScale={0.9}
                style={({ hovered }) => [styles.cancel, hovered && { backgroundColor: Palette.softError }]}
              >
                <Ionicons name="close" size={12} color={Palette.error} />
                <Text style={styles.cancelText}>Cancel</Text>
              </AnimatedPressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, minHeight: 52 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingRight: 10 },
  headRow: { paddingVertical: 8, minHeight: 0, backgroundColor: Palette.surfaceSunken, borderBottomWidth: 1, borderBottomColor: Palette.border },
  divider: { borderTopWidth: 1, borderTopColor: Palette.border },
  rowActive: { backgroundColor: 'rgba(28, 25, 23, 0.025)' },
  rowOn: { backgroundColor: Palette.softInfo },
  th: { fontFamily: Fonts.mono, color: Palette.subtle, fontSize: 10, fontWeight: '500', letterSpacing: 0.8, textTransform: 'uppercase' },
  td: { color: Palette.text, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  num: { textAlign: 'right' },
  symbol: { color: Palette.text, fontSize: 14, fontWeight: '800', letterSpacing: -0.2 },
  sub: { color: Palette.muted, fontSize: 11, fontVariant: ['tabular-nums'] },
  pnlTrack: { width: 56, height: 4, borderRadius: 2, backgroundColor: Palette.surfaceSunken, position: 'relative', overflow: 'hidden' },
  pnlMid: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: Palette.border },
  pnlFill: { position: 'absolute', top: 0, bottom: 0, borderRadius: 2 },
  sideBadge: { width: 30, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  sideBadgeText: { color: Palette.white, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: Radius.pill, borderWidth: 1, borderColor: Palette.softError },
  cancelText: { color: Palette.error, fontSize: 11, fontWeight: '700' },
});
