/**
 * Dijkstra — uniform-cost search. Identical to A* with h ≡ 0, so it
 * delegates to the shared grid-search core with the heuristic disabled.
 */

import type { PathPlanner } from './types';
import { runGridSearch } from './searchCore';

export const dijkstra: PathPlanner = {
  id: 'dijkstra',
  findPath: (input) => runGridSearch(input, 'dijkstra', false),
};
