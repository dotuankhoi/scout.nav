/**
 * The planner contract every algorithm module implements, plus the
 * trace-event model that decouples algorithms from rendering.
 *
 * Planners are pure functions of their input: they run to completion
 * (inside a Web Worker) and emit an ordered list of {@link TraceEvent}s.
 * The UI replays those events at any speed, forwards or backwards,
 * without ever touching algorithm code — this is what makes playback,
 * heatmaps and the Algorithm Inspector possible.
 */

import type { AlgorithmId, Cell, GridMap, HeuristicId, Vec2 } from '@/types';

/** Everything a planner needs to run. */
export interface PlannerInput {
  map: GridMap;
  start: Cell;
  goal: Cell;
  options: PlannerOptions;
}

/** User-tunable planning options (grid and sampling planners). */
export interface PlannerOptions {
  /** Allow 8-connected motion (diagonals never cut obstacle corners). */
  allowDiagonal: boolean;
  /** Distance heuristic for informed searches. */
  heuristic: HeuristicId;
  /** Heuristic inflation factor (1 = admissible, >1 = greedier). */
  heuristicWeight: number;
  /** Sampling-planner parameters (RRT / RRT*). */
  rrt: RrtOptions;
}

export interface RrtOptions {
  /** Maximum sampling iterations before giving up. */
  maxIterations: number;
  /** Maximum tree-extension step, in cells. */
  stepSize: number;
  /** Probability of sampling the goal directly (goal bias). */
  goalBias: number;
  /** Distance (cells) at which the goal counts as reached. */
  goalRadius: number;
  /** Neighbor radius for RRT* choose-parent / rewire, in cells. */
  rewireRadius: number;
  /** PRNG seed — identical seeds replay identical trees. */
  seed: number;
}

/** Why a sampled point / extension was rejected (sampling planners). */
export type RejectReason = 'collision' | 'outOfBounds' | 'duplicate';

/** Free-form structured details attached to events for the Inspector. */
export type EventExtra = Record<string, number | string | boolean>;

/**
 * One atomic step of a planner's execution.
 *
 * Grid searches emit `current` / `open` / `update` / `close`;
 * sampling planners emit `sample` / `treeNode` / `reject` / `rewire`.
 * Every run ends with either `path` or `noPath`.
 */
export type TraceEvent =
  /** A node was popped from the frontier and is being expanded. */
  | {
      type: 'current';
      node: Cell;
      g: number;
      h: number;
      f: number;
      openSize: number;
      extra?: EventExtra;
    }
  /** A node was discovered and pushed onto the open set. */
  | {
      type: 'open';
      node: Cell;
      g: number;
      h: number;
      f: number;
      parent: Cell | null;
      extra?: EventExtra;
    }
  /** An open node was re-parented with a cheaper cost. */
  | {
      type: 'update';
      node: Cell;
      g: number;
      h: number;
      f: number;
      parent: Cell;
      extra?: EventExtra;
    }
  /** A node was finalized (moved to the closed set). */
  | { type: 'close'; node: Cell }
  /** A random configuration was sampled (RRT family). */
  | { type: 'sample'; point: Vec2; goalBiased: boolean }
  /** A new node was wired into the tree. */
  | { type: 'treeNode'; index: number; point: Vec2; parent: number; cost: number }
  /** A sample or extension was discarded. */
  | { type: 'reject'; point: Vec2; from?: Vec2; reason: RejectReason }
  /** RRT* re-routed an existing node through a cheaper parent. */
  | {
      type: 'rewire';
      index: number;
      point: Vec2;
      oldParent: number;
      newParent: number;
      saving: number;
    }
  /** The goal region was connected to the tree / search. */
  | { type: 'goalReached'; cost: number }
  /** Final path (continuous points, cell units). */
  | { type: 'path'; points: Vec2[]; cost: number }
  /** Search exhausted without reaching the goal. */
  | { type: 'noPath'; reason: string };

/** Metrics captured during a run (populated by the planner + worker). */
export interface RunStats {
  algorithm: AlgorithmId;
  /** Wall-clock planning time, milliseconds (measured in the worker). */
  timeMs: number;
  /** Nodes expanded (grid) / tree nodes added (sampling). */
  nodesExpanded: number;
  /** Nodes generated / samples drawn. */
  nodesGenerated: number;
  /** Peak size of the open set / tree. */
  maxOpenSize: number;
  pathFound: boolean;
  /** Geometric path length in cell units, if found. */
  pathLength: number | null;
  /** Path cost in the planner's own metric, if found. */
  pathCost: number | null;
  /** Cost of the optimal grid path (Dijkstra reference), if reachable. */
  optimalCost: number | null;
  /** optimalCost / pathCost ∈ (0, 1]; 1 means provably optimal. */
  optimality: number | null;
  /** Rough estimate of peak working-set memory, bytes. */
  memoryBytes: number;
  /** Sampling iterations used (RRT family only). */
  iterations: number | null;
  /** Open-set size sampled at every expansion — frontier timeline chart. */
  frontier: number[];
}

/** What a planner returns. */
export interface PlannerResult {
  events: TraceEvent[];
  path: Vec2[] | null;
  stats: RunStats;
}

/**
 * Common interface implemented by every algorithm module.
 * Implementations must be pure and renderer-agnostic.
 */
export interface PathPlanner {
  readonly id: AlgorithmId;
  findPath(input: PlannerInput): PlannerResult;
}

/** A completed run as consumed by the UI (result + provenance). */
export interface RunResult {
  algorithm: AlgorithmId;
  events: TraceEvent[];
  path: Vec2[] | null;
  stats: RunStats;
}
