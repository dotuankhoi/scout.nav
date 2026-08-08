/**
 * Shared best-first grid search core.
 *
 * A* and Dijkstra are the same algorithm with different heuristics
 * (Dijkstra is A* with h ≡ 0), so both planners delegate here instead of
 * duplicating the search loop.
 */

import type { AlgorithmId, Cell } from '@/types';
import { cellCenter, cellIndex } from '@/types';
import { pathLength } from '@/utils/geometry';
import { BinaryHeap } from './heap';
import { neighborsOf, reconstructPath } from './grid';
import { getHeuristic } from './heuristics';
import type { PlannerInput, PlannerResult, RunStats, TraceEvent } from './types';

interface HeapEntry {
  i: number;
  f: number;
  g: number;
}

/** Base stats object; the worker fills in timing and optimality. */
export function emptyStats(algorithm: AlgorithmId): RunStats {
  return {
    algorithm,
    timeMs: 0,
    nodesExpanded: 0,
    nodesGenerated: 0,
    maxOpenSize: 0,
    pathFound: false,
    pathLength: null,
    pathCost: null,
    optimalCost: null,
    optimality: null,
    memoryBytes: 0,
    iterations: null,
    frontier: [],
  };
}

/** Rough working-set estimate for a grid search, in bytes. */
export function gridMemoryEstimate(cellCount: number, maxOpen: number): number {
  // g (f64) + parents (i32) + closed (u8) + occupancy (u8) + heap entries.
  return cellCount * (8 + 4 + 1 + 1) + maxOpen * 32;
}

/**
 * Weighted best-first search over the occupancy grid.
 *
 * @param input     Map, endpoints and options.
 * @param algorithm Which planner id to stamp on events/stats.
 * @param informed  true → use the configured heuristic (A*), false → h ≡ 0 (Dijkstra).
 */
export function runGridSearch(
  input: PlannerInput,
  algorithm: AlgorithmId,
  informed: boolean,
): PlannerResult {
  const { map, start, goal, options } = input;
  const { width, height } = map;
  const n = width * height;
  const events: TraceEvent[] = [];
  const stats = emptyStats(algorithm);

  const hFn = getHeuristic(options.heuristic);
  const weight = informed ? options.heuristicWeight : 0;
  const h = (x: number, y: number) =>
    weight * hFn(Math.abs(x - goal.x), Math.abs(y - goal.y));

  const g = new Float64Array(n).fill(Infinity);
  const parents = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new BinaryHeap<HeapEntry>((a, b) => a.f - b.f || a.g - b.g);

  const startIdx = cellIndex(start.x, start.y, width);
  const goalIdx = cellIndex(goal.x, goal.y, width);

  let openCount = 1;
  g[startIdx] = 0;
  heap.push({ i: startIdx, f: h(start.x, start.y), g: 0 });
  events.push({
    type: 'open',
    node: { ...start },
    g: 0,
    h: h(start.x, start.y),
    f: h(start.x, start.y),
    parent: null,
  });
  stats.nodesGenerated++;

  while (heap.size > 0) {
    const entry = heap.pop() as HeapEntry;
    const i = entry.i;
    // Lazy deletion: skip entries superseded by a cheaper rediscovery.
    if (closed[i] || entry.g > g[i]) continue;

    const x = i % width;
    const y = Math.floor(i / width);
    const node: Cell = { x, y };
    openCount--;

    events.push({
      type: 'current',
      node,
      g: g[i],
      h: entry.f - g[i],
      f: entry.f,
      openSize: openCount,
    });
    stats.nodesExpanded++;
    stats.frontier.push(openCount);

    if (i === goalIdx) {
      const cells = reconstructPath(parents, width, goalIdx);
      const points = cells.map(cellCenter);
      events.push({ type: 'path', points, cost: g[goalIdx] });
      stats.pathFound = true;
      stats.pathCost = g[goalIdx];
      stats.pathLength = pathLength(points);
      stats.memoryBytes = gridMemoryEstimate(n, stats.maxOpenSize);
      return { events, path: points, stats };
    }

    closed[i] = 1;
    events.push({ type: 'close', node });

    for (const nb of neighborsOf(map, x, y, options.allowDiagonal)) {
      const ni = cellIndex(nb.x, nb.y, width);
      if (closed[ni]) continue;
      const tentative = g[i] + nb.cost;
      if (tentative < g[ni]) {
        const isNew = g[ni] === Infinity;
        g[ni] = tentative;
        parents[ni] = i;
        const nh = h(nb.x, nb.y);
        heap.push({ i: ni, f: tentative + nh, g: tentative });
        if (isNew) {
          openCount++;
          stats.nodesGenerated++;
          events.push({
            type: 'open',
            node: { x: nb.x, y: nb.y },
            g: tentative,
            h: nh,
            f: tentative + nh,
            parent: node,
          });
        } else {
          events.push({
            type: 'update',
            node: { x: nb.x, y: nb.y },
            g: tentative,
            h: nh,
            f: tentative + nh,
            parent: node,
          });
        }
        stats.maxOpenSize = Math.max(stats.maxOpenSize, openCount);
      }
    }
  }

  events.push({ type: 'noPath', reason: 'The open set emptied before reaching the goal — the goal is unreachable from the start.' });
  stats.memoryBytes = gridMemoryEstimate(n, stats.maxOpenSize);
  return { events, path: null, stats };
}
