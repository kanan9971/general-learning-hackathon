import type { Move } from '@/api/client';

/** Display helpers only: every number shown here was computed by the backend. */
export function signed(v: number, unit: '%' | 'bp', digits = unit === 'bp' ? 1 : 2): string {
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}${unit}`;
}

export function level(m: Move): string {
  if (m.level_unit === '%') return `${m.level.toFixed(2)}%`;
  if (m.level_unit === 'bp') return `${m.level.toFixed(0)}bp`;
  if (m.level_unit === 'usd') return `$${m.level.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (m.level_unit === 'pts') return m.level.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return m.level.toFixed(4);
}

export function asOfLabel(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}
