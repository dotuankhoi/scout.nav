/**
 * Central planner registry. Adding a new algorithm (PRM, Hybrid A*, DWA…)
 * means: implement {@link PathPlanner} in its own module, register it
 * here, and add an entry to `metadata.ts` — nothing else changes.
 */

import type { AlgorithmId } from '@/types';
import type { PathPlanner } from './types';
import { astar } from './astar';
import { dijkstra } from './dijkstra';
import { thetastar } from './thetastar';
import { dstarlite } from './dstarlite';
import { rrt } from './rrt';
import { rrtstar } from './rrtstar';

const PLANNERS: Record<AlgorithmId, PathPlanner> = {
  astar,
  dijkstra,
  thetastar,
  dstar: dstarlite,
  rrt,
  rrtstar,
};

/** Display order for pickers. */
export const ALGORITHM_ORDER: AlgorithmId[] = [
  'astar',
  'dijkstra',
  'thetastar',
  'dstar',
  'rrt',
  'rrtstar',
];

/** Look up a planner implementation by id. */
export function getPlanner(id: AlgorithmId): PathPlanner {
  return PLANNERS[id];
}

/** True for planners that sample a continuous space (tree visualization). */
export function isSamplingPlanner(id: AlgorithmId): boolean {
  return id === 'rrt' || id === 'rrtstar';
}
