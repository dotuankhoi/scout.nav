/**
 * RRT* — asymptotically optimal RRT (Karaman & Frazzoli, 2011).
 *
 * Extends RRT with two extra steps per iteration:
 *  1. Choose-parent: the new node is wired to whichever nearby node
 *     yields the cheapest collision-free cost from the root.
 *  2. Rewire: nearby nodes whose cost would drop by routing *through*
 *     the new node are re-parented to it, and the saving is propagated
 *     to their descendants.
 *
 * Unlike RRT it does not stop at the first goal connection — it keeps
 * sampling until the iteration budget is spent, so the path visibly
 * improves over time (asymptotic optimality in action).
 */

import { cellCenter } from '@/types';
import type { Vec2 } from '@/types';
import { dist, pathLength, pointFree, segmentFree } from '@/utils/geometry';
import { mulberry32 } from '@/utils/rng';
import { emptyStats } from './searchCore';
import {
  extractTreePath,
  nearestNode,
  steer,
  treeMemoryEstimate,
  type TreeNode,
} from './rrt';
import type { PathPlanner, PlannerInput, PlannerResult, TraceEvent } from './types';

function findPath(input: PlannerInput): PlannerResult {
  const { map, start, goal, options } = input;
  const { maxIterations, stepSize, goalBias, goalRadius, rewireRadius, seed } =
    options.rrt;
  const events: TraceEvent[] = [];
  const stats = emptyStats('rrtstar');
  const rng = mulberry32(seed);

  const startPt = cellCenter(start);
  const goalPt = cellCenter(goal);

  if (!pointFree(map, startPt) || !pointFree(map, goalPt)) {
    events.push({ type: 'noPath', reason: 'Start or goal lies inside an obstacle.' });
    return { events, path: null, stats };
  }

  const nodes: TreeNode[] = [{ x: startPt.x, y: startPt.y, parent: -1, cost: 0 }];
  const children: number[][] = [[]];
  events.push({ type: 'treeNode', index: 0, point: startPt, parent: -1, cost: 0 });

  /** Nodes that can see the goal (candidate path endpoints). */
  const goalCandidates = new Set<number>();
  let bestGoalCost = Infinity;

  /** Propagate a cost delta to all descendants after a rewire. */
  const propagate = (root: number, delta: number) => {
    const stack = [...children[root]];
    while (stack.length > 0) {
      const i = stack.pop() as number;
      nodes[i].cost += delta;
      stack.push(...children[i]);
    }
  };

  const tryGoalCandidate = (i: number) => {
    const p = nodes[i];
    if (dist(p, goalPt) <= goalRadius && segmentFree(map, p, goalPt)) {
      goalCandidates.add(i);
      const total = p.cost + dist(p, goalPt);
      if (total < bestGoalCost - 1e-9) {
        bestGoalCost = total;
        events.push({ type: 'goalReached', cost: total });
      }
    }
  };

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

    // --- Choose-parent: cheapest collision-free connection nearby. ---
    const nearSet: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      if (dist(nodes[i], newPt) <= rewireRadius) nearSet.push(i);
    }
    let parent = nearIdx;
    let cost = nodes[nearIdx].cost + dist(nearPt, newPt);
    for (const i of nearSet) {
      const candidate = nodes[i].cost + dist(nodes[i], newPt);
      if (candidate < cost && segmentFree(map, nodes[i], newPt)) {
        parent = i;
        cost = candidate;
      }
    }

    const index = nodes.length;
    nodes.push({ x: newPt.x, y: newPt.y, parent, cost });
    children.push([]);
    children[parent].push(index);
    events.push({ type: 'treeNode', index, point: newPt, parent, cost });
    stats.nodesExpanded++;
    stats.frontier.push(nodes.length);
    stats.maxOpenSize = nodes.length;

    // --- Rewire: route neighbors through the new node when cheaper. ---
    for (const i of nearSet) {
      if (i === parent || i === 0) continue;
      const through = cost + dist(newPt, nodes[i]);
      const saving = nodes[i].cost - through;
      if (saving > 1e-9 && segmentFree(map, newPt, nodes[i])) {
        const oldParent = nodes[i].parent;
        const siblings = children[oldParent];
        siblings.splice(siblings.indexOf(i), 1);
        nodes[i].parent = index;
        children[index].push(i);
        nodes[i].cost = through;
        propagate(i, -saving);
        events.push({
          type: 'rewire',
          index: i,
          point: { x: nodes[i].x, y: nodes[i].y },
          oldParent,
          newParent: index,
          saving,
        });
      }
    }

    tryGoalCandidate(index);
  }

  // Pick the best goal connection discovered during sampling.
  let bestIdx = -1;
  let bestCost = Infinity;
  for (const i of goalCandidates) {
    const total = nodes[i].cost + dist(nodes[i], goalPt);
    if (total < bestCost) {
      bestCost = total;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) {
    events.push({
      type: 'noPath',
      reason: `No collision-free connection to the goal after ${maxIterations} iterations.`,
    });
    stats.memoryBytes = treeMemoryEstimate(nodes.length, map.width * map.height);
    return { events, path: null, stats };
  }

  const points = [...extractTreePath(nodes, bestIdx), { ...goalPt }];
  events.push({ type: 'path', points, cost: bestCost });
  stats.pathFound = true;
  stats.pathCost = bestCost;
  stats.pathLength = pathLength(points);
  stats.memoryBytes = treeMemoryEstimate(nodes.length, map.width * map.height);
  return { events, path: points, stats };
}

export const rrtstar: PathPlanner = { id: 'rrtstar', findPath };
