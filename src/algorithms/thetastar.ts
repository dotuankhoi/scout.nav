/**
 * Theta* — any-angle path planning on grids (Nash et al., 2007).
 *
 * Identical expansion order to A*, but when relaxing a neighbor it first
 * tries to connect the neighbor directly to the *parent* of the current
 * node (Path 2). If that grandparent has line-of-sight to the neighbor,
 * the path skips the intermediate cell entirely, producing taut,
 * any-angle paths instead of staircase-shaped grid paths.
 */

import type { Cell } from '@/types';
import { cellCenter, cellIndex } from '@/types';
import { lineOfSightClearTerrain, pathLength } from '@/utils/geometry';
import { BinaryHeap } from './heap';
import { neighborsOf, reconstructPath } from './grid';
import { getHeuristic } from './heuristics';
import { emptyStats, gridMemoryEstimate } from './searchCore';
import type { PathPlanner, PlannerInput, PlannerResult, TraceEvent } from './types';

interface HeapEntry {
  i: number;
  f: number;
  g: number;
}

function findPath(input: PlannerInput): PlannerResult {
  const { map, start, goal, options } = input;
  const { width } = map;
  const n = width * map.height;
  const events: TraceEvent[] = [];
  const stats = emptyStats('thetastar');

  const hFn = getHeuristic(options.heuristic);
  const h = (x: number, y: number) =>
    options.heuristicWeight * hFn(Math.abs(x - goal.x), Math.abs(y - goal.y));

  const g = new Float64Array(n).fill(Infinity);
  const parents = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new BinaryHeap<HeapEntry>((a, b) => a.f - b.f || a.g - b.g);

  const startIdx = cellIndex(start.x, start.y, width);
  const goalIdx = cellIndex(goal.x, goal.y, width);
  const toCell = (i: number): Cell => ({ x: i % width, y: Math.floor(i / width) });

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
    if (closed[i] || entry.g > g[i]) continue;

    const node = toCell(i);
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

    const parentIdx = parents[i];
    const parentCell = parentIdx >= 0 ? toCell(parentIdx) : null;

    for (const nb of neighborsOf(map, node.x, node.y, options.allowDiagonal)) {
      const ni = cellIndex(nb.x, nb.y, width);
      if (closed[ni]) continue;

      // Path 2 (any-angle): connect neighbor straight to current's parent.
      let candidateParent = i;
      let tentative = g[i] + nb.cost;
      let usedLos = false;
      if (
        parentCell &&
        lineOfSightClearTerrain(map, parentCell, { x: nb.x, y: nb.y })
      ) {
        const losCost =
          g[parentIdx] + Math.hypot(nb.x - parentCell.x, nb.y - parentCell.y);
        if (losCost <= tentative) {
          candidateParent = parentIdx;
          tentative = losCost;
          usedLos = true;
        }
      }

      if (tentative < g[ni]) {
        const isNew = g[ni] === Infinity;
        g[ni] = tentative;
        parents[ni] = candidateParent;
        const nh = h(nb.x, nb.y);
        heap.push({ i: ni, f: tentative + nh, g: tentative });
        const parentOfEvent = toCell(candidateParent);
        const extra = usedLos
          ? {
              lineOfSight: true,
              shortcutFrom: `(${parentOfEvent.x}, ${parentOfEvent.y})`,
            }
          : undefined;
        if (isNew) {
          openCount++;
          stats.nodesGenerated++;
          events.push({
            type: 'open',
            node: { x: nb.x, y: nb.y },
            g: tentative,
            h: nh,
            f: tentative + nh,
            parent: parentOfEvent,
            extra,
          });
        } else {
          events.push({
            type: 'update',
            node: { x: nb.x, y: nb.y },
            g: tentative,
            h: nh,
            f: tentative + nh,
            parent: parentOfEvent,
            extra,
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

export const thetastar: PathPlanner = { id: 'thetastar', findPath };
