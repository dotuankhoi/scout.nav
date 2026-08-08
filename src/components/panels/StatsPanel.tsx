/**
 * Statistics panel: run metrics, frontier-size timeline (Recharts) and,
 * in compare mode, a live A-vs-B comparison.
 */

import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RunResult } from '@/algorithms/types';
import { ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { fmtBytes, fmtInt, fmtMs, fmtNum, fmtPercent } from '@/utils/format';

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/50 px-3 py-2" title={hint}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

interface MetricRow {
  label: string;
  value: (r: RunResult) => number | null;
  format: (v: number) => string;
  /** Lower is better (for the winner highlight). */
  lowerBetter: boolean;
}

const COMPARE_METRICS: MetricRow[] = [
  { label: 'Runtime', value: (r) => r.stats.timeMs, format: fmtMs, lowerBetter: true },
  { label: 'Nodes expanded', value: (r) => r.stats.nodesExpanded, format: fmtInt, lowerBetter: true },
  { label: 'Nodes generated', value: (r) => r.stats.nodesGenerated, format: fmtInt, lowerBetter: true },
  { label: 'Path length', value: (r) => r.stats.pathLength, format: (v) => fmtNum(v), lowerBetter: true },
  { label: 'Path cost', value: (r) => r.stats.pathCost, format: (v) => fmtNum(v), lowerBetter: true },
  { label: 'Optimality', value: (r) => r.stats.optimality, format: fmtPercent, lowerBetter: false },
  { label: 'Peak open / tree', value: (r) => r.stats.maxOpenSize, format: fmtInt, lowerBetter: true },
  { label: 'Memory (est.)', value: (r) => r.stats.memoryBytes, format: fmtBytes, lowerBetter: true },
];

function FrontierChart({ a, b }: { a: RunResult | null; b: RunResult | null }) {
  const data = useMemo(() => {
    const fa = a?.stats.frontier ?? [];
    const fb = b?.stats.frontier ?? [];
    const len = Math.max(fa.length, fb.length);
    if (len === 0) return [];
    const samples = Math.min(len, 160);
    const out: Array<{ i: number; A?: number; B?: number }> = [];
    for (let s = 0; s < samples; s++) {
      const i = Math.floor((s / (samples - 1 || 1)) * (len - 1));
      const row: { i: number; A?: number; B?: number } = { i };
      if (i < fa.length) row.A = fa[i];
      if (i < fb.length) row.B = fb[i];
      out.push(row);
    }
    return out;
  }, [a, b]);

  if (data.length === 0) return null;
  const colorA = a ? ALGORITHM_META[a.algorithm].color : '#888';
  const colorB = b ? ALGORITHM_META[b.algorithm].color : '#888';

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Frontier size over expansions
      </div>
      <div className="h-36 rounded-xl border border-border bg-secondary/40 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid strokeOpacity={0.12} vertical={false} />
            <XAxis dataKey="i" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <ChartTooltip
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 11,
              }}
            />
            {a && <Line type="monotone" dataKey="A" stroke={colorA} dot={false} strokeWidth={2} isAnimationActive={false} />}
            {b && <Line type="monotone" dataKey="B" stroke={colorB} dot={false} strokeWidth={2} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function StatsPanel() {
  const runs = useAppStore((s) => s.runs);
  const compareMode = useAppStore((s) => s.compareMode);
  const runError = useAppStore((s) => s.runError);
  const a = runs.A;
  const b = compareMode ? runs.B : null;

  if (runError) {
    return <div className="rounded-xl border border-red-400/50 bg-red-500/10 p-3 text-xs">{runError}</div>;
  }
  if (!a && !b) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
        Run the planner to see statistics.
      </div>
    );
  }

  if (!compareMode && a) {
    const s = a.stats;
    return (
      <div className="space-y-3">
        <Badge color={ALGORITHM_META[a.algorithm].color}>{ALGORITHM_META[a.algorithm].name}</Badge>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Runtime" value={fmtMs(s.timeMs)} hint="Wall-clock planning time in the worker" />
          <StatTile label="Nodes expanded" value={fmtInt(s.nodesExpanded)} />
          <StatTile label="Nodes generated" value={fmtInt(s.nodesGenerated)} />
          <StatTile label="Peak open / tree" value={fmtInt(s.maxOpenSize)} />
          <StatTile label="Path length" value={s.pathLength !== null ? fmtNum(s.pathLength) : '—'} hint="Geometric length, in cells" />
          <StatTile label="Path cost" value={s.pathCost !== null ? fmtNum(s.pathCost) : '—'} />
          <StatTile
            label="Optimality"
            value={s.optimality !== null ? fmtPercent(s.optimality) : '—'}
            hint="Optimal grid cost ÷ this path's cost (100% = provably optimal)"
          />
          <StatTile label="Memory (est.)" value={fmtBytes(s.memoryBytes)} hint="Estimated peak working set" />
          {s.iterations !== null && <StatTile label="Iterations" value={fmtInt(s.iterations)} />}
        </div>
        {!s.pathFound && (
          <div className="rounded-xl border border-red-400/50 bg-red-500/10 p-2.5 text-xs">
            No path found — the goal appears unreachable.
          </div>
        )}
        <FrontierChart a={a} b={null} />
      </div>
    );
  }

  // Compare mode.
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {a && <Badge color={ALGORITHM_META[a.algorithm].color}>A · {ALGORITHM_META[a.algorithm].shortName}</Badge>}
        <span className="text-[10px] text-muted-foreground">vs</span>
        {b && <Badge color={ALGORITHM_META[b.algorithm].color}>B · {ALGORITHM_META[b.algorithm].shortName}</Badge>}
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-secondary/70 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2.5 py-1.5 text-left font-semibold">Metric</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">A</th>
              <th className="px-2.5 py-1.5 text-right font-semibold">B</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_METRICS.map((m) => {
              const va = a ? m.value(a) : null;
              const vb = b ? m.value(b) : null;
              const aWins =
                va !== null && vb !== null && va !== vb
                  ? m.lowerBetter
                    ? va < vb
                    : va > vb
                  : null;
              const cell = (v: number | null, wins: boolean | null) => (
                <td
                  className={`px-2.5 py-1.5 text-right font-mono ${
                    wins === true ? 'font-bold text-emerald-500 dark:text-emerald-400' : ''
                  }`}
                >
                  {v !== null ? m.format(v) : '—'}
                </td>
              );
              return (
                <tr key={m.label} className="border-t border-border">
                  <td className="px-2.5 py-1.5 text-muted-foreground">{m.label}</td>
                  {cell(va, aWins)}
                  {cell(vb, aWins === null ? null : !aWins)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <FrontierChart a={a} b={b} />
    </div>
  );
}
