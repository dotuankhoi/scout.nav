/**
 * Occupancy-grid primitives shared by all grid planners.
 */

import type { Cell, GridMap } from '@/types';
import { cellIndex, terrainMultiplier } from '@/types';

export const SQRT2 = Math.SQRT2;

/** A reachable neighbor with its step cost. */
export interface Neighbor {
  x: number;
  y: number;
  cost: number;
}

/** True when (x, y) is inside the grid. */
export function inBounds(map: GridMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

/** True when (x, y) is inside the grid and not an obstacle. */
export function isFree(map: GridMap, x: number, y: number): boolean {
  return inBounds(map, x, y) && map.cells[cellIndex(x, y, map.width)] === 0;
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const DIAG: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Reachable neighbors of a cell. Diagonal moves are blocked when either
 * adjacent orthogonal cell is occupied (no corner cutting — a real robot
 * cannot squeeze between two touching obstacle corners).
 *
 * Step cost = geometric distance × the destination cell's terrain
 * multiplier, so planners naturally trade distance against energy on
 * weighted maps (sand, rubble, flood water…). Multipliers are ≥ 1, which
 * keeps every distance heuristic admissible.
 */
export function neighborsOf(
  map: GridMap,
  x: number,
  y: number,
  allowDiagonal: boolean,
): Neighbor[] {
  const result: Neighbor[] = [];
  for (const [dx, dy] of ORTHO) {
    const nx = x + dx;
    const ny = y + dy;
    if (isFree(map, nx, ny)) {
      result.push({
        x: nx,
        y: ny,
        cost: terrainMultiplier(map.terrain[cellIndex(nx, ny, map.width)]),
      });
    }
  }
  if (allowDiagonal) {
    for (const [dx, dy] of DIAG) {
      const nx = x + dx;
      const ny = y + dy;
      if (isFree(map, nx, ny) && isFree(map, nx, y) && isFree(map, x, ny)) {
        result.push({
          x: nx,
          y: ny,
          cost: SQRT2 * terrainMultiplier(map.terrain[cellIndex(nx, ny, map.width)]),
        });
      }
    }
  }
  return result;
}

/** Convert a chain of parent pointers into a cell-center polyline. */
export function reconstructPath(
  parents: Int32Array,
  width: number,
  goalIdx: number,
): Cell[] {
  const path: Cell[] = [];
  let i = goalIdx;
  while (i >= 0) {
    path.push({ x: i % width, y: Math.floor(i / width) });
    i = parents[i];
  }
  path.reverse();
  return path;
}
