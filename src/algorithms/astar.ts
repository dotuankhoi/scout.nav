/**
 * A* — informed best-first search with an admissible heuristic.
 * Delegates to the shared grid-search core with heuristics enabled.
 */

import type { PathPlanner } from './types';
import { runGridSearch } from './searchCore';

export const astar: PathPlanner = {
  id: 'astar',
  findPath: (input) => runGridSearch(input, 'astar', true),
};
