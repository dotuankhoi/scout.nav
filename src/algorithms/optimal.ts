/**
 * Reference optimal cost via plain Dijkstra (no tracing).
 * Used by the worker to compute the "optimality" statistic for every run.
 */

import type { Cell, GridMap } from '@/types';
import { cellIndex } from '@/types';
import { BinaryHeap } from './heap';
import { neighborsOf } from './grid';

/**
 * Cost of the optimal grid path between two cells, or null when
 * unreachable. Runs in a few milliseconds even on large grids.
 */
export function optimalGridCost(
  map: GridMap,
  start: Cell,
  goal: Cell,
  allowDiagonal: boolean,
): number | null {
  const { width, height } = map;
  const n = width * height;
  const g = new Float64Array(n).fill(Infinity);
  const closed = new Uint8Array(n);
  const heap = new BinaryHeap<{ i: number; g: number }>((a, b) => a.g - b.g);

  const startIdx = cellIndex(start.x, start.y, width);
  const goalIdx = cellIndex(goal.x, goal.y, width);
  g[startIdx] = 0;
  heap.push({ i: startIdx, g: 0 });

  while (heap.size > 0) {
    const { i, g: gi } = heap.pop() as { i: number; g: number };
    if (closed[i] || gi > g[i]) continue;
    if (i === goalIdx) return gi;
    closed[i] = 1;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const nb of neighborsOf(map, x, y, allowDiagonal)) {
      const ni = cellIndex(nb.x, nb.y, width);
      if (closed[ni]) continue;
      const t = gi + nb.cost;
      if (t < g[ni]) {
        g[ni] = t;
        heap.push({ i: ni, g: t });
      }
    }
  }
  return null;
}
