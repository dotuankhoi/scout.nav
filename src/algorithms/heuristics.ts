/**
 * Grid distance heuristics for informed search.
 * All heuristics are admissible for their matching motion model.
 */

import type { HeuristicId } from '@/types';
import { SQRT2 } from './grid';

export type HeuristicFn = (dx: number, dy: number) => number;

const FUNCTIONS: Record<HeuristicId, HeuristicFn> = {
  /** L1 distance — admissible for 4-connected grids. */
  manhattan: (dx, dy) => dx + dy,
  /** L2 distance — admissible for any motion model. */
  euclidean: (dx, dy) => Math.hypot(dx, dy),
  /** Octile distance — exact for 8-connected unit grids. */
  octile: (dx, dy) => Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy),
};

/** Look up a heuristic function by id. */
export function getHeuristic(id: HeuristicId): HeuristicFn {
  return FUNCTIONS[id];
}

/** Evaluate heuristic between two cells given absolute deltas. */
export function heuristicBetween(
  id: HeuristicId,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return FUNCTIONS[id](Math.abs(ax - bx), Math.abs(ay - by));
}
