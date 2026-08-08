/**
 * Benchmark Lab — sweep every selected planner across N generated worlds
 * and produce aggregate metrics, charts and a data-backed recommendation.
 */

import { useRef, useState } from 'react';
import { FlaskConical, Loader2, Play } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell as ReCell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import type { AlgorithmId } from '@/types';
import { ALGORITHM_LIST, ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import {
  runBenchmark,
  type BenchmarkEnv,
  type BenchmarkResult,
} from '@/utils/benchmark';
import { fmtBytes, fmtInt, fmtMs, fmtNum, fmtPercent } from '@/utils/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { WithTooltip } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const ENVIRONMENTS: Array<{ id: BenchmarkEnv; label: string }> = [
  { id: 'random', label: 'Random fields' },
  { id: 'warehouse', label: '📦 Warehouse' },
  { id: 'mars', label: '🔴 Mars terrain' },
  { id: 'rescue', label: '🚨 Search & rescue' },
  { id: 'hospital', label: '🏥 Hospital' },
  { id: 'city', label: '🌊 City flood' },
  { id: 'maze', label: '🌀 Mazes' },
];

function MetricChart({
  title,
  result,
  value,
  format,
}: {
  title: string;
  result: BenchmarkResult;
  value: (a: BenchmarkResult['aggregates'][number]) => number;
  format: (v: number) => string;
}) {
  const data = result.aggregates.map((a) => ({
    name: ALGORITHM_META[a.algorithm].shortName,
    value: value(a),
    color: ALGORITHM_META[a.algorithm].color,
  }));
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="h-36 rounded-xl border border-border bg-secondary/40 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid strokeOpacity={0.12} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => format(v)}
              width={52}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <ReCell key={d.name} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function BenchmarkDialog() {
  const options = useAppStore((s) => s.options);
  const [open, setOpen] = useState(false);
  const [env, setEnv] = useState<BenchmarkEnv>('warehouse');
  const [maps, setMaps] = useState(25);
  const [density, setDensity] = useState(0.3);
  const [selected, setSelected] = useState<AlgorithmId[]>([
    'astar',
    'dijkstra',
    'thetastar',
    'dstar',
    'rrt',
    'rrtstar',
  ]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 0]);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const cancelRef = useRef(false);

  const toggle = (id: AlgorithmId) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );

  const start = async () => {
    if (selected.length === 0) return;
    cancelRef.current = false;
    setRunning(true);
    setResult(null);
    setProgress([0, maps * selected.length]);
    try {
      const res = await runBenchmark(
        { env, maps, density, algorithms: selected, options },
        (done, total) => setProgress([done, total]),
        () => cancelRef.current,
      );
      setResult(res);
    } catch {
      // cancelled — leave previous state
    } finally {
      setRunning(false);
    }
  };

  const onOpenChange = (v: boolean) => {
    if (!v) cancelRef.current = true;
    setOpen(v);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <WithTooltip label="Benchmark Lab — compare algorithms across many maps">
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Benchmark Lab">
            <FlaskConical />
          </Button>
        </DialogTrigger>
      </WithTooltip>
      <DialogContent className="max-w-3xl">
        <DialogTitle>Benchmark Lab</DialogTitle>
        <DialogDescription>
          Which algorithm is right for your environment? Sweep the selected planners across
          freshly generated worlds and get aggregate numbers plus a recommendation.
        </DialogDescription>

        {/* Config */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Environment
            </div>
            <Select value={env} onValueChange={(v) => setEnv(v as BenchmarkEnv)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENVIRONMENTS.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Maps
            </div>
            <Select value={String(maps)} onValueChange={(v) => setMaps(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {env === 'random' && (
            <div className="w-40">
              <div className="mb-1 flex justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span>Density</span>
                <span>{Math.round(density * 100)}%</span>
              </div>
              <Slider
                value={[density]}
                min={0.1}
                max={0.45}
                step={0.05}
                onValueChange={([v]) => setDensity(v)}
              />
            </div>
          )}
          <Button onClick={() => void start()} disabled={running || selected.length === 0}>
            {running ? <Loader2 className="animate-spin" /> : <Play />}
            {running ? `${progress[0]} / ${progress[1]}` : 'Run benchmark'}
          </Button>
        </div>

        {/* Algorithm toggles */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {ALGORITHM_LIST.map((m) => {
            const active = selected.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all',
                  active ? 'opacity-100' : 'opacity-40 grayscale',
                )}
                style={{
                  color: m.color,
                  borderColor: `color-mix(in srgb, ${m.color} 40%, transparent)`,
                  background: `color-mix(in srgb, ${m.color} 12%, transparent)`,
                }}
              >
                {m.shortName}
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        {running && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress[1] > 0 ? (progress[0] / progress[1]) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-4 max-h-[46vh] space-y-4 overflow-y-auto pr-1">
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-secondary/70 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2.5 py-1.5 text-left font-semibold">Algorithm</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Success</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Avg time</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Avg nodes</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Avg length</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Optimality</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Memory</th>
                  </tr>
                </thead>
                <tbody>
                  {result.aggregates.map((a) => {
                    const meta = ALGORITHM_META[a.algorithm];
                    return (
                      <tr key={a.algorithm} className="border-t border-border">
                        <td className="px-2.5 py-1.5 font-semibold" style={{ color: meta.color }}>
                          {meta.shortName}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {fmtPercent(a.successRate)}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtMs(a.avgTimeMs)}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtInt(Math.round(a.avgNodes))}</td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {a.avgPathLength !== null ? fmtNum(a.avgPathLength, 1) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">
                          {a.avgOptimality !== null ? fmtPercent(a.avgOptimality) : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono">{fmtBytes(a.avgMemory)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <MetricChart
                title="Avg runtime"
                result={result}
                value={(a) => a.avgTimeMs}
                format={(v) => fmtMs(v)}
              />
              <MetricChart
                title="Avg nodes expanded"
                result={result}
                value={(a) => a.avgNodes}
                format={(v) => fmtInt(Math.round(v))}
              />
            </div>

            <div className="rounded-xl border border-primary/40 bg-accent p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                Recommendation
              </div>
              <p className="mt-1 text-xs leading-relaxed">{result.recommendation}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
