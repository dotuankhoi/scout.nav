/**
 * Benchmark Mode — batch-evaluates planners across many procedurally
 * generated worlds and aggregates engineering metrics, so users can
 * answer questions like "which algorithm should I use in a warehouse?"
 * with data instead of vibes.
 *
 * All planning runs execute in the Web Worker with `lean` traces
 * (no events shipped back), so a 100-map × 6-algorithm sweep stays fast
 * and never blocks the UI.
 */

import type { AlgorithmId, Cell, GridMap } from '@/types';
import { cellIndex } from '@/types';
import type { PlannerOptions, RunResult } from '@/algorithms/types';
import { planInWorker } from '@/workers/plannerClient';
import { mulberry32, randomSeed } from './rng';
import { generateScenario, SCENARIOS, type ScenarioId } from './scenarios';
import { turnsPerCell } from './coach';
import { fmtMs, fmtPercent } from './format';
import { ALGORITHM_META } from '@/algorithms/metadata';

export type BenchmarkEnv = 'random' | Exclude<ScenarioId, 'sandbox'>;

export interface BenchmarkConfig {
  env: BenchmarkEnv;
  maps: number;
  /** Obstacle density, used by the 'random' environment only. */
  density: number;
  algorithms: AlgorithmId[];
  options: PlannerOptions;
}

export interface AlgoAggregate {
  algorithm: AlgorithmId;
  runs: number;
  successes: number;
  successRate: number;
  avgTimeMs: number;
  avgNodes: number;
  /** Averages over successful runs only. */
  avgPathLength: number | null;
  avgOptimality: number | null;
  avgSmoothness: number | null;
  avgMemory: number;
}

export interface BenchmarkResult {
  config: BenchmarkConfig;
  aggregates: AlgoAggregate[];
  recommendation: string;
}

/** Random-obstacle world with BFS-verified solvability. */
function randomWorld(density: number, seed: number): { map: GridMap; start: Cell; goal: Cell } {
  const w = 48;
  const h = 30;
  for (let attempt = 0; attempt < 12; attempt++) {
    const rng = mulberry32(seed + attempt * 104729);
    const cells = new Uint8Array(w * h);
    for (let i = 0; i < cells.length; i++) cells[i] = rng() < density ? 1 : 0;
    const start: Cell = { x: 2, y: 2 + Math.floor(rng() * (h - 4)) };
    const goal: Cell = { x: w - 3, y: 2 + Math.floor(rng() * (h - 4)) };
    for (const c of [start, goal]) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = c.x + dx;
          const y = c.y + dy;
          if (x >= 0 && y >= 0 && x < w && y < h) cells[cellIndex(x, y, w)] = 0;
        }
      }
    }
    if (bfsSolvable(cells, w, h, start, goal)) {
      return { map: { width: w, height: h, cells, terrain: new Uint8Array(w * h) }, start, goal };
    }
  }
  // Statistically unreachable at sane densities; degrade to an empty map.
  return {
    map: { width: w, height: h, cells: new Uint8Array(w * h), terrain: new Uint8Array(w * h) },
    start: { x: 2, y: 15 },
    goal: { x: 45, y: 15 },
  };
}

function bfsSolvable(cells: Uint8Array, w: number, h: number, start: Cell, goal: Cell): boolean {
  const seen = new Uint8Array(w * h);
  const queue = [cellIndex(start.x, start.y, w)];
  seen[queue[0]] = 1;
  const goalIdx = cellIndex(goal.x, goal.y, w);
  while (queue.length > 0) {
    const i = queue.pop() as number;
    if (i === goalIdx) return true;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (!seen[ni] && cells[ni] === 0) {
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return false;
}

function makeWorld(env: BenchmarkEnv, density: number, seed: number) {
  if (env === 'random') return randomWorld(density, seed);
  const world = generateScenario(env, seed);
  return {
    map: {
      width: world.width,
      height: world.height,
      cells: world.cells,
      terrain: world.terrain,
    },
    start: world.start,
    goal: world.goal,
  };
}

/**
 * Run the full benchmark sweep. Sequential per-trial execution keeps
 * memory flat; progress is reported after every planner run.
 */
export async function runBenchmark(
  config: BenchmarkConfig,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<BenchmarkResult> {
  const total = config.maps * config.algorithms.length;
  let done = 0;

  const buckets = new Map<AlgorithmId, RunResult[]>();
  for (const a of config.algorithms) buckets.set(a, []);

  for (let m = 0; m < config.maps; m++) {
    const seed = randomSeed();
    const { map, start, goal } = makeWorld(config.env, config.density, seed);
    // Same seed for every algorithm on this map → fair sampling comparison.
    const options: PlannerOptions = {
      ...config.options,
      rrt: { ...config.options.rrt, seed },
    };
    for (const algorithm of config.algorithms) {
      if (isCancelled()) throw new Error('cancelled');
      const result = await planInWorker(algorithm, map, start, goal, options, true);
      buckets.get(algorithm)?.push(result);
      onProgress(++done, total);
    }
  }

  const aggregates: AlgoAggregate[] = config.algorithms.map((algorithm) => {
    const results = buckets.get(algorithm) ?? [];
    const ok = results.filter((r) => r.stats.pathFound);
    const avg = (vals: number[]) =>
      vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const avgOrNull = (vals: number[]) => (vals.length > 0 ? avg(vals) : null);
    return {
      algorithm,
      runs: results.length,
      successes: ok.length,
      successRate: results.length > 0 ? ok.length / results.length : 0,
      avgTimeMs: avg(results.map((r) => r.stats.timeMs)),
      avgNodes: avg(results.map((r) => r.stats.nodesExpanded)),
      avgPathLength: avgOrNull(
        ok.map((r) => r.stats.pathLength).filter((v): v is number => v !== null),
      ),
      avgOptimality: avgOrNull(
        ok.map((r) => r.stats.optimality).filter((v): v is number => v !== null),
      ),
      avgSmoothness: avgOrNull(
        ok
          .map((r) => turnsPerCell(r.path))
          .filter((v): v is number => v !== null),
      ),
      avgMemory: avg(results.map((r) => r.stats.memoryBytes)),
    };
  });

  return { config, aggregates, recommendation: recommend(config, aggregates) };
}

/** Rule-based recommendation from the aggregate table. */
function recommend(config: BenchmarkConfig, aggs: AlgoAggregate[]): string {
  if (aggs.length === 0) return '';
  const name = (a: AlgorithmId) => ALGORITHM_META[a].shortName;
  const envName =
    config.env === 'random'
      ? `random fields at ${(config.density * 100).toFixed(0)}% obstacle density`
      : `the ${SCENARIOS[config.env].name} environment`;

  // Composite: success dominates, then quality, then speed (min-max normalized).
  const times = aggs.map((a) => a.avgTimeMs);
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const speedScore = (t: number) => (tMax === tMin ? 1 : 1 - (t - tMin) / (tMax - tMin));
  const composite = (a: AlgoAggregate) =>
    a.successRate * 0.45 +
    (a.avgOptimality ?? 0.6) * 0.3 +
    speedScore(a.avgTimeMs) * 0.25;

  const best = [...aggs].sort((a, b) => composite(b) - composite(a))[0];
  const fastest = [...aggs].sort((a, b) => a.avgTimeMs - b.avgTimeMs)[0];
  const highestQuality = [...aggs]
    .filter((a) => a.avgOptimality !== null)
    .sort((a, b) => (b.avgOptimality ?? 0) - (a.avgOptimality ?? 0))[0];

  const parts: string[] = [];
  parts.push(
    `For ${envName}, ${name(best.algorithm)} achieved the best overall balance ` +
      `(${fmtPercent(best.successRate)} success, ${fmtMs(best.avgTimeMs)} average` +
      `${best.avgOptimality !== null ? `, ${fmtPercent(best.avgOptimality)} optimality` : ''}).`,
  );
  if (fastest.algorithm !== best.algorithm) {
    parts.push(`${name(fastest.algorithm)} was fastest at ${fmtMs(fastest.avgTimeMs)} average.`);
  }
  if (highestQuality && highestQuality.algorithm !== best.algorithm) {
    parts.push(
      `${name(highestQuality.algorithm)} produced the highest-quality paths (${fmtPercent(highestQuality.avgOptimality ?? 0)} of optimal).`,
    );
  }
  for (const f of aggs.filter((a) => a.successRate < 0.9)) {
    parts.push(
      `${name(f.algorithm)} only completed ${fmtPercent(f.successRate)} of missions — expect failures in this environment.`,
    );
  }
  if (config.env === 'city') {
    parts.push(
      'Note: for environments that change during a mission, D* Lite additionally offers incremental replanning that no single-shot benchmark captures.',
    );
  }
  return parts.join(' ');
}
