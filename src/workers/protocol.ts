/**
 * Message protocol between the UI thread and the planner Web Worker.
 */

import type { AlgorithmId, Cell } from '@/types';
import type { PlannerOptions, RunResult } from '@/algorithms/types';

export interface PlanRequest {
  id: number;
  algorithm: AlgorithmId;
  width: number;
  height: number;
  /** Occupancy buffer, transferred to the worker. */
  cells: ArrayBuffer;
  /** Terrain buffer, transferred to the worker. */
  terrain: ArrayBuffer;
  start: Cell;
  goal: Cell;
  options: PlannerOptions;
  /**
   * Benchmark mode: skip returning the (potentially huge) event trace —
   * only stats and the final path come back.
   */
  lean?: boolean;
}

export type PlanResponse =
  | { id: number; ok: true; result: RunResult }
  | { id: number; ok: false; error: string };
