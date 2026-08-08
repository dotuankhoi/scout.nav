/**
 * Shared domain types for scout.nav.
 *
 * Coordinate conventions:
 * - `Cell` is an integer grid coordinate (column x, row y).
 * - `Vec2` is a continuous point measured in *cell units* — `1.0 === one cell`.
 *   Cell (x, y) has its center at Vec2 (x + 0.5, y + 0.5).
 */

/** Integer grid coordinate. */
export interface Cell {
  x: number;
  y: number;
}

/** Continuous 2D point in cell units. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Identifiers for every planner shipped with the app. */
export type AlgorithmId =
  | 'astar'
  | 'dijkstra'
  | 'thetastar'
  | 'dstar'
  | 'rrt'
  | 'rrtstar';

/** Occupancy-grid world model. */
export interface GridMap {
  width: number;
  height: number;
  /** Row-major occupancy: 0 = free, 1 = obstacle. Length = width * height. */
  cells: Uint8Array;
  /**
   * Row-major terrain type per cell (see {@link TerrainId}); 0 = clear.
   * Terrain multiplies traversal cost — sand is slow, hazards are costly —
   * which is how scenarios like Mars Rover make planners energy-aware.
   */
  terrain: Uint8Array;
}

/** Terrain classes with their traversal-cost multipliers. */
export const TERRAIN_TYPES = [
  { id: 0, name: 'Clear', multiplier: 1 },
  { id: 1, name: 'Rough', multiplier: 1.8 },
  { id: 2, name: 'Sand', multiplier: 2.6 },
  { id: 3, name: 'Hazard', multiplier: 4.5 },
] as const;

export type TerrainId = 0 | 1 | 2 | 3;

/** Traversal-cost multiplier for a terrain id. */
export function terrainMultiplier(t: number): number {
  return TERRAIN_TYPES[t]?.multiplier ?? 1;
}

/** Interactive editing tools available on the map canvas. */
export type ToolId = 'draw' | 'erase' | 'move' | 'start' | 'goal' | 'pan';

/** Heatmap overlay modes. */
export type HeatmapMode = 'none' | 'frequency' | 'density' | 'order';

/** Grid distance heuristics. */
export type HeuristicId = 'manhattan' | 'euclidean' | 'octile';

/** Which comparison pane a run belongs to. */
export type PaneId = 'A' | 'B';

/** Convert a cell to the continuous coordinates of its center. */
export function cellCenter(c: Cell): Vec2 {
  return { x: c.x + 0.5, y: c.y + 0.5 };
}

/** Row-major index of cell (x, y) in a grid of the given width. */
export function cellIndex(x: number, y: number, width: number): number {
  return y * width + x;
}
