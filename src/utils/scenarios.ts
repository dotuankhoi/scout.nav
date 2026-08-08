/**
 * Engineering scenarios — procedurally generated worlds that frame path
 * planning as a real robotics problem instead of an abstract grid.
 *
 * Each scenario builds occupancy + terrain layers, places a mission
 * (start → goal), and suggests the algorithm match-up that teaches the
 * scenario's engineering lesson. Every generated world is verified
 * solvable (BFS), with a corridor-carving fallback so a mission can
 * never be born impossible.
 */

import type { AlgorithmId, Cell } from '@/types';
import { cellIndex } from '@/types';
import { mulberry32, randInt, randomSeed, type Rng } from './rng';
import { generateMaze } from './maze';

export type ScenarioId =
  | 'sandbox'
  | 'warehouse'
  | 'mars'
  | 'rescue'
  | 'hospital'
  | 'city'
  | 'maze';

export interface ScenarioWorld {
  width: number;
  height: number;
  cells: Uint8Array;
  terrain: Uint8Array;
  start: Cell;
  goal: Cell;
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  emoji: string;
  /** One-line hook shown on the scenario card. */
  blurb: string;
  /** The engineering mission, in plain language. */
  mission: string;
  /** Why the suggested algorithms are the interesting match-up here. */
  lesson: string;
  width: number;
  height: number;
  suggestedA: AlgorithmId;
  suggestedB: AlgorithmId;
  suggestCompare: boolean;
  generate: (seed: number) => ScenarioWorld;
}

// Terrain ids (see TERRAIN_TYPES): 0 clear · 1 rough · 2 sand · 3 hazard.
const ROUGH = 1;
const SAND = 2;
const HAZARD = 3;

// ---------------------------------------------------------------- helpers

function blank(width: number, height: number): { cells: Uint8Array; terrain: Uint8Array } {
  return {
    cells: new Uint8Array(width * height),
    terrain: new Uint8Array(width * height),
  };
}

function inb(w: number, h: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

function fillRect(
  cells: Uint8Array,
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  value: number,
): void {
  for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
      cells[y * w + x] = value;
    }
  }
}

function clearAround(world: ScenarioWorld, c: Cell, radius = 1): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (inb(world.width, world.height, x, y)) {
        world.cells[cellIndex(x, y, world.width)] = 0;
      }
    }
  }
}

/** Smooth value noise in [0, 1] via bilinear interpolation of a coarse lattice. */
function valueNoise(rng: Rng, w: number, h: number, scale: number): Float32Array {
  const gw = Math.ceil(w / scale) + 2;
  const gh = Math.ceil(h / scale) + 2;
  const lattice = new Float32Array(gw * gh);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const out = new Float32Array(w * h);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / scale;
      const gy = y / scale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = smooth(gx - x0);
      const fy = smooth(gy - y0);
      const v00 = lattice[y0 * gw + x0];
      const v10 = lattice[y0 * gw + x0 + 1];
      const v01 = lattice[(y0 + 1) * gw + x0];
      const v11 = lattice[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] =
        v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
    }
  }
  return out;
}

/** BFS reachability between start and goal on the occupancy layer. */
function isSolvable(world: ScenarioWorld): boolean {
  const { width: w, height: h, cells, start, goal } = world;
  if (cells[cellIndex(start.x, start.y, w)] === 1) return false;
  if (cells[cellIndex(goal.x, goal.y, w)] === 1) return false;
  const seen = new Uint8Array(w * h);
  const queue = [cellIndex(start.x, start.y, w)];
  seen[queue[0]] = 1;
  const goalIdx = cellIndex(goal.x, goal.y, w);
  while (queue.length > 0) {
    const i = queue.pop() as number;
    if (i === goalIdx) return true;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inb(w, h, nx, ny)) continue;
      const ni = ny * w + nx;
      if (!seen[ni] && cells[ni] === 0) {
        seen[ni] = 1;
        queue.push(ni);
      }
    }
  }
  return false;
}

/** Last-resort fallback: carve an L-shaped corridor start → goal. */
function carveCorridor(world: ScenarioWorld): void {
  const { width: w, cells, start, goal } = world;
  const step = (x: number, y: number) => {
    cells[cellIndex(x, y, w)] = 0;
    if (inb(w, world.height, x, y + 1)) cells[cellIndex(x, y + 1, w)] = 0;
  };
  let x = start.x;
  let y = start.y;
  while (x !== goal.x) {
    x += Math.sign(goal.x - x);
    step(x, y);
  }
  while (y !== goal.y) {
    y += Math.sign(goal.y - y);
    step(x, y);
  }
}

/** Generate with solvability retries, then a carve fallback. */
function solvable(gen: (seed: number) => ScenarioWorld): (seed: number) => ScenarioWorld {
  return (seed: number) => {
    let world = gen(seed);
    for (let attempt = 1; attempt <= 8 && !isSolvable(world); attempt++) {
      world = gen(seed + attempt * 7919);
    }
    if (!isSolvable(world)) carveCorridor(world);
    clearAround(world, world.start);
    clearAround(world, world.goal);
    return world;
  };
}

// ------------------------------------------------------------- generators

/**
 * Warehouse: long shelf racks with cross-aisles, stray pallets, a
 * charging dock on the left and pick stations on the right.
 */
function genWarehouse(seed: number): ScenarioWorld {
  const w = 56;
  const h = 34;
  const rng = mulberry32(seed);
  const { cells, terrain } = blank(w, h);

  // Shelf racks: 2 rows tall, spanning most of the width, every 4th row.
  for (let y = 4; y < h - 4; y += 4) {
    for (let x = 5; x < w - 7; x++) {
      // Cross-aisle gaps every 12 columns (2 cells wide).
      if ((x - 5) % 12 >= 10) continue;
      cells[cellIndex(x, y, w)] = 1;
      cells[cellIndex(x, y + 1, w)] = 1;
    }
  }
  // Stray pallets left in aisles (the messy reality of warehouses).
  for (let i = 0; i < 14; i++) {
    const x = 5 + randInt(rng, w - 12);
    const y = randInt(rng, h);
    if (cells[cellIndex(x, y, w)] === 0) cells[cellIndex(x, y, w)] = 1;
  }
  // Charging dock (start) and a randomly assigned pick station (goal).
  const start: Cell = { x: 1, y: 2 + randInt(rng, h - 4) };
  const stations = [6, 14, 22, 30].filter((y) => y < h - 2);
  const goal: Cell = { x: w - 2, y: stations[randInt(rng, stations.length)] };
  return { width: w, height: h, cells, terrain, start, goal };
}

/**
 * Mars rover: value-noise terrain (rough regolith, sand traps), impact
 * craters with hazardous slopes. Distance is cheap — energy is not.
 */
function genMars(seed: number): ScenarioWorld {
  const w = 60;
  const h = 38;
  const rng = mulberry32(seed);
  const { cells, terrain } = blank(w, h);

  const noise = valueNoise(rng, w, h, 7);
  for (let i = 0; i < terrain.length; i++) {
    const n = noise[i];
    terrain[i] = n > 0.74 ? SAND : n > 0.56 ? ROUGH : 0;
  }
  // Impact craters: obstacle rim, hazardous interior slope.
  const craters = 6 + randInt(rng, 4);
  for (let c = 0; c < craters; c++) {
    const cx = 4 + randInt(rng, w - 8);
    const cy = 4 + randInt(rng, h - 8);
    const r = 2 + randInt(rng, 3);
    for (let y = cy - r - 1; y <= cy + r + 1; y++) {
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        if (!inb(w, h, x, y)) continue;
        const d = Math.hypot(x - cx, y - cy);
        const i = cellIndex(x, y, w);
        if (Math.abs(d - r) < 0.75) cells[i] = 1;
        else if (d < r) terrain[i] = HAZARD;
      }
    }
  }
  const start: Cell = { x: 2, y: 2 };
  const goal: Cell = { x: w - 3, y: h - 3 };
  return { width: w, height: h, cells, terrain, start, goal };
}

/**
 * Search & rescue: a partially collapsed building — interior walls with
 * narrow gaps, rubble piles that slow the robot. The victim is deep inside.
 */
function genRescue(seed: number): ScenarioWorld {
  const w = 52;
  const h = 34;
  const rng = mulberry32(seed);
  const { cells, terrain } = blank(w, h);

  // Building shell with an entry breach on the left.
  fillRect(cells, w, h, 0, 0, w - 1, 0, 1);
  fillRect(cells, w, h, 0, h - 1, w - 1, h - 1, 1);
  fillRect(cells, w, h, 0, 0, 0, h - 1, 1);
  fillRect(cells, w, h, w - 1, 0, w - 1, h - 1, 1);
  const entryY = 3 + randInt(rng, h - 6);
  cells[cellIndex(0, entryY, w)] = 0;
  cells[cellIndex(0, entryY + 1, w)] = 0;

  // Interior walls, each with at least one narrow gap.
  for (let x = 8; x < w - 4; x += 8) {
    const gap = 2 + randInt(rng, h - 6);
    for (let y = 1; y < h - 1; y++) {
      if (Math.abs(y - gap) <= 1) continue;
      cells[cellIndex(x, y, w)] = 1;
    }
  }
  for (let y = 8; y < h - 4; y += 9) {
    const gap = 2 + randInt(rng, w - 6);
    for (let x = 1; x < w - 1; x++) {
      if (Math.abs(x - gap) <= 1) continue;
      if (cells[cellIndex(x, y, w)] === 0 && rng() < 0.8) cells[cellIndex(x, y, w)] = 1;
    }
  }
  // Rubble: obstacle cores ringed by slow debris.
  for (let c = 0; c < 12; c++) {
    const cx = 3 + randInt(rng, w - 6);
    const cy = 3 + randInt(rng, h - 6);
    const r = 1 + randInt(rng, 2);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!inb(w, h, x, y) || x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
        const d = Math.hypot(x - cx, y - cy);
        const i = cellIndex(x, y, w);
        if (d < r * 0.5 && rng() < 0.7) cells[i] = 1;
        else if (d <= r) terrain[i] = ROUGH;
      }
    }
  }
  const start: Cell = { x: 1, y: entryY };
  const goal: Cell = { x: w - 4, y: rng() < 0.5 ? 3 : h - 4 };
  return { width: w, height: h, cells, terrain, start, goal };
}

/**
 * Hospital delivery: rooms off corridors, doorways, and emergency zones
 * the robot should route around unless there is no other way.
 */
function genHospital(seed: number): ScenarioWorld {
  const w = 56;
  const h = 32;
  const rng = mulberry32(seed);
  const { cells, terrain } = blank(w, h);

  const roomW = 9;
  const roomH = 8;
  // Wall lattice forming rooms; corridors run along the wall lines.
  for (let x = roomW; x < w - 2; x += roomW) {
    for (let y = 0; y < h; y++) cells[cellIndex(x, y, w)] = 1;
  }
  for (let y = roomH; y < h - 2; y += roomH) {
    for (let x = 0; x < w; x++) cells[cellIndex(x, y, w)] = 1;
  }
  // Punch doorways: two per wall segment, plus corridor intersections.
  for (let x = roomW; x < w - 2; x += roomW) {
    for (let gy = 0; gy < h; gy += roomH) {
      const dy = gy + 2 + randInt(rng, Math.max(1, roomH - 4));
      if (dy < h) cells[cellIndex(x, dy, w)] = 0;
    }
  }
  for (let y = roomH; y < h - 2; y += roomH) {
    for (let gx = 0; gx < w; gx += roomW) {
      const dx = gx + 2 + randInt(rng, Math.max(1, roomW - 4));
      if (dx < w) cells[cellIndex(dx, y, w)] = 0;
    }
  }
  // Emergency zones: hazard-cost floors in two random rooms.
  for (let z = 0; z < 2; z++) {
    const rx = randInt(rng, Math.floor(w / roomW)) * roomW;
    const ry = randInt(rng, Math.floor(h / roomH)) * roomH;
    for (let y = ry + 1; y < Math.min(h, ry + roomH); y++) {
      for (let x = rx + 1; x < Math.min(w, rx + roomW); x++) {
        const i = cellIndex(x, y, w);
        if (cells[i] === 0) terrain[i] = HAZARD;
      }
    }
  }
  const start: Cell = { x: 2, y: 2 };
  const goal: Cell = { x: w - 3, y: h - 3 };
  return { width: w, height: h, cells, terrain, start, goal };
}

/**
 * City flood response: a road grid between building blocks; flooded
 * streets are slow-but-passable, closures are hard blocks. The classic
 * monsoon-season inspection-robot problem.
 */
function genCity(seed: number): ScenarioWorld {
  const w = 60;
  const h = 36;
  const rng = mulberry32(seed);
  const { cells, terrain } = blank(w, h);

  const blockW = 7;
  const blockH = 5;
  const roadW = 2;
  // Building blocks.
  for (let by = 0; by + blockH <= h; by += blockH + roadW) {
    for (let bx = 0; bx + blockW <= w; bx += blockW + roadW) {
      fillRect(cells, w, h, bx, by, bx + blockW - 1, by + blockH - 1, 1);
    }
  }
  // Flooded street sections (hazard terrain on road cells).
  const floods = 7 + randInt(rng, 5);
  for (let f = 0; f < floods; f++) {
    const cx = randInt(rng, w);
    const cy = randInt(rng, h);
    const r = 2 + randInt(rng, 4);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!inb(w, h, x, y)) continue;
        const i = cellIndex(x, y, w);
        if (cells[i] === 0 && Math.hypot(x - cx, y - cy) <= r) terrain[i] = HAZARD;
      }
    }
  }
  // Road closures: short hard blocks dropped on streets.
  for (let c = 0; c < 6; c++) {
    const x = randInt(rng, w);
    const y = randInt(rng, h);
    if (cells[cellIndex(x, y, w)] === 0) {
      fillRect(cells, w, h, x, y, x + 1, y + 1, 1);
    }
  }
  const start: Cell = { x: 0, y: h - 1 };
  const goal: Cell = { x: w - 1, y: 0 };
  return { width: w, height: h, cells, terrain, start, goal };
}

// ---------------------------------------------------------------- catalog

export const SCENARIOS: Record<ScenarioId, Scenario> = {
  sandbox: {
    id: 'sandbox',
    name: 'Open Sandbox',
    emoji: '🧪',
    blurb: 'A blank world — draw anything, test everything.',
    mission:
      'Free experimentation. Draw obstacles, drag the robot and the goal, and study how each planner responds.',
    lesson: 'Start here to learn the tools, then graduate to an engineering scenario.',
    width: 48,
    height: 30,
    suggestedA: 'astar',
    suggestedB: 'dijkstra',
    suggestCompare: false,
    generate: solvable((seed) => {
      const w = 48;
      const h = 30;
      const rng = mulberry32(seed);
      const { cells, terrain } = blank(w, h);
      for (let i = 0; i < cells.length; i++) cells[i] = rng() < 0.24 ? 1 : 0;
      return {
        width: w,
        height: h,
        cells,
        terrain,
        start: { x: 4, y: 15 },
        goal: { x: 43, y: 15 },
      };
    }),
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse Robot',
    emoji: '📦',
    blurb: 'Fetch from the racks — Amazon-Robotics style.',
    mission:
      'An AMR must travel from its charging dock, through long shelf aisles and past stray pallets, to a pick station on the far wall.',
    lesson:
      'Structured aisles make heuristics shine: watch A* thread the aisles while Dijkstra floods every rack. This gap is why warehouse fleets run informed search.',
    width: 56,
    height: 34,
    suggestedA: 'astar',
    suggestedB: 'dijkstra',
    suggestCompare: true,
    generate: solvable(genWarehouse),
  },
  mars: {
    id: 'mars',
    name: 'Mars Rover',
    emoji: '🔴',
    blurb: 'Distance is cheap. Energy is not.',
    mission:
      'Drive the rover across regolith to a sampling site. Sand traps and crater slopes multiply energy cost — the shortest line is rarely the cheapest drive.',
    lesson:
      'Grid planners read the terrain layer and detour around sand; RRT* is terrain-blind and happily plows through it. Compare their routes to see why cost-aware planning matters off-road.',
    width: 60,
    height: 38,
    suggestedA: 'astar',
    suggestedB: 'rrtstar',
    suggestCompare: true,
    generate: solvable(genMars),
  },
  rescue: {
    id: 'rescue',
    name: 'Search & Rescue',
    emoji: '🚨',
    blurb: 'A collapsed building. A victim. Narrow gaps.',
    mission:
      'Enter through the breach and reach the victim deep inside a collapsed structure. Interior walls leave only narrow gaps; rubble slows every wheel turn.',
    lesson:
      'Narrow passages are the classic failure mode of random sampling — RRT struggles to sample inside tight gaps that A* walks straight through. Run both and watch it happen.',
    width: 52,
    height: 34,
    suggestedA: 'astar',
    suggestedB: 'rrt',
    suggestCompare: true,
    generate: solvable(genRescue),
  },
  hospital: {
    id: 'hospital',
    name: 'Hospital Delivery',
    emoji: '🏥',
    blurb: 'Deliver medicine. Avoid the ER unless you must.',
    mission:
      'A delivery robot carries medication from the pharmacy to a ward, navigating corridors and doorways. Emergency zones are passable but heavily penalized.',
    lesson:
      'Soft constraints as terrain cost: the robot may cross an emergency zone, but only when every corridor is worse. Theta* adds smooth, doorway-friendly motion versus A*’s grid staircases.',
    width: 56,
    height: 32,
    suggestedA: 'thetastar',
    suggestedB: 'astar',
    suggestCompare: true,
    generate: solvable(genHospital),
  },
  city: {
    id: 'city',
    name: 'City Flood Response',
    emoji: '🌊',
    blurb: 'Monsoon season. Closed roads. Flooded streets.',
    mission:
      'An inspection robot crosses a city road grid after a storm. Flooded streets are slow but passable; road closures are hard blocks. Reach the far district.',
    lesson:
      'The urban replanning story: D* Lite is built for worlds that change under the robot. Edit a closure mid-mission with live replan on, and compare against A* recomputing from scratch.',
    width: 60,
    height: 36,
    suggestedA: 'dstar',
    suggestedB: 'astar',
    suggestCompare: true,
    generate: solvable(genCity),
  },
  maze: {
    id: 'maze',
    name: 'Maze Escape',
    emoji: '🌀',
    blurb: 'The classic — one long winding answer.',
    mission: 'Escape a procedurally generated maze. There are few routes, and all of them are long.',
    lesson:
      'Mazes neutralize heuristics (the straight-line estimate is wildly wrong) and starve samplers of open space. A humbling benchmark for every planner.',
    width: 48,
    height: 30,
    suggestedA: 'astar',
    suggestedB: 'rrt',
    suggestCompare: true,
    generate: solvable((seed) => {
      const w = 48;
      const h = 30;
      const { cells, terrain } = blank(w, h);
      // Local import avoided: inline recursive backtracker via maze util.
      return {
        width: w,
        height: h,
        cells: mazeCells(w, h, seed),
        terrain,
        start: { x: 1, y: 1 },
        goal: { x: w - 2, y: h - 2 },
      };
    }),
  },
};

function mazeCells(w: number, h: number, seed: number): Uint8Array {
  return generateMaze(w, h, { x: 1, y: 1 }, { x: w - 2, y: h - 2 }, seed);
}

export const SCENARIO_LIST: Scenario[] = [
  SCENARIOS.sandbox,
  SCENARIOS.warehouse,
  SCENARIOS.mars,
  SCENARIOS.rescue,
  SCENARIOS.hospital,
  SCENARIOS.city,
  SCENARIOS.maze,
];

/** Generate a fresh world for a scenario with a random seed. */
export function generateScenario(id: ScenarioId, seed = randomSeed()): ScenarioWorld {
  return SCENARIOS[id].generate(seed);
}
