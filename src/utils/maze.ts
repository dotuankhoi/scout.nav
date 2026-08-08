/**
 * Procedural map generators: uniform random obstacles and a
 * recursive-backtracker maze.
 */

import type { Cell, GridMap } from '@/types';
import { cellIndex } from '@/types';
import { mulberry32, randInt, randomSeed, type Rng } from './rng';

/** Clear cells around the start/goal so generated maps stay solvable-ish. */
function clearAround(cells: Uint8Array, width: number, height: number, c: Cell, radius = 1): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (x >= 0 && y >= 0 && x < width && y < height) {
        cells[cellIndex(x, y, width)] = 0;
      }
    }
  }
}

/**
 * Scatter obstacles uniformly at the given density ∈ [0, 1].
 * Start and goal neighborhoods are kept clear.
 */
export function randomObstacles(
  width: number,
  height: number,
  density: number,
  start: Cell,
  goal: Cell,
  seed = randomSeed(),
): Uint8Array {
  const rng = mulberry32(seed);
  const cells = new Uint8Array(width * height);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = rng() < density ? 1 : 0;
  }
  clearAround(cells, width, height, start);
  clearAround(cells, width, height, goal);
  return cells;
}

/**
 * Perfect maze via recursive backtracking on a lattice of odd cells,
 * then a few random wall removals so multiple routes exist (more
 * interesting for comparing planners).
 */
export function generateMaze(
  width: number,
  height: number,
  start: Cell,
  goal: Cell,
  seed = randomSeed(),
): Uint8Array {
  const rng: Rng = mulberry32(seed);
  const cells = new Uint8Array(width * height).fill(1);

  // Carve on odd coordinates.
  const cols = Math.max(1, Math.floor((width - 1) / 2));
  const rows = Math.max(1, Math.floor((height - 1) / 2));
  const visited = new Uint8Array(cols * rows);
  const stack: Array<[number, number]> = [[0, 0]];
  visited[0] = 1;
  const carve = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < width && y < height) cells[cellIndex(x, y, width)] = 0;
  };
  carve(1, 1);

  const DIRS: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (stack.length > 0) {
    const [cx, cy] = stack[stack.length - 1];
    const options: Array<[number, number]> = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < cols && ny < rows && !visited[ny * cols + nx]) {
        options.push([dx, dy]);
      }
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [dx, dy] = options[randInt(rng, options.length)];
    const nx = cx + dx;
    const ny = cy + dy;
    visited[ny * cols + nx] = 1;
    // Knock through the wall between (cx,cy) and (nx,ny).
    carve(1 + cx * 2 + dx, 1 + cy * 2 + dy);
    carve(1 + nx * 2, 1 + ny * 2);
    stack.push([nx, ny]);
  }

  // Imperfect maze: remove a handful of extra walls to create loops.
  const removals = Math.floor(cols * rows * 0.08);
  for (let i = 0; i < removals; i++) {
    const x = 1 + randInt(rng, Math.max(1, width - 2));
    const y = 1 + randInt(rng, Math.max(1, height - 2));
    cells[cellIndex(x, y, width)] = 0;
  }

  clearAround(cells, width, height, start);
  clearAround(cells, width, height, goal);
  return cells;
}

/**
 * Flood-fill the connected obstacle blob containing (x, y).
 * Used by the move tool to drag whole obstacles.
 */
export function obstacleBlob(map: GridMap, x: number, y: number): Set<number> {
  const blob = new Set<number>();
  const startIdx = cellIndex(x, y, map.width);
  if (map.cells[startIdx] !== 1) return blob;
  const stack = [startIdx];
  blob.add(startIdx);
  while (stack.length > 0) {
    const i = stack.pop() as number;
    const cx = i % map.width;
    const cy = Math.floor(i / map.width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const ni = cellIndex(nx, ny, map.width);
      if (!blob.has(ni) && map.cells[ni] === 1) {
        blob.add(ni);
        stack.push(ni);
      }
    }
  }
  return blob;
}
