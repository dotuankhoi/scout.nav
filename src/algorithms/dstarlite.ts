/**
 * D* Lite (Koenig & Likhachev, 2002).
 *
 * Searches *backwards* from the goal, maintaining for every vertex two
 * values: g (current cost-to-goal estimate) and rhs (one-step lookahead
 * cost-to-goal). A vertex is *consistent* when g === rhs. The priority
 * queue orders vertices by a two-part key so that repairing the solution
 * after an edge-cost change touches only the affected region — the
 * property that makes D* Lite the standard for replanning on real robots.
 *
 * In this app the world is static during a run, so a single call to
 * computeShortestPath is shown; the incremental machinery (keys, rhs,
 * under/over-consistency) is implemented faithfully and narrated by the
 * Algorithm Inspector.
 */

import type { Cell } from '@/types';
import { cellCenter, cellIndex } from '@/types';
import { pathLength } from '@/utils/geometry';
import { BinaryHeap } from './heap';
import { neighborsOf } from './grid';
import { getHeuristic } from './heuristics';
import { emptyStats, gridMemoryEstimate } from './searchCore';
import type { PathPlanner, PlannerInput, PlannerResult, TraceEvent } from './types';

interface QueueEntry {
  i: number;
  k1: number;
  k2: number;
}

function findPath(input: PlannerInput): PlannerResult {
  const { map, start, goal, options } = input;
  const { width, height } = map;
  const n = width * height;
  const events: TraceEvent[] = [];
  const stats = emptyStats('dstar');

  const hFn = getHeuristic(options.heuristic);
  // Heuristic measures distance to the *start* (search runs goal → start).
  // Kept unweighted: D* Lite's key invariants assume an admissible h.
  const h = (x: number, y: number) =>
    hFn(Math.abs(x - start.x), Math.abs(y - start.y));

  const g = new Float64Array(n).fill(Infinity);
  const rhs = new Float64Array(n).fill(Infinity);
  /** Latest valid key per queued vertex — stale heap entries are skipped. */
  const queuedKeys = new Map<number, [number, number]>();
  const heap = new BinaryHeap<QueueEntry>(
    (a, b) => a.k1 - b.k1 || a.k2 - b.k2,
  );

  const startIdx = cellIndex(start.x, start.y, width);
  const goalIdx = cellIndex(goal.x, goal.y, width);
  const toCell = (i: number): Cell => ({ x: i % width, y: Math.floor(i / width) });

  const calcKey = (i: number): [number, number] => {
    const m = Math.min(g[i], rhs[i]);
    const c = toCell(i);
    return [m + h(c.x, c.y), m];
  };

  const pushVertex = (i: number, reOpen: boolean, parent: Cell | null) => {
    const key = calcKey(i);
    queuedKeys.set(i, key);
    heap.push({ i, k1: key[0], k2: key[1] });
    const c = toCell(i);
    const extra = {
      k1: round3(key[0]),
      k2: round3(key[1]),
      gValue: fmtInf(g[i]),
      rhsValue: fmtInf(rhs[i]),
    };
    const base = {
      node: c,
      g: rhs[i],
      h: h(c.x, c.y),
      f: key[0],
      extra,
    };
    if (reOpen) {
      events.push({ type: 'update', ...base, parent: parent ?? c });
    } else {
      stats.nodesGenerated++;
      events.push({ type: 'open', ...base, parent });
    }
    stats.maxOpenSize = Math.max(stats.maxOpenSize, queuedKeys.size);
  };

  /** Recompute rhs(u) from successors and (re)queue u if inconsistent. */
  const updateVertex = (u: number) => {
    if (u !== goalIdx) {
      const c = toCell(u);
      let best = Infinity;
      let bestSucc: Cell | null = null;
      for (const nb of neighborsOf(map, c.x, c.y, options.allowDiagonal)) {
        const si = cellIndex(nb.x, nb.y, width);
        const candidate = nb.cost + g[si];
        if (candidate < best) {
          best = candidate;
          bestSucc = { x: nb.x, y: nb.y };
        }
      }
      rhs[u] = best;
      const wasQueued = queuedKeys.has(u);
      if (wasQueued) queuedKeys.delete(u);
      if (g[u] !== rhs[u]) pushVertex(u, wasQueued, bestSucc);
    } else {
      const wasQueued = queuedKeys.has(u);
      if (wasQueued) queuedKeys.delete(u);
      if (g[u] !== rhs[u]) pushVertex(u, wasQueued, null);
    }
  };

  const keyLess = (a: [number, number], b: [number, number]) =>
    a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

  // Initialize: only the goal is inconsistent.
  rhs[goalIdx] = 0;
  pushVertex(goalIdx, false, null);

  const maxExpansions = n * 16;
  let guard = 0;

  while (heap.size > 0 && guard++ < maxExpansions) {
    const startKey = calcKey(startIdx);
    const top = heap.peek() as QueueEntry;
    if (!keyLess([top.k1, top.k2], startKey) && rhs[startIdx] === g[startIdx]) {
      break; // Start is consistent and no cheaper vertex remains.
    }

    const entry = heap.pop() as QueueEntry;
    const valid = queuedKeys.get(entry.i);
    if (!valid || valid[0] !== entry.k1 || valid[1] !== entry.k2) continue; // stale

    const i = entry.i;
    const c = toCell(i);
    const kNew = calcKey(i);

    if (keyLess([entry.k1, entry.k2], kNew)) {
      // Key became outdated while queued — requeue with the fresh key.
      queuedKeys.delete(i);
      pushVertex(i, true, null);
      continue;
    }

    queuedKeys.delete(i);
    const overConsistent = g[i] > rhs[i];
    events.push({
      type: 'current',
      node: c,
      g: rhs[i],
      h: h(c.x, c.y),
      f: entry.k1,
      openSize: queuedKeys.size,
      extra: {
        k1: round3(entry.k1),
        k2: round3(entry.k2),
        gValue: fmtInf(g[i]),
        rhsValue: fmtInf(rhs[i]),
        consistency: overConsistent ? 'over-consistent' : 'under-consistent',
      },
    });
    stats.nodesExpanded++;
    stats.frontier.push(queuedKeys.size);

    if (overConsistent) {
      // Lower g to rhs — the vertex becomes consistent (locally "closed").
      g[i] = rhs[i];
      events.push({ type: 'close', node: c });
      for (const nb of neighborsOf(map, c.x, c.y, options.allowDiagonal)) {
        updateVertex(cellIndex(nb.x, nb.y, width));
      }
    } else {
      // Under-consistent: invalidate and repair the neighborhood.
      g[i] = Infinity;
      updateVertex(i);
      for (const nb of neighborsOf(map, c.x, c.y, options.allowDiagonal)) {
        updateVertex(cellIndex(nb.x, nb.y, width));
      }
    }
  }

  if (rhs[startIdx] === Infinity) {
    events.push({ type: 'noPath', reason: 'rhs(start) is still infinite after the queue settled — no route from goal back to start exists.' });
    stats.memoryBytes = gridMemoryEstimate(n, stats.maxOpenSize) + n * 8;
    return { events, path: null, stats };
  }

  // Extract the path by greedy descent on g from the start.
  const cells: Cell[] = [{ ...start }];
  const visited = new Set<number>([startIdx]);
  let cur = startIdx;
  let safety = 0;
  while (cur !== goalIdx && safety++ < n) {
    const c = toCell(cur);
    let best = Infinity;
    let next = -1;
    for (const nb of neighborsOf(map, c.x, c.y, options.allowDiagonal)) {
      const si = cellIndex(nb.x, nb.y, width);
      const candidate = nb.cost + g[si];
      if (candidate < best && !visited.has(si)) {
        best = candidate;
        next = si;
      }
    }
    if (next < 0) break;
    visited.add(next);
    cells.push(toCell(next));
    cur = next;
  }

  if (cur !== goalIdx) {
    events.push({ type: 'noPath', reason: 'Greedy descent on g-values failed to reach the goal.' });
    stats.memoryBytes = gridMemoryEstimate(n, stats.maxOpenSize) + n * 8;
    return { events, path: null, stats };
  }

  const points = cells.map(cellCenter);
  const cost = rhs[startIdx];
  events.push({ type: 'goalReached', cost });
  events.push({ type: 'path', points, cost });
  stats.pathFound = true;
  stats.pathCost = cost;
  stats.pathLength = pathLength(points);
  stats.memoryBytes = gridMemoryEstimate(n, stats.maxOpenSize) + n * 8; // + rhs array
  return { events, path: points, stats };
}

function round3(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v;
}

function fmtInf(v: number): number | string {
  return Number.isFinite(v) ? round3(v) : '∞';
}

export const dstarlite: PathPlanner = { id: 'dstar', findPath };
