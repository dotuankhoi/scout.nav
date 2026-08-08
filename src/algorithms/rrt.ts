/**
 * RRT — Rapidly-exploring Random Tree (LaValle, 1998).
 *
 * Grows a tree from the start by repeatedly sampling a random
 * configuration, steering from the nearest tree node toward it by at
 * most `stepSize`, and keeping the extension when it is collision-free.
 * Returns the first path that connects to the goal region — fast, but
 * with no optimality guarantee.
 */

import { cellCenter } from '@/types';
import type { Vec2 } from '@/types';
import { dist, pathLength, pointFree, segmentFree } from '@/utils/geometry';
import { mulberry32 } from '@/utils/rng';
import { emptyStats } from './searchCore';
import type { PathPlanner, PlannerInput, PlannerResult, TraceEvent } from './types';

/** A node of the sampling tree. */
export interface TreeNode {
  x: number;
  y: number;
  /** Index of the parent node, -1 for the root. */
  parent: number;
  /** Cost from the root along tree edges. */
  cost: number;
}

/** Rough working-set estimate for a sampling tree, bytes. */
export function treeMemoryEstimate(nodeCount: number, cellCount: number): number {
  return nodeCount * 48 + cellCount;
}

/** Walk parent pointers from a node index back to the root. */
export function extractTreePath(nodes: TreeNode[], leaf: number): Vec2[] {
  const points: Vec2[] = [];
  let i = leaf;
  while (i >= 0) {
    points.push({ x: nodes[i].x, y: nodes[i].y });
    i = nodes[i].parent;
  }
  points.reverse();
  return points;
}

/** Index of the tree node nearest to a point (linear scan). */
export function nearestNode(nodes: TreeNode[], p: Vec2): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = (nodes[i].x - p.x) ** 2 + (nodes[i].y - p.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Move from `from` toward `to` by at most `step`. */
export function steer(from: Vec2, to: Vec2, step: number): Vec2 {
  const d = dist(from, to);
  if (d <= step) return { ...to };
  const f = step / d;
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
}

function findPath(input: PlannerInput): PlannerResult {
  const { map, start, goal, options } = input;
  const { maxIterations, stepSize, goalBias, goalRadius, seed } = options.rrt;
  const events: TraceEvent[] = [];
  const stats = emptyStats('rrt');
  const rng = mulberry32(seed);

  const startPt = cellCenter(start);
  const goalPt = cellCenter(goal);

  if (!pointFree(map, startPt) || !pointFree(map, goalPt)) {
    events.push({ type: 'noPath', reason: 'Start or goal lies inside an obstacle.' });
    return { events, path: null, stats };
  }

  const nodes: TreeNode[] = [{ x: startPt.x, y: startPt.y, parent: -1, cost: 0 }];
  events.push({ type: 'treeNode', index: 0, point: startPt, parent: -1, cost: 0 });

  for (let iter = 1; iter <= maxIterations; iter++) {
    stats.iterations = iter;
    const goalBiased = rng() < goalBias;
    const sample: Vec2 = goalBiased
      ? { ...goalPt }
      : { x: rng() * map.width, y: rng() * map.height };
    events.push({ type: 'sample', point: sample, goalBiased });
    stats.nodesGenerated++;

    const nearIdx = nearestNode(nodes, sample);
    const nearPt: Vec2 = { x: nodes[nearIdx].x, y: nodes[nearIdx].y };
    const newPt = steer(nearPt, sample, stepSize);

    if (dist(newPt, nearPt) < 1e-6) {
      events.push({ type: 'reject', point: newPt, from: nearPt, reason: 'duplicate' });
      continue;
    }
    if (!segmentFree(map, nearPt, newPt)) {
      events.push({ type: 'reject', point: newPt, from: nearPt, reason: 'collision' });
      continue;
    }

    const cost = nodes[nearIdx].cost + dist(nearPt, newPt);
    const index = nodes.length;
    nodes.push({ x: newPt.x, y: newPt.y, parent: nearIdx, cost });
    events.push({ type: 'treeNode', index, point: newPt, parent: nearIdx, cost });
    stats.nodesExpanded++;
    stats.frontier.push(nodes.length);
    stats.maxOpenSize = nodes.length;

    // Try to connect to the goal region.
    if (dist(newPt, goalPt) <= goalRadius && segmentFree(map, newPt, goalPt)) {
      const goalCost = cost + dist(newPt, goalPt);
      const goalIdx = nodes.length;
      nodes.push({ x: goalPt.x, y: goalPt.y, parent: index, cost: goalCost });
      events.push({
        type: 'treeNode',
        index: goalIdx,
        point: goalPt,
        parent: index,
        cost: goalCost,
      });
      events.push({ type: 'goalReached', cost: goalCost });

      const points = extractTreePath(nodes, goalIdx);
      events.push({ type: 'path', points, cost: goalCost });
      stats.pathFound = true;
      stats.pathCost = goalCost;
      stats.pathLength = pathLength(points);
      stats.memoryBytes = treeMemoryEstimate(nodes.length, map.width * map.height);
      return { events, path: points, stats };
    }
  }

  events.push({
    type: 'noPath',
    reason: `No collision-free connection to the goal after ${maxIterations} iterations.`,
  });
  stats.memoryBytes = treeMemoryEstimate(nodes.length, map.width * map.height);
  return { events, path: null, stats };
}

export const rrt: PathPlanner = { id: 'rrt', findPath };
